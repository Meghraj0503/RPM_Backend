const { Bookmark, Article } = require('../models');

exports.toggleBookmark = async (req, res) => {
    const { id } = req.params; 
    const userId = req.user.id;
    try {
        const article = await Article.findByPk(id);
        if (!article) return res.status(404).json({ error: 'Article not found' });

        const existing = await Bookmark.findOne({ where: { user_id: userId, article_id: id } });
        if (existing) {
            await existing.destroy();
            return res.json({ message: 'Bookmark removed', bookmarked: false });
        } else {
            await Bookmark.create({ user_id: userId, article_id: id });
            return res.json({ message: 'Bookmark added', bookmarked: true });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error parsing bookmark' });
    }
};

exports.getBookmarks = async (req, res) => {
    const userId = req.user.id;
    try {
        const bookmarks = await Bookmark.findAll({ where: { user_id: userId } });
        const articleIds = bookmarks.map(b => b.article_id);

        if (articleIds.length === 0) return res.json({ articles: [] });

        const articles = await Article.findAll({
            where: { id: articleIds, is_published: true, is_deleted: false },
            attributes: ['id', 'title', 'author_name', 'category', 'cover_image_url', 'estimated_read_time', 'published_at','content']
        });
        
        res.json({ articles });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching bookmarks' });
    }
};
