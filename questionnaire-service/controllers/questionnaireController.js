const { sequelize, UserQuestionnaire, QuestionnaireTemplate, Question, UserResponse, UserQuestionnaireScore } = require('../models');
const { Op } = require('sequelize');

// ─── Scoring Engine ───────────────────────────────────────────────────────────

const CELEBRATIONS_DOMAINS = [
    'Calm', 'Exercise', 'Love', 'Eat', 'Be Positive',
    'Rest', 'Accept', 'Team', 'Inspire', 'Observe', 'Nurture', 'Spiritual'
];

function getNumericValue(question, answer) {
    if (!answer) return null;
    // Numeric input or rating — use numeric field directly
    if (answer.response_value_numeric !== undefined && answer.response_value_numeric !== null) {
        return Number(answer.response_value_numeric);
    }
    const text = (answer.response_value_text || '').toLowerCase().trim();
    if (!text) return null;
    // Yes/No
    if (text === 'yes') return 1;
    if (text === 'no') return 0;
    const options = question.options_json;
    if (Array.isArray(options) && options.length > 0) {
        if (typeof options[0] === 'object' && options[0] !== null) {
            // Object format: [{ label: "Good", value: 2 }]
            const opt = options.find(o => String(o.label || o.text || o.value || '').toLowerCase() === text);
            if (opt && opt.value !== undefined) return Number(opt.value);
        } else {
            // Plain string format: ["Excellent", "Good", "Fair", "Poor"]
            // Use index as score value (0 = first option, 1 = second, ...)
            const idx = options.findIndex(o => String(o).toLowerCase() === text);
            if (idx !== -1) return idx;
        }
    }
    // Try to parse as number from text
    const n = parseFloat(text);
    return isNaN(n) ? null : n;
}

function scorePHQ9(questions, answerMap) {
    let total = 0;
    let answered = 0;
    for (const q of questions) {
        const val = getNumericValue(q, answerMap[q.id]);
        if (val !== null) { total += Math.max(0, Math.min(3, val)); answered++; }
    }
    const score = Math.min(27, total);
    let severity = 'Minimal';
    if (score >= 20) severity = 'Severe';
    else if (score >= 15) severity = 'Moderately Severe';
    else if (score >= 10) severity = 'Moderate';
    else if (score >= 5) severity = 'Mild';
    return {
        overall_score: score,
        domain_scores: { PHQ9_Total: score, Severity: severity, Questions_Answered: answered }
    };
}

function scorePSQI(questions, answerMap) {
    let total = 0;
    let maxPossible = 0;
    for (const q of questions) {
        const options = q.options_json;
        const maxOpt = Array.isArray(options)
            ? Math.max(...options.map(o => Number(o.value || 0)).filter(v => !isNaN(v)))
            : 3;
        maxPossible += maxOpt || 3;
        const val = getNumericValue(q, answerMap[q.id]);
        if (val !== null) total += Math.max(0, val);
    }
    // Normalize to 0-21 PSQI global range
    const psqiScore = maxPossible > 0 ? Math.round((total / maxPossible) * 21) : 0;
    const quality = psqiScore <= 5 ? 'Good Sleep Quality' : psqiScore <= 10 ? 'Moderate Disruption' : 'Poor Sleep Quality';
    return {
        overall_score: Math.min(21, psqiScore),
        domain_scores: { PSQI_Global: psqiScore, Sleep_Quality: quality, Raw_Sum: total }
    };
}

function scoreCELEBRATIONS(questions, answerMap) {
    const domainScores = {};
    const domainCounts = {};

    for (const q of questions) {
        // Domain can be stored in options_json as { domain: "Exercise" } or in question metadata
        const opts = q.options_json;
        const domain = (opts && !Array.isArray(opts) && opts.domain)
            ? opts.domain
            : CELEBRATIONS_DOMAINS[(q.sort_order || 0) % 12];

        const val = getNumericValue(q, answerMap[q.id]);
        if (val !== null) {
            domainScores[domain] = (domainScores[domain] || 0) + val;
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        }
    }

    // Normalize each domain to 0-100
    const normalizedDomains = {};
    for (const d of Object.keys(domainScores)) {
        const count = domainCounts[d];
        // Assume max value per question is 5 (configurable via options)
        const maxPerQ = 5;
        normalizedDomains[d] = Math.round((domainScores[d] / (count * maxPerQ)) * 100);
    }

    // Ensure all 12 CELEBRATIONS domains appear
    for (const d of CELEBRATIONS_DOMAINS) {
        if (normalizedDomains[d] === undefined) normalizedDomains[d] = 0;
    }

    const domainValues = Object.values(normalizedDomains);
    const overall = domainValues.length
        ? Math.round(domainValues.reduce((a, b) => a + b, 0) / domainValues.length)
        : 0;

    return { overall_score: overall, domain_scores: normalizedDomains };
}

function scoreGeneric(questions, answerMap) {
    let total = 0;
    let maxPossible = 0;
    const domainScores = {};

    for (const q of questions) {
        const opts = q.options_json;
        let maxOpt = 1;
        if (Array.isArray(opts) && opts.length > 0) {
            if (typeof opts[0] === 'object' && opts[0] !== null) {
                // Object format — use max value field
                const nums = opts.map(o => Number(o.value || 0)).filter(v => !isNaN(v));
                maxOpt = nums.length > 0 ? Math.max(...nums) : opts.length - 1;
            } else {
                // Plain string array — max index = length - 1
                maxOpt = opts.length - 1;
            }
        } else if (q.question_type === 'Rating' || q.question_type === 'rating') {
            maxOpt = 5; // default star/rating scale max
        } else if (q.question_type === 'numeric') {
            maxOpt = 100;
        }
        maxPossible += maxOpt || 1;

        const val = getNumericValue(q, answerMap[q.id]);
        if (val !== null) total += Math.max(0, val);
    }

    const overall = maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0;
    domainScores['Overall'] = overall;
    return { overall_score: overall, domain_scores: domainScores };
}

function computeScore(template, questions, answers) {
    const title = (template.title || '').toLowerCase();
    const category = (template.category || '').toLowerCase();
    const answerMap = {};
    for (const ans of answers) answerMap[ans.question_id] = ans;

    if (title.includes('phq') || category.includes('phq')) return scorePHQ9(questions, answerMap);
    if (title.includes('psqi') || category.includes('psqi') || title.includes('sleep quality')) return scorePSQI(questions, answerMap);
    if (title.includes('celebration') || category.includes('celebration')) return scoreCELEBRATIONS(questions, answerMap);
    return scoreGeneric(questions, answerMap);
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

exports.getQuestionnaires = async (req, res) => {
    const userId = req.user.id;
    try {
        const questionnaires = await UserQuestionnaire.findAll({
            where: { user_id: userId },
            include: [{
                model: QuestionnaireTemplate,
                attributes: ['title', 'category', 'type'],
                include: [{ model: Question, as: 'questions', attributes: ['id', 'question_text', 'question_type', 'options_json', 'sort_order'] }]
            }],
            order: [['created_at', 'DESC']]
        });

        const pending = questionnaires.filter(q => q.status === 'Pending' || q.status === 'Assigned');
        const completed = questionnaires.filter(q => q.status === 'Completed');
        // BUG-06 fix: expose Scheduled status as "upcoming" so users can see what's coming
        const upcoming = questionnaires.filter(q => q.status === 'Scheduled');

        res.json({ pending, completed, upcoming });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching questionnaires' });
    }
};

// MB-17: Questionnaire summary stats
exports.getQuestionnaireSummary = async (req, res) => {
    const userId = req.user.id;
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const [totalAssigned, totalCompleted, pendingToday] = await Promise.all([
            UserQuestionnaire.count({ where: { user_id: userId } }),
            UserQuestionnaire.count({ where: { user_id: userId, status: 'Completed' } }),
            UserQuestionnaire.count({
                where: {
                    user_id: userId,
                    status: 'Pending',
                    scheduled_for: { [Op.gte]: today, [Op.lt]: tomorrow }
                }
            })
        ]);

        const adherence = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
        res.json({ pending_today: pendingToday, total_completed: totalCompleted, total_assigned: totalAssigned, adherence_pct: adherence });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching summary' });
    }
};

// BUG-01 fix: save responses, compute real score, store domain scores
exports.submitQuestionnaire = async (req, res) => {
    const { id } = req.params;
    const { answers } = req.body; // [{ question_id, response_value_text, response_value_numeric }]

    if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ error: 'answers array is required' });
    }

    const transaction = await sequelize.transaction();
    try {
        const uq = await UserQuestionnaire.findByPk(id, {
            include: [{ model: QuestionnaireTemplate, include: [{ model: Question, as: 'questions' }] }]
        });
        if (!uq) return res.status(404).json({ error: 'Questionnaire not found' });
        if (uq.status === 'Completed') return res.status(409).json({ error: 'Already submitted' });

        // Delete any previous partial responses
        await UserResponse.destroy({ where: { user_questionnaire_id: id }, transaction });

        // Save all responses
        const responseRows = answers.map(ans => ({
            user_questionnaire_id: id,
            question_id: ans.question_id,
            response_value_text: ans.response_value_text || null,
            response_value_numeric: ans.response_value_numeric !== undefined ? ans.response_value_numeric : null
        }));
        await UserResponse.bulkCreate(responseRows, { transaction });

        // Compute score
        const template = uq.questionnaire_template;
        const questions = template ? template.questions || [] : [];
        const { overall_score, domain_scores } = computeScore(template || {}, questions, answers);

        // Update user_questionnaire
        uq.status = 'Completed';
        uq.completed_at = new Date();
        uq.overall_score = overall_score;
        await uq.save({ transaction });

        // Upsert domain scores
        await UserQuestionnaireScore.upsert({
            user_questionnaire_id: id,
            overall_score,
            domain_scores_json: domain_scores
        }, { transaction });

        await transaction.commit();
        res.json({ message: 'Questionnaire submitted successfully', overall_score, domain_scores });
    } catch (error) {
        await transaction.rollback();
        console.error(error);
        res.status(500).json({ error: 'Server error submitting questionnaire' });
    }
};

// MB-04: User views their questionnaire results
exports.getQuestionnaireResult = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const uq = await UserQuestionnaire.findOne({
            where: { id, user_id: userId, status: 'Completed' },
            include: [
                { model: QuestionnaireTemplate, attributes: ['title', 'category', 'type'] },
                { model: UserQuestionnaireScore, as: 'scores' }
            ]
        });
        if (!uq) return res.status(404).json({ error: 'Result not found' });

        // Also return the responses
        const responses = await UserResponse.findAll({ where: { user_questionnaire_id: id } });

        res.json({
            questionnaire_id: id,
            title: uq.questionnaire_template?.title,
            category: uq.questionnaire_template?.category,
            completed_at: uq.completed_at,
            overall_score: uq.overall_score,
            domain_scores: uq.scores?.domain_scores_json || {},
            responses
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching result' });
    }
};

// Admin CMS Dynamic Questionnaire Modifiers
exports.addQuestion = async (req, res) => {
    try {
        const question = await Question.create(req.body);
        res.status(201).json({ message: 'Question added dynamically. Will now appear in app.', question });
    } catch (e) { res.status(500).json({ error: 'Failed adding question' }); }
};

exports.updateQuestion = async (req, res) => {
    try {
        await Question.update(req.body, { where: { id: req.params.id } });
        res.json({ message: 'Question modified dynamically' });
    } catch (e) { res.status(500).json({ error: 'Failed modifying question' }); }
};

exports.deleteQuestion = async (req, res) => {
    try {
        await Question.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Question removed dynamically. Will disappear from app instantly.' });
    } catch (e) { res.status(500).json({ error: 'Failed deleting question' }); }
};
