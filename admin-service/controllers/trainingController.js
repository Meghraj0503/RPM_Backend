const { TrainingCategory, TrainingModule, TrainingModuleCategory, TrainingSession, TrainingSessionProgress, sequelize } = require('../models');
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
                difficulty_level, category_ids, sessions, expiry_date } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const newModule = await TrainingModule.create({
            title, short_description, full_description, duration_minutes, thumbnail_url,
            difficulty_level, expiry_date: expiry_date || null,
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
                // Include sessions so frontend can derive content types and session count
                { model: TrainingSession, as: 'sessions', attributes: ['id', 'title', 'content_json'] }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
        });

        // Compute completion stats: completed sessions per module across all users
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

            // Derive all topic types from all sessions' content_json
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
                difficulty_level, category_ids, sessions, expiry_date } = req.body;

        const mod = await TrainingModule.findOne({ where: { id: req.params.id, is_deleted: false } });
        if (!mod) return res.status(404).json({ error: 'Not Found' });

        await mod.update({
            title, short_description, full_description,
            duration_minutes, thumbnail_url, difficulty_level,
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

exports.getUserTrainingProgress = async (req, res) => {
    try {
        const { userId } = req.params;

        // Get all sessions this user has any progress on
        const progressRows = await TrainingSessionProgress.findAll({
            where: { user_id: userId },
            include: [{
                model: TrainingSession,
                attributes: ['id', 'module_id', 'title', 'order_index'],
            }],
            order: [['created_at', 'DESC']]
        });

        // Collect unique module IDs the user has touched
        const moduleIdSet = new Set();
        progressRows.forEach(p => {
            if (p.training_session?.module_id) moduleIdSet.add(p.training_session.module_id);
        });
        const moduleIds = [...moduleIdSet];

        if (moduleIds.length === 0) return res.json([]);

        // Fetch full module details
        const modules = await TrainingModule.findAll({
            where: { id: moduleIds, is_deleted: false },
            include: [
                { model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] },
                { model: TrainingSession, as: 'sessions', attributes: ['id', 'title', 'order_index'] }
            ],
            order: [['created_at', 'DESC']]
        });

        // Build progress map: module_id → { completed, total }
        const completedByModule = {};
        progressRows.forEach(p => {
            if (!p.training_session) return;
            const mid = p.training_session.module_id;
            if (!completedByModule[mid]) completedByModule[mid] = { completed: 0, lastActivity: null };
            if (p.is_completed) completedByModule[mid].completed += 1;
            const ts = p.completed_at || p.created_at;
            if (!completedByModule[mid].lastActivity || ts > completedByModule[mid].lastActivity) {
                completedByModule[mid].lastActivity = ts;
            }
        });

        const result = modules.map(m => {
            const plain = m.get({ plain: true });
            const prog = completedByModule[m.id] || { completed: 0, lastActivity: null };
            const total = plain.sessions?.length || 0;
            const pct = total > 0 ? Math.min(100, Math.round((prog.completed / total) * 100)) : 0;
            return {
                id: plain.id,
                title: plain.title,
                thumbnail_url: plain.thumbnail_url,
                categories: plain.categories,
                total_sessions: total,
                completed_sessions: prog.completed,
                completion_pct: pct,
                last_activity: prog.lastActivity,
                is_published: plain.is_published,
            };
        });

        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};
