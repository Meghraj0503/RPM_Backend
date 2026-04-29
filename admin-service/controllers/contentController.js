const { WellnessQuote, WellnessTask, Announcement, EducationContent } = require('../models');

// ─── MA-05: Wellness Quotes ───────────────────────────────────────────────────

exports.getQuotes = async (req, res) => {
    try {
        const quotes = await WellnessQuote.findAll({ order: [['id', 'ASC']] });
        res.json({ quotes });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

exports.createQuote = async (req, res) => {
    try {
        const q = await WellnessQuote.create(req.body);
        res.status(201).json({ message: 'Quote created', quote: q });
    } catch (e) { res.status(500).json({ error: 'Failed to create quote' }); }
};

exports.updateQuote = async (req, res) => {
    try {
        await WellnessQuote.update(req.body, { where: { id: req.params.id } });
        res.json({ message: 'Quote updated' });
    } catch (e) { res.status(500).json({ error: 'Failed to update quote' }); }
};

exports.deleteQuote = async (req, res) => {
    try {
        await WellnessQuote.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Quote deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete quote' }); }
};

// ─── MA-04: Wellness Tasks ────────────────────────────────────────────────────

exports.getTasks = async (req, res) => {
    try {
        const tasks = await WellnessTask.findAll({ order: [['id', 'ASC']] });
        res.json({ tasks });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

exports.createTask = async (req, res) => {
    try {
        const task = await WellnessTask.create({ ...req.body, created_by: req.user?.name || req.user?.id });
        res.status(201).json({ message: 'Task created', task });
    } catch (e) { res.status(500).json({ error: 'Failed to create task' }); }
};

exports.updateTask = async (req, res) => {
    try {
        await WellnessTask.update(req.body, { where: { id: req.params.id } });
        res.json({ message: 'Task updated' });
    } catch (e) { res.status(500).json({ error: 'Failed to update task' }); }
};

exports.deleteTask = async (req, res) => {
    try {
        await WellnessTask.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Task deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete task' }); }
};

// ─── MA-03: Announcements ─────────────────────────────────────────────────────

exports.getAnnouncements = async (req, res) => {
    try {
        const items = await Announcement.findAll({ order: [['created_at', 'DESC']] });
        res.json({ announcements: items });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

exports.createAnnouncement = async (req, res) => {
    try {
        const a = await Announcement.create({ ...req.body, created_by: req.user?.name || req.user?.id });
        res.status(201).json({ message: 'Announcement created', announcement: a });
    } catch (e) { res.status(500).json({ error: 'Failed to create announcement' }); }
};

exports.updateAnnouncement = async (req, res) => {
    try {
        await Announcement.update(req.body, { where: { id: req.params.id } });
        res.json({ message: 'Announcement updated' });
    } catch (e) { res.status(500).json({ error: 'Failed to update announcement' }); }
};

exports.deleteAnnouncement = async (req, res) => {
    try {
        await Announcement.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Announcement deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete announcement' }); }
};

// ─── MB-18/MB-19: Multi-media Education Content ──────────────────────────────

exports.getEducationContents = async (req, res) => {
    try {
        const { content_type, page = 1, limit = 20, search } = req.query;
        const where = {};
        if (content_type) where.content_type = content_type;
        if (search) {
            const { Op } = require('sequelize');
            where.title = { [Op.iLike]: `%${search}%` };
        }
        const { Op } = require('sequelize');
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { rows, count } = await EducationContent.findAndCountAll({
            where, offset, limit: parseInt(limit), order: [['created_at', 'DESC']]
        });
        res.json({ total: count, contents: rows, page: parseInt(page) });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

exports.createEducationContent = async (req, res) => {
    try {
        const content = await EducationContent.create({ ...req.body, created_by: req.user?.name || req.user?.id });
        res.status(201).json({ message: 'Content created', content });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create content' });
    }
};

exports.updateEducationContent = async (req, res) => {
    try {
        await EducationContent.update(req.body, { where: { id: req.params.id } });
        res.json({ message: 'Content updated' });
    } catch (e) { res.status(500).json({ error: 'Failed to update content' }); }
};

exports.deleteEducationContent = async (req, res) => {
    try {
        await EducationContent.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Content deleted' });
    } catch (e) { res.status(500).json({ error: 'Failed to delete content' }); }
};

exports.publishEducationContent = async (req, res) => {
    try {
        await EducationContent.update({ is_published: true }, { where: { id: req.params.id } });
        res.json({ message: 'Content published' });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

exports.unpublishEducationContent = async (req, res) => {
    try {
        await EducationContent.update({ is_published: false }, { where: { id: req.params.id } });
        res.json({ message: 'Content unpublished' });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

// MB-22: Admin-triggered data deletion execution
exports.executeDataDeletion = async (req, res) => {
    const { user_id } = req.params;
    const { sequelize: db } = require('../models');
    try {
        await db.query('UPDATE data_deletion_requests SET status = :status, processed_at = NOW() WHERE user_id = :uid',
            { replacements: { status: 'Processing', uid: user_id } });

        // Anonymise PII — keep the user record but scrub personal data
        await db.query(`UPDATE users SET name = 'Deleted User', phone_number = 'DELETED-' || id WHERE id = :uid`, { replacements: { uid: user_id } });
        await db.query('DELETE FROM user_medical_conditions WHERE user_id = :uid', { replacements: { uid: user_id } });
        await db.query('DELETE FROM user_medications WHERE user_id = :uid', { replacements: { uid: user_id } });
        await db.query('DELETE FROM user_allergies WHERE user_id = :uid', { replacements: { uid: user_id } });
        await db.query('DELETE FROM user_lifestyle WHERE user_id = :uid', { replacements: { uid: user_id } });
        await db.query('DELETE FROM user_responses WHERE user_questionnaire_id IN (SELECT id FROM user_questionnaires WHERE user_id = :uid)', { replacements: { uid: user_id } });
        await db.query('DELETE FROM bookmarked_articles WHERE user_id = :uid', { replacements: { uid: user_id } });
        await db.query('UPDATE user_profiles SET date_of_birth = NULL, blood_group = NULL, occupation = NULL WHERE user_id = :uid', { replacements: { uid: user_id } });
        await db.query('UPDATE data_deletion_requests SET status = :status, processed_at = NOW() WHERE user_id = :uid',
            { replacements: { status: 'Completed', uid: user_id } });

        res.json({ message: `Data deletion completed for user ${user_id}` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Data deletion failed' });
    }
};

exports.getPendingDeletionRequests = async (req, res) => {
    const { sequelize: db } = require('../models');
    try {
        const rows = await db.query(`
            SELECT d.user_id, d.status, d.requested_at, d.processed_at, u.name, u.phone_number
            FROM data_deletion_requests d
            LEFT JOIN users u ON u.id = d.user_id
            ORDER BY d.requested_at DESC
        `, { type: db.QueryTypes.SELECT });
        res.json({ requests: rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch deletion requests' });
    }
};
