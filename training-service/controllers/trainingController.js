const { TrainingCategory, TrainingModule, TrainingSession, TrainingSessionProgress } = require('../models');
const { Op } = require('sequelize');

exports.getCategories = async (_req, res) => {
    try {
        const categories = await TrainingCategory.findAll({ order: [['name', 'ASC']] });
        res.json(categories);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /home ──────────────────────────────────────────────────────────
   Screen 1: "Continue Learning" strip + categories + explore modules.
─────────────────────────────────────────────────────────────────────── */
exports.getHome = async (req, res) => {
    try {
        const userId = req.user.id;

        // ── Continue Learning: modules the user has started but not finished ──
        const progressRows = await TrainingSessionProgress.findAll({
            where: { user_id: userId },
            include: [{ model: TrainingSession, attributes: ['id', 'module_id'] }]
        });

        const moduleProgressMap = {};
        for (const p of progressRows) {
            const mId = p.training_session?.module_id;
            if (!mId) continue;
            if (!moduleProgressMap[mId]) moduleProgressMap[mId] = { completed: 0 };
            if (p.is_completed) moduleProgressMap[mId].completed += 1;
        }

        const inProgressModuleIds = Object.keys(moduleProgressMap);
        let continueLearning = [];

        if (inProgressModuleIds.length > 0) {
            const mods = await TrainingModule.findAll({
                where: { id: inProgressModuleIds, is_deleted: false, is_published: true },
                include: [
                    { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] },
                    { model: TrainingSession, as: 'sessions', attributes: ['id'] }
                ]
            });

            continueLearning = mods.map(m => {
                const plain = m.get({ plain: true });
                const total = plain.sessions?.length || 0;
                const completed = moduleProgressMap[m.id]?.completed || 0;
                const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
                return {
                    module_id: plain.id,
                    title: plain.title,
                    thumbnail_url: plain.thumbnail_url,
                    categories: plain.categories,
                    difficulty_level: plain.difficulty_level,
                    instructor_name: plain.instructor_name,
                    rating: plain.rating ? Number(plain.rating) : null,
                    duration_minutes: plain.duration_minutes,
                    total_sessions: total,
                    completed_sessions: completed,
                    completion_percentage: pct
                };
            }).filter(m => m.completion_percentage < 100);  // exclude fully done
        }

        // ── Categories ──
        const categories = await TrainingCategory.findAll({ order: [['name', 'ASC']] });

        // ── Explore: latest published modules ──
        const { page = 1, limit = 20, q, categories: catFilter, difficulty } = req.query;
        const offset = (page - 1) * limit;

        const where = { is_deleted: false, is_published: true };
        if (q) {
            where[Op.or] = [
                { title: { [Op.iLike]: `%${q}%` } },
                { short_description: { [Op.iLike]: `%${q}%` } }
            ];
        }
        if (difficulty && difficulty !== 'All Levels') where.difficulty_level = difficulty;

        const catInclude = { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] };
        if (catFilter && catFilter !== 'all') {
            const catIds = catFilter.split(',').map(c => parseInt(c));
            catInclude.where = { id: { [Op.in]: catIds } };
        }

        const modules = await TrainingModule.findAndCountAll({
            where,
            include: [catInclude],
            attributes: ['id', 'title', 'short_description', 'thumbnail_url', 'duration_minutes',
                         'difficulty_level', 'instructor_name', 'rating', 'students_count', 'created_at'],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true,
            subQuery: false
        });

        res.json({
            continue_learning: continueLearning,
            categories,
            explore: {
                total: modules.count,
                pages: Math.ceil(modules.count / limit),
                data: modules.rows.map(m => ({
                    ...m.get({ plain: true }),
                    rating: m.rating ? Number(m.rating) : null
                }))
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /modules ───────────────────────────────────────────────────── */
exports.getModules = async (req, res) => {
    try {
        const { categories, difficulty, q, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = { is_deleted: false, is_published: true };
        if (q) {
            where[Op.or] = [
                { title: { [Op.iLike]: `%${q}%` } },
                { short_description: { [Op.iLike]: `%${q}%` } },
                { full_description: { [Op.iLike]: `%${q}%` } }
            ];
        }
        if (difficulty && difficulty !== 'All Levels') where.difficulty_level = difficulty;

        const include = [{ model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] }];
        if (categories) {
            const catIds = categories.split(',').map(c => parseInt(c));
            include[0].where = { id: { [Op.in]: catIds } };
        }

        const modules = await TrainingModule.findAndCountAll({
            where, include,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true,
            subQuery: false
        });

        res.json({
            total: modules.count,
            pages: Math.ceil(modules.count / limit),
            data: modules.rows.map(m => ({
                ...m.get({ plain: true }),
                rating: m.rating ? Number(m.rating) : null
            }))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /modules/:id ───────────────────────────────────────────────────
   Screen 2 & 3: module detail with sections + lessons + user progress.

   Response shape:
   {
     id, title, short_description, full_description, thumbnail_url,
     rating, students_count, duration_minutes, instructor_name,
     difficulty_level, categories, learning_objectives,
     total_sections, total_lessons,
     user_progress: { completion_percentage, completed_sessions, total_sessions, total_time_spent_seconds },
     sections: [
       {
         session_id, title, order_index, duration_minutes,
         is_completed, time_spent_seconds,
         lessons: [
           { index, title, type, duration_minutes, is_completed, time_spent_seconds,
             answers?, score? }   // answers/score only for questionnaire type
         ]
       }
     ],
     more_from_category: [ { module_id, title, thumbnail_url, rating, difficulty_level, ... } ]
   }
─────────────────────────────────────────────────────────────────────── */
// Map admin topic types → normalized mobile types + extract a sensible lesson title
function normalizeTopic(topic, idx) {
    const typeMap = { articles: 'article', audio_video: 'audio_video' };
    const type = typeMap[topic.type] || topic.type || 'article';

    let title = topic.title; // admin may have set an explicit title
    if (!title) {
        if (topic.type === 'articles')    title = topic.data?.title || `Article ${idx + 1}`;
        else if (topic.type === 'audio_video') title = topic.data?.items?.[0]?.title || `Media ${idx + 1}`;
        else if (topic.type === 'image')  title = topic.data?.items?.[0]?.title || `Image ${idx + 1}`;
        else if (topic.type === 'questionnaire') title = `Questionnaire ${idx + 1}`;
        else title = `${type.charAt(0).toUpperCase() + type.slice(1)} ${idx + 1}`;
    }
    return { type, title };
}

exports.getModuleById = async (req, res) => {
    try {
        const userId = req.user.id;

        // ── Fetch module with sessions ordered correctly at top level ──
        const module = await TrainingModule.findOne({
            where: { id: req.params.id, is_deleted: false, is_published: true },
            include: [
                { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] },
                { model: TrainingSession, as: 'sessions' }
            ],
            order: [[ { model: TrainingSession, as: 'sessions' }, 'order_index', 'ASC' ]]
        });
        if (!module) return res.status(404).json({ error: 'Not Found' });

        const plain = module.get({ plain: true });
        const sessions = plain.sessions || [];

        // Load user's progress for all sessions in this module
        const sessionIds = sessions.map(s => s.id);
        const progressRows = sessionIds.length > 0
            ? await TrainingSessionProgress.findAll({
                where: { user_id: userId, session_id: { [Op.in]: sessionIds } }
              })
            : [];
        const progressBySession = {};
        for (const p of progressRows) progressBySession[p.session_id] = p;

        // Build sections (sessions) with lessons
        let totalLessons = 0;
        let completedSessions = 0;
        let totalTimeSpent = 0;

        const sectionsWithLessons = sessions.map(s => {
            const prog = progressBySession[s.id];
            if (prog?.is_completed) completedSessions++;
            totalTimeSpent += prog?.time_spent_seconds || 0;

            const topics = s.content_json?.topics || [];
            totalLessons += topics.length;

            const contentProgress = Array.isArray(prog?.content_progress) ? prog.content_progress : [];
            const progressByIndex = {};
            for (const cp of contentProgress) progressByIndex[cp.index] = cp;

            const lessons = topics.map((topic, idx) => {
                const topicProg = progressByIndex[idx] || {};
                const { type, title } = normalizeTopic(topic, idx);
                const lesson = {
                    index: idx,
                    title,
                    type,
                    duration_minutes: topic.duration_minutes || 0,
                    is_completed: topicProg.is_completed || false,
                    time_spent_seconds: topicProg.time_spent_seconds || 0
                };
                if (type === 'questionnaire' && topicProg.answers) {
                    lesson.answers = topicProg.answers;
                    lesson.score   = topicProg.score || null;
                }
                // For audio_video topics, include the media items list
                if (type === 'audio_video' && topic.data?.items) {
                    lesson.media_items = topic.data.items.map(it => ({
                        title:      it.title || '',
                        url:        it.url || '',
                        media_type: it.media_type || 'video',
                        duration:   it.duration || ''
                    }));
                }
                return lesson;
            });

            return {
                session_id: s.id,
                title: s.title,
                order_index: s.order_index,
                duration_minutes: s.duration_minutes || 0,
                is_completed: prog?.is_completed || false,
                time_spent_seconds: prog?.time_spent_seconds || 0,
                lessons
            };
        });

        const totalSessions = sessions.length;
        const completionPct = totalSessions > 0
            ? Math.round((completedSessions / totalSessions) * 100)
            : 0;

        // "More from same category" — up to 6 other modules sharing any category
        const catIds = plain.categories.map(c => c.id);
        let moreLikeThis = [];
        if (catIds.length > 0) {
            const others = await TrainingModule.findAll({
                where: { id: { [Op.ne]: plain.id }, is_deleted: false, is_published: true },
                include: [{
                    model: TrainingCategory, as: 'categories',
                    attributes: ['id', 'name'],
                    where: { id: { [Op.in]: catIds } }
                }],
                attributes: ['id', 'title', 'short_description', 'thumbnail_url',
                             'duration_minutes', 'difficulty_level', 'instructor_name',
                             'rating', 'students_count'],
                limit: 6,
                order: [['id', 'DESC']],   // id is always in SELECT — no subquery issue
                subQuery: false
            });
            moreLikeThis = others.map(m => ({
                ...m.get({ plain: true }),
                rating: m.rating ? Number(m.rating) : null
            }));
        }

        res.json({
            id: plain.id,
            title: plain.title,
            short_description: plain.short_description,
            full_description: plain.full_description,
            thumbnail_url: plain.thumbnail_url,
            rating: plain.rating ? Number(plain.rating) : null,
            students_count: plain.students_count || 0,
            duration_minutes: plain.duration_minutes || 0,
            instructor_name: plain.instructor_name || null,
            difficulty_level: plain.difficulty_level,
            categories: plain.categories,
            learning_objectives: plain.learning_objectives || [],
            total_sections: totalSessions,
            total_lessons: totalLessons,
            user_progress: {
                completion_percentage: completionPct,
                completed_sessions: completedSessions,
                total_sessions: totalSessions,
                total_time_spent_seconds: totalTimeSpent
            },
            sections: sectionsWithLessons,
            more_from_category: moreLikeThis
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /progress ──────────────────────────────────────────────────── */
exports.getProgress = async (req, res) => {
    try {
        const userId = req.user.id;

        const progressRows = await TrainingSessionProgress.findAll({
            where: { user_id: userId },
            include: [{ model: TrainingSession, attributes: ['id', 'module_id', 'title', 'order_index'] }],
            order: [['updated_at', 'DESC']]
        });

        const moduleMap = {};
        for (const p of progressRows) {
            const mId = p.training_session?.module_id;
            if (!mId) continue;
            if (!moduleMap[mId]) {
                moduleMap[mId] = { module_id: mId, total_time_spent_seconds: 0, sessions_started: 0, sessions_completed: 0, sessions: [] };
            }
            const m = moduleMap[mId];
            m.total_time_spent_seconds += (p.time_spent_seconds || 0);
            m.sessions_started += 1;
            if (p.is_completed) m.sessions_completed += 1;
            m.sessions.push({
                session_id: p.session_id,
                session_title: p.training_session?.title,
                order_index: p.training_session?.order_index,
                is_completed: p.is_completed,
                completed_at: p.completed_at,
                time_spent_seconds: p.time_spent_seconds || 0,
                content_progress: p.content_progress || []
            });
        }

        res.json({ modules: Object.values(moduleMap) });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /modules/:id/progress ──────────────────────────────────────── */
exports.getModuleProgress = async (req, res) => {
    try {
        const userId = req.user.id;
        const moduleId = req.params.id;

        const module = await TrainingModule.findOne({
            where: { id: moduleId, is_deleted: false, is_published: true },
            include: [{ model: TrainingSession, as: 'sessions', attributes: ['id', 'title', 'order_index'] }],
            order: [[ { model: TrainingSession, as: 'sessions' }, 'order_index', 'ASC' ]]
        });
        if (!module) return res.status(404).json({ error: 'Not Found' });

        const sessionIds = module.sessions.map(s => s.id);
        const progressRows = await TrainingSessionProgress.findAll({
            where: { user_id: userId, session_id: { [Op.in]: sessionIds } }
        });

        const progressBySession = {};
        for (const p of progressRows) progressBySession[p.session_id] = p;

        const totalSessions = module.sessions.length;
        let completedSessions = 0;
        let totalTimeSpent = 0;

        const sessions = module.sessions.map(s => {
            const p = progressBySession[s.id];
            if (p?.is_completed) completedSessions++;
            totalTimeSpent += p?.time_spent_seconds || 0;
            return {
                session_id: s.id,
                title: s.title,
                order_index: s.order_index,
                is_completed: p?.is_completed || false,
                completed_at: p?.completed_at || null,
                time_spent_seconds: p?.time_spent_seconds || 0,
                content_progress: p?.content_progress || []
            };
        });

        res.json({
            module_id: moduleId,
            total_sessions: totalSessions,
            completed_sessions: completedSessions,
            completion_percentage: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
            total_time_spent_seconds: totalTimeSpent,
            sessions
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── POST /sessions/:sessionId/progress ────────────────────────────────
   Body: { time_spent_seconds, mark_complete, content_progress: [
     { index, type, is_completed, time_spent_seconds, answers?, score? }
   ]}
─────────────────────────────────────────────────────────────────────── */
exports.updateSessionProgress = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { time_spent_seconds = 0, content_progress = [], mark_complete = false } = req.body;

        const session = await TrainingSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const [prog] = await TrainingSessionProgress.findOrCreate({
            where: { user_id: userId, session_id: parseInt(sessionId) },
            defaults: { time_spent_seconds: 0, content_progress: [], is_completed: false, completed_at: null }
        });

        const newTime = Math.max(prog.time_spent_seconds || 0, time_spent_seconds || 0);

        const existing = Array.isArray(prog.content_progress) ? prog.content_progress : [];
        const merged = [...existing];

        for (const incoming of content_progress) {
            const idx = merged.findIndex(t => t.index === incoming.index);
            if (idx === -1) {
                merged.push(incoming);
            } else {
                const ex = merged[idx];
                merged[idx] = {
                    ...ex,
                    ...incoming,
                    is_completed: ex.is_completed || incoming.is_completed,
                    time_spent_seconds: Math.max(ex.time_spent_seconds || 0, incoming.time_spent_seconds || 0)
                };
            }
        }
        merged.sort((a, b) => a.index - b.index);

        const allTopicsDone = merged.length > 0 && merged.every(t => t.is_completed);
        const shouldComplete = mark_complete || allTopicsDone;

        prog.time_spent_seconds = newTime;
        prog.content_progress = merged;
        if (shouldComplete && !prog.is_completed) {
            prog.is_completed = true;
            prog.completed_at = new Date();
        }
        await prog.save();

        res.json({
            session_id: parseInt(sessionId),
            is_completed: prog.is_completed,
            completed_at: prog.completed_at,
            time_spent_seconds: prog.time_spent_seconds,
            content_progress: prog.content_progress
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── POST /sessions/:sessionId/complete  (backward compat) ─────────── */
exports.markSessionComplete = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const [prog] = await TrainingSessionProgress.findOrCreate({
            where: { user_id: req.user.id, session_id: sessionId },
            defaults: { is_completed: true, completed_at: new Date(), time_spent_seconds: 0, content_progress: [] }
        });
        if (!prog.is_completed) {
            prog.is_completed = true;
            prog.completed_at = new Date();
            await prog.save();
        }
        res.json({ message: 'Session marked as completed', progress: prog });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
