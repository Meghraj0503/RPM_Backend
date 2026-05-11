const { TrainingCategory, TrainingModule, TrainingModuleCategory, TrainingSession, TrainingSessionProgress, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.getCategories = async (req, res) => {
    try {
        const categories = await TrainingCategory.findAll({ order: [['name', 'ASC']] });
        res.json(categories);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getModules = async (req, res) => {
    try {
        const { categories, q, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = { is_deleted: false, is_published: true };
        if (q) {
            where[Op.or] = [
                { title: { [Op.iLike]: `%${q}%` } },
                { short_description: { [Op.iLike]: `%${q}%` } },
                { full_description: { [Op.iLike]: `%${q}%` } }
            ];
        }

        const include = [{ model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] }];
        if (categories) {
            const catIds = categories.split(',').map(c => parseInt(c));
            include[0].where = { id: { [Op.in]: catIds } };
        }

        const modules = await TrainingModule.findAndCountAll({
            where,
            include,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
        });

        res.json({ total: modules.count, pages: Math.ceil(modules.count / limit), data: modules.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getModuleById = async (req, res) => {
    try {
        const result = await TrainingModule.findOne({
            where: { id: req.params.id, is_deleted: false, is_published: true },
            include: [
                { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] },
                { model: TrainingSession, as: 'sessions' }
            ],
            order: [[ { model: TrainingSession, as: 'sessions' }, 'order_index', 'ASC' ]]
        });
        if (!result) return res.status(404).json({ error: 'Not Found' });
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /progress ──────────────────────────────────────────────────────
   Returns per-module summary + per-session detail for the logged-in user.
─────────────────────────────────────────────────────────────────────── */
exports.getProgress = async (req, res) => {
    try {
        const userId = req.user.id;

        // All progress rows for this user with session info
        const progressRows = await TrainingSessionProgress.findAll({
            where: { user_id: userId },
            include: [{
                model: TrainingSession,
                attributes: ['id', 'module_id', 'title', 'order_index']
            }],
            order: [['updated_at', 'DESC']]
        });

        // Group by module_id
        const moduleMap = {};
        for (const p of progressRows) {
            const mId = p.training_session?.module_id;
            if (!mId) continue;
            if (!moduleMap[mId]) {
                moduleMap[mId] = {
                    module_id: mId,
                    total_time_spent_seconds: 0,
                    sessions_started: 0,
                    sessions_completed: 0,
                    sessions: []
                };
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

/* ── GET /modules/:id/progress ──────────────────────────────────────────
   Returns progress for a single module (all sessions) for the logged-in user.
─────────────────────────────────────────────────────────────────────── */
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
   Upsert rich progress for a session.

   Body:
   {
     "time_spent_seconds": 145,          // total time spent so far (cumulative)
     "mark_complete": false,             // force-mark session complete
     "content_progress": [               // per-topic updates (by index)
       { "index": 0, "type": "video",          "is_completed": true,  "time_spent_seconds": 90 },
       { "index": 1, "type": "audio",          "is_completed": false, "time_spent_seconds": 30 },
       { "index": 2, "type": "image",          "is_completed": true,  "time_spent_seconds": 5  },
       { "index": 3, "type": "article",        "is_completed": true,  "time_spent_seconds": 60 },
       { "index": 4, "type": "questionnaire",  "is_completed": true,  "time_spent_seconds": 45,
         "answers": { "q1": "Option A" }, "score": 80 }
     ]
   }

   Rules:
   - time_spent_seconds: always kept as max(existing, incoming) — never decrements
   - content_progress topics: merged by index; completed topics stay completed
   - is_completed auto-set true when all topics are completed OR mark_complete=true
─────────────────────────────────────────────────────────────────────── */
exports.updateSessionProgress = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { time_spent_seconds = 0, content_progress = [], mark_complete = false } = req.body;

        // Verify session exists
        const session = await TrainingSession.findByPk(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const [prog, created] = await TrainingSessionProgress.findOrCreate({
            where: { user_id: userId, session_id: sessionId },
            defaults: {
                time_spent_seconds: 0,
                content_progress: [],
                is_completed: false,
                completed_at: null
            }
        });

        // Merge time_spent: never go backwards
        const newTime = Math.max(prog.time_spent_seconds || 0, time_spent_seconds || 0);

        // Merge content_progress by topic index
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
                    // once completed always completed
                    is_completed: ex.is_completed || incoming.is_completed,
                    // time never decrements
                    time_spent_seconds: Math.max(ex.time_spent_seconds || 0, incoming.time_spent_seconds || 0)
                };
            }
        }

        // Sort by index
        merged.sort((a, b) => a.index - b.index);

        // Auto-complete: all incoming topics done OR explicit flag
        const allTopicsDone = merged.length > 0 && merged.every(t => t.is_completed);
        const shouldComplete = mark_complete || allTopicsDone;
        const wasAlreadyComplete = prog.is_completed;

        prog.time_spent_seconds = newTime;
        prog.content_progress = merged;
        if (shouldComplete && !wasAlreadyComplete) {
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

/* ── POST /sessions/:sessionId/complete (kept for backward compat) ──── */
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
