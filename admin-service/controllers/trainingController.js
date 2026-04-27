const { TrainingCategory, TrainingModule, TrainingModuleCategory, TrainingSession, sequelize } = require('../models');
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
        const { title, short_description, full_description, duration_minutes, thumbnail_url, difficulty_level, category_ids, sessions } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const newModule = await TrainingModule.create({
            title, short_description, full_description, duration_minutes, thumbnail_url, difficulty_level,
            created_by: req.user ? req.user.id : 'Admin Auto'
        }, { transaction: t });

        if (category_ids && category_ids.length > 0) {
            const mapped = category_ids.map(c => ({ module_id: newModule.id, category_id: c }));
            await TrainingModuleCategory.bulkCreate(mapped, { transaction: t });
        }

        if (sessions && sessions.length > 0) {
            const mappedSessions = sessions.map((s, idx) => ({
                module_id: newModule.id,
                title: s.title,
                content_json: s.content_json || {},
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

        const include = [{ model: TrainingCategory, as: 'categories', attributes: ['id', 'name'] }];
        if (category_id) {
            include[0].where = { id: category_id };
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
        const { title, short_description, full_description, duration_minutes, thumbnail_url, difficulty_level, category_ids, sessions } = req.body;
        
        const mod = await TrainingModule.findOne({ where: { id: req.params.id, is_deleted: false } });
        if (!mod) return res.status(404).json({ error: 'Not Found' });

        await mod.update({ title, short_description, full_description, duration_minutes, thumbnail_url, difficulty_level }, { transaction: t });

        if (category_ids) {
            await TrainingModuleCategory.destroy({ where: { module_id: mod.id }, transaction: t });
            if (category_ids.length > 0) {
                const mapped = category_ids.map(c => ({ module_id: mod.id, category_id: c }));
                await TrainingModuleCategory.bulkCreate(mapped, { transaction: t });
            }
        }

        if (sessions) {
            await TrainingSession.destroy({ where: { module_id: mod.id }, transaction: t });
            if (sessions.length > 0) {
                const mappedSessions = sessions.map((s, idx) => ({
                    module_id: mod.id, title: s.title, content_json: s.content_json || {}, order_index: idx
                }));
                await TrainingSession.bulkCreate(mappedSessions, { transaction: t });
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
        mod.is_deleted = true; // Soft delete
        await mod.save();
        res.json({ message: 'Soft deleted successfully' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};
