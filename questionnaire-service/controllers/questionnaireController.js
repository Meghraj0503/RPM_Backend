const { UserQuestionnaire, QuestionnaireTemplate, Question, UserResponse } = require('../models');

exports.getQuestionnaires = async (req, res) => {
    const userId = req.user.id;
    try {
        // Fetch all except 'Scheduled' — those are not yet visible to the patient
        const questionnaires = await UserQuestionnaire.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: QuestionnaireTemplate,
                    attributes: ['title', 'category', 'type'],
                    include: [{ model: Question, as: 'questions', attributes: ['id', 'question_text', 'question_type', 'options_json', 'sort_order'] }]
                }
            ]
        });

        // 'Scheduled' entries are hidden from patient until the time comes
        const visible = questionnaires.filter(q => q.status !== 'Scheduled');
        const pending = visible.filter(q => q.status === 'Pending' || q.status === 'Assigned');
        const completed = visible.filter(q => q.status === 'Completed');

        res.json({ pending, completed });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching questionnaires' });
    }
};

exports.submitQuestionnaire = async (req, res) => {
    const { id } = req.params; 
    const { answers } = req.body; 
    
    try {
        const uq = await UserQuestionnaire.findByPk(id);
        if (!uq) return res.status(404).json({ error: 'Questionnaire not found' });

        const overallScore = Math.floor(Math.random() * 100);

        uq.status = 'Completed';
        uq.completed_at = new Date();
        uq.overall_score = overallScore;
        await uq.save();

        res.json({ message: 'Questionnaire submitted successfully', overallScore });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error submitting questionnaire' });
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
