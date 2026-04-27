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

exports.getProgress = async (req, res) => {
    try {
        const progress = await TrainingSessionProgress.findAll({
            where: { user_id: req.user.id },
            include: [{ model: TrainingSession, attributes: ['module_id'] }]
        });
        
        // Group by module to calculate % completion dynamically on the fly
        const completedSessionsPerModule = {};
        progress.forEach(p => {
             if (p.is_completed && p.training_session) {
                 const mId = p.training_session.module_id;
                 completedSessionsPerModule[mId] = (completedSessionsPerModule[mId] || 0) + 1;
             }
        });

        res.json({ progress_records: progress, module_completion_counts: completedSessionsPerModule });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.markSessionComplete = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const [prog, created] = await TrainingSessionProgress.findOrCreate({
            where: { user_id: req.user.id, session_id: sessionId },
            defaults: { is_completed: true, completed_at: new Date() }
        });
        
        if (!created && !prog.is_completed) {
            prog.is_completed = true;
            prog.completed_at = new Date();
            await prog.save();
        }

        res.json({ message: 'Session successfully marked as completed', progress: prog });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
