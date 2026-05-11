const { TrainingCategory, TrainingModule, TrainingModuleCategory, TrainingSession, TrainingSessionProgress, User, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.getCategories = async (req, res) => {
    try {
        const categories = await TrainingCategory.findAll({ order: [['name', 'ASC']] });
        res.json(categories);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const [category, created] = await TrainingCategory.findOrCreate({ where: { name } });
        res.status(created ? 201 : 200).json(category);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createModule = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { title, short_description, full_description, duration_minutes, thumbnail_url,
                difficulty_level, instructor_name, learning_objectives, rating, students_count,
                category_ids, sessions, expiry_date } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const newModule = await TrainingModule.create({
            title, short_description, full_description, duration_minutes, thumbnail_url,
            difficulty_level, instructor_name: instructor_name || null,
            learning_objectives: learning_objectives || [],
            rating: rating || null, students_count: students_count || 0,
            expiry_date: expiry_date || null,
            created_by: req.user ? req.user.id : 'Admin Auto'
        }, { transaction: t });

        if (category_ids && category_ids.length > 0) {
            const mapped = category_ids.map(c => ({ module_id: newModule.id, category_id: c }));
            await TrainingModuleCategory.bulkCreate(mapped, { transaction: t });
        }

        if (sessions && sessions.length > 0) {
            const mappedSessions = sessions.map((s, idx) => ({
                module_id: newModule.id,
                title: s.title || `Unit ${idx + 1}`,
                content_json: s.content_json || { topics: [] },
                duration_minutes: s.duration_minutes || 0,
                order_index: idx
            }));
            await TrainingSession.bulkCreate(mappedSessions, { transaction: t });
        }

        await t.commit();
        res.status(201).json(newModule);
    } catch (e) {
        await t.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.getModules = async (req, res) => {
    try {
        const { page = 1, limit = 20, q, category_id, is_published } = req.query;
        const offset = (page - 1) * limit;

        const where = { is_deleted: false };
        if (is_published !== undefined) where.is_published = is_published === 'true';
        if (q) {
            where[Op.or] = [
                { title: { [Op.iLike]: `%${q}%` } },
                { short_description: { [Op.iLike]: `%${q}%` } }
            ];
        }

        const catInclude = { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] };
        if (category_id) catInclude.where = { id: category_id };

        const modules = await TrainingModule.findAndCountAll({
            where,
            include: [
                catInclude,
                { model: TrainingSession, as: 'sessions', attributes: ['id', 'title', 'content_json'] }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
        });

        const moduleIds = modules.rows.map(m => m.id);
        let progressMap = {};
        if (moduleIds.length > 0) {
            const rows = await sequelize.query(
                `SELECT ts.module_id,
                        COUNT(DISTINCT tsp.user_id) AS unique_users_with_progress,
                        COUNT(tsp.id) AS completed_session_count
                 FROM training_session_progress tsp
                 JOIN training_sessions ts ON ts.id = tsp.session_id
                 WHERE ts.module_id IN (:moduleIds) AND tsp.is_completed = TRUE
                 GROUP BY ts.module_id`,
                { replacements: { moduleIds }, type: sequelize.QueryTypes.SELECT }
            );
            rows.forEach(r => { progressMap[r.module_id] = r; });
        }

        const enriched = modules.rows.map(m => {
            const plain = m.get({ plain: true });
            const progress = progressMap[m.id] || { unique_users_with_progress: 0, completed_session_count: 0 };
            const totalSessions = plain.sessions?.length || 0;

            const contentTypes = new Set();
            (plain.sessions || []).forEach(s => {
                (s.content_json?.topics || []).forEach(t => {
                    if (t.type) contentTypes.add(t.type);
                });
            });

            return {
                ...plain,
                total_sessions: totalSessions,
                content_types: [...contentTypes],
                progress_stats: {
                    completed_sessions: parseInt(progress.completed_session_count),
                    unique_users: parseInt(progress.unique_users_with_progress)
                }
            };
        });

        res.json({ total: modules.count, pages: Math.ceil(modules.count / limit), data: enriched });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getModuleById = async (req, res) => {
    try {
        const result = await TrainingModule.findOne({
            where: { id: req.params.id, is_deleted: false },
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

exports.updateModule = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { title, short_description, full_description, duration_minutes, thumbnail_url,
                difficulty_level, instructor_name, learning_objectives, rating, students_count,
                category_ids, sessions, expiry_date } = req.body;

        const mod = await TrainingModule.findOne({ where: { id: req.params.id, is_deleted: false } });
        if (!mod) return res.status(404).json({ error: 'Not Found' });

        await mod.update({
            title, short_description, full_description,
            duration_minutes, thumbnail_url, difficulty_level,
            instructor_name: instructor_name !== undefined ? instructor_name : mod.instructor_name,
            learning_objectives: learning_objectives !== undefined ? learning_objectives : mod.learning_objectives,
            rating: rating !== undefined ? rating : mod.rating,
            students_count: students_count !== undefined ? students_count : mod.students_count,
            expiry_date: expiry_date !== undefined ? (expiry_date || null) : mod.expiry_date
        }, { transaction: t });

        if (category_ids !== undefined) {
            await TrainingModuleCategory.destroy({ where: { module_id: mod.id }, transaction: t });
            if (category_ids.length > 0) {
                await TrainingModuleCategory.bulkCreate(
                    category_ids.map(c => ({ module_id: mod.id, category_id: c })),
                    { transaction: t }
                );
            }
        }

        if (sessions !== undefined) {
            await TrainingSession.destroy({ where: { module_id: mod.id }, transaction: t });
            if (sessions.length > 0) {
                await TrainingSession.bulkCreate(
                    sessions.map((s, idx) => ({
                        module_id: mod.id,
                        title: s.title || `Unit ${idx + 1}`,
                        content_json: s.content_json || { topics: [] },
                        duration_minutes: s.duration_minutes || 0,
                        order_index: idx
                    })),
                    { transaction: t }
                );
            }
        }

        await t.commit();
        res.json({ message: 'Updated successfully' });
    } catch (e) {
        await t.rollback();
        res.status(500).json({ error: e.message });
    }
};

exports.togglePublish = async (req, res) => {
    try {
        const mod = await TrainingModule.findOne({ where: { id: req.params.id, is_deleted: false } });
        if (!mod) return res.status(404).json({ error: 'Not found' });
        mod.is_published = !mod.is_published;
        await mod.save();
        res.json({ message: mod.is_published ? 'Published' : 'Unpublished', is_published: mod.is_published });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteModule = async (req, res) => {
    try {
        const mod = await TrainingModule.findOne({ where: { id: req.params.id } });
        if (!mod) return res.status(404).json({ error: 'Not found' });
        mod.is_deleted = true;
        await mod.save();
        res.json({ message: 'Deleted successfully' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /training/users/:userId/progress ───────────────────────────────
   Returns ALL published modules for this user with full detail:
   - Modules not yet started → status: "not_started"
   - Modules in progress    → status: "in_progress"
   - Modules fully done     → status: "completed"
   - Per-session completion + content_progress (questionnaire answers etc.)
─────────────────────────────────────────────────────────────────────── */
exports.getUserTrainingProgress = async (req, res) => {
    try {
        const { userId } = req.params;

        const allModules = await TrainingModule.findAll({
            where: { is_deleted: false, is_published: true },
            include: [
                { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] },
                { model: TrainingSession, as: 'sessions', attributes: ['id', 'title', 'order_index'] }
            ],
            order: [['id', 'DESC']]
        });

        if (allModules.length === 0) return res.json([]);

        const allSessionIds = [];
        allModules.forEach(m => m.sessions?.forEach(s => allSessionIds.push(s.id)));

        const progressRows = allSessionIds.length > 0
            ? await TrainingSessionProgress.findAll({
                where: { user_id: userId, session_id: { [Op.in]: allSessionIds } }
              })
            : [];

        const progressBySession = {};
        progressRows.forEach(p => { progressBySession[p.session_id] = p; });

        const result = allModules.map(m => {
            const plain = m.get({ plain: true });
            const sessions = (plain.sessions || []).sort((a, b) => a.order_index - b.order_index);
            const total = sessions.length;

            let completedCount = 0;
            let totalTimeSpent = 0;
            let lastActivity = null;

            const sessionDetail = sessions.map(s => {
                const p = progressBySession[s.id];
                if (p?.is_completed) completedCount++;
                totalTimeSpent += p?.time_spent_seconds || 0;
                const ts = p?.completed_at || p?.updated_at || null;
                if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;
                return {
                    session_id:         s.id,
                    title:              s.title,
                    order_index:        s.order_index,
                    is_completed:       p?.is_completed     || false,
                    time_spent_seconds: p?.time_spent_seconds || 0,
                    content_progress:   p?.content_progress  || []
                };
            });

            const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
            const status = completedCount === 0 ? 'not_started'
                         : completedCount === total ? 'completed'
                         : 'in_progress';

            return {
                module_id:                plain.id,
                title:                    plain.title,
                thumbnail_url:            plain.thumbnail_url,
                categories:               plain.categories,
                difficulty_level:         plain.difficulty_level,
                instructor_name:          plain.instructor_name,
                status,
                completion_pct:           pct,
                completed_sessions:       completedCount,
                total_sessions:           total,
                total_time_spent_seconds: totalTimeSpent,
                last_activity:            lastActivity,
                sessions:                 sessionDetail
            };
        });

        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── GET /training/modules/:id/users-progress ───────────────────────────
   Admin view: all users' progress on a specific training module.
   Returns module meta + array of per-user progress with per-session detail.
─────────────────────────────────────────────────────────────────────── */
exports.getModuleUsersProgress = async (req, res) => {
    try {
        const mod = await TrainingModule.findOne({
            where: { id: req.params.id, is_deleted: false },
            include: [
                { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] },
                { model: TrainingSession, as: 'sessions', attributes: ['id', 'title', 'order_index', 'duration_minutes'] }
            ],
            order: [[ { model: TrainingSession, as: 'sessions' }, 'order_index', 'ASC' ]]
        });
        if (!mod) return res.status(404).json({ error: 'Not Found' });

        const plain = mod.get({ plain: true });
        const sessions = plain.sessions || [];
        const sessionIds = sessions.map(s => s.id);
        const totalSessions = sessions.length;

        const progressRows = sessionIds.length > 0
            ? await TrainingSessionProgress.findAll({
                where: { session_id: { [Op.in]: sessionIds } },
                include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone_number'] }]
              })
            : [];

        const byUser = {};
        progressRows.forEach(p => {
            const uid = p.user_id;
            if (!byUser[uid]) {
                byUser[uid] = {
                    user_id: uid,
                    name: p.user?.name || null,
                    phone_number: p.user?.phone_number || null,
                    sessions: {}
                };
            }
            byUser[uid].sessions[p.session_id] = p;
        });

        const usersProgress = Object.values(byUser).map(u => {
            let completedCount = 0;
            let totalTimeSpent = 0;
            let lastActivity = null;

            const sessionDetail = sessions.map(s => {
                const p = u.sessions[s.id];
                if (p?.is_completed) completedCount++;
                totalTimeSpent += p?.time_spent_seconds || 0;
                const ts = p?.completed_at || p?.updated_at || null;
                if (ts && (!lastActivity || ts > lastActivity)) lastActivity = ts;
                return {
                    session_id:         s.id,
                    title:              s.title,
                    order_index:        s.order_index,
                    is_completed:       p?.is_completed || false,
                    time_spent_seconds: p?.time_spent_seconds || 0,
                    content_progress:   p?.content_progress || []
                };
            });

            const pct = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0;
            const status = completedCount === 0 ? 'not_started'
                         : completedCount === totalSessions ? 'completed'
                         : 'in_progress';

            return {
                user_id:                  u.user_id,
                name:                     u.name,
                phone_number:             u.phone_number,
                status,
                completion_pct:           pct,
                completed_sessions:       completedCount,
                total_sessions:           totalSessions,
                total_time_spent_seconds: totalTimeSpent,
                last_activity:            lastActivity,
                sessions:                 sessionDetail
            };
        });

        const statusOrder = { completed: 0, in_progress: 1, not_started: 2 };
        usersProgress.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.completion_pct - a.completion_pct);

        res.json({
            module_id:                 plain.id,
            title:                     plain.title,
            thumbnail_url:             plain.thumbnail_url,
            categories:                plain.categories,
            total_sessions:            totalSessions,
            total_users_with_activity: usersProgress.length,
            users:                     usersProgress
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
