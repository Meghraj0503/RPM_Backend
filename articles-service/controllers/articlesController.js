const { Article } = require('../models');
const { Op } = require('sequelize');

exports.getArticles = async (req, res) => {
    const { category, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const whereClause = { is_published: true, is_deleted: false };
        if (category) {
            whereClause.category = category;
        }
        if (search) {
            whereClause[Op.or] = [
                { title: { [Op.iLike]: `%${search}%` } },
                { content: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const articles = await Article.findAll({
            where: whereClause,
            order: [['published_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: ['id', 'title', 'author_name', 'category', 'cover_image_url', 'estimated_read_time', 'published_at','content']
        });

        res.json({ articles, page: parseInt(page) });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching articles' });
    }
};

exports.searchArticles = async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!q || q.trim() === '') {
        return res.status(400).json({ error: 'Search query "q" is required' });
    }

    try {
        const articles = await Article.findAll({
            where: {
                is_published: true,
                is_deleted: false,
                [Op.or]: [
                    { title: { [Op.iLike]: `%${q}%` } },
                    { content: { [Op.iLike]: `%${q}%` } },
                    { author_name: { [Op.iLike]: `%${q}%` } },
                    { category: { [Op.iLike]: `%${q}%` } },
                ],
            },
            order: [['published_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: ['id', 'title', 'author_name', 'category', 'cover_image_url', 'estimated_read_time', 'published_at'],
        });

        res.json({ articles, query: q, page: parseInt(page) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during search' });
    }
};
