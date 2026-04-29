const { EducationContent } = require('../models');
const { Op } = require('sequelize');

// MB-18/MB-19: Browse multimedia education content (videos, audio, articles, infographics, pdfs)
exports.getEducationContents = async (req, res) => {
    const { content_type, category, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { is_published: true };
    if (content_type && content_type !== 'all') where.content_type = content_type;
    if (category) where.category = category;
    if (search) where.title = { [Op.iLike]: `%${search}%` };

    try {
        const { rows, count } = await EducationContent.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset
        });
        res.json({ contents: rows, total: count, page: parseInt(page) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch education content' });
    }
};

exports.getEducationContentById = async (req, res) => {
    try {
        const item = await EducationContent.findOne({
            where: { id: req.params.id, is_published: true }
        });
        if (!item) return res.status(404).json({ error: 'Content not found' });

        // Increment view count for videos
        if (item.content_type === 'video') {
            await item.increment('view_count');
        }

        res.json({ content: item });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch content' });
    }
};
