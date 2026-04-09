const { NotificationTemplate, Notification } = require('../models');

// Dynamic Trigger Engine
exports.triggerNotification = async (req, res) => {
    const { userId, triggerCode, placeholders } = req.body;
    try {
        const template = await NotificationTemplate.findByPk(triggerCode);
        if (!template) return res.status(404).json({ error: `Template ${triggerCode} not found` });

        let message = template.message_template;
        if (placeholders) {
            for (const [key, value] of Object.entries(placeholders)) {
                message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
            }
        }

        const notification = await Notification.create({
            user_id: userId,
            category: template.category,
            title: template.title_template,
            message: message
        });

        res.status(201).json({ message: 'Notification triggered', notification });
    } catch (err) { res.status(500).json({ error: 'Failed to trigger notification', err }); }
};

exports.getUserInbox = async (req, res) => {
    try {
        const inbox = await Notification.findAll({ where: { user_id: req.user.id }, order: [['created_at', 'DESC']] });
        res.json({ inbox });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch inbox' }); }
};

// ADMIN CMS Endpoints
exports.upsertTemplate = async (req, res) => {
    try {
        await NotificationTemplate.upsert(req.body);
        res.json({ message: 'Notification Template successfully configured' });
    } catch (err) { res.status(500).json({ error: 'Failed config' }); }
};

exports.deleteTemplate = async (req, res) => {
    try {
        await NotificationTemplate.destroy({ where: { trigger_code: req.params.code } });
        res.json({ message: 'Template deleted permanently' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
