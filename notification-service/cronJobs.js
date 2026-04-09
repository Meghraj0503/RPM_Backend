const cron = require('node-cron');
const moment = require('moment-timezone');
const { Notification, NotificationTemplate, sequelize } = require('./models');

const fireScheduledNotification = async (triggerCode, userIds) => {
    try {
        if (!userIds || userIds.length === 0) return;
        
        const template = await NotificationTemplate.findByPk(triggerCode);
        if(!template) {
            console.log(`Cron Warning: Template ${triggerCode} not found in DB.`);
            return;
        }
        
        const notifications = userIds.map(userId => ({
            user_id: userId,
            category: template.category,
            title: template.title_template,
            message: template.message_template
        }));

        await Notification.bulkCreate(notifications);
        console.log(`Fired ${notifications.length} scheduled notifications for ${triggerCode}`);
    } catch (e) { console.error('Error firing bulk notifications:', e); }
};

exports.initCronJobs = () => {
    console.log('Initializing Timezone-Aware Cron Jobs (Asia/Kolkata)...');

    cron.schedule('0 7 * * *', async () => {
        try {
            const query = `
                SELECT user_id FROM user_questionnaires 
                WHERE status = 'Pending' AND scheduled_for = CURRENT_DATE
            `;
            const users = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
            await fireScheduledNotification('QUESTIONNAIRE_AVAILABLE', users.map(u => u.user_id));
        } catch(e) { console.error(e); }
    }, { scheduled: true, timezone: "Asia/Kolkata" });

    cron.schedule('15 7 * * *', async () => {
        try {
            const query = `
                SELECT user_id FROM user_questionnaires 
                WHERE status = 'Pending' AND scheduled_for = CURRENT_DATE - INTERVAL '1 day'
            `;
            const users = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
            await fireScheduledNotification('QUESTIONNAIRE_REMINDER', users.map(u => u.user_id));
        } catch(e) { console.error(e); }
    }, { scheduled: true, timezone: "Asia/Kolkata" });

    cron.schedule('0 18 * * *', async () => {
        try {
            const query = `SELECT id as user_id FROM users WHERE is_user = true`;
            const users = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
            await fireScheduledNotification('ARTICLE_RECOMMENDATION', users.map(u => u.user_id));
        } catch(e) { console.error(e); }
    }, { scheduled: true, timezone: "Asia/Kolkata" });

    cron.schedule('0 20 * * *', async () => {
        try {
            const query = `
                SELECT u.id as user_id FROM users u
                LEFT JOIN user_vitals v ON u.id = v.user_id AND v.recorded_at::date = CURRENT_DATE
                WHERE v.id IS NULL AND u.is_user = true
            `;
            const users = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
            await fireScheduledNotification('MANUAL_ENTRY_REMINDER', users.map(u => u.user_id));
        } catch(e) { console.error(e); }
    }, { scheduled: true, timezone: "Asia/Kolkata" });

    cron.schedule('0 9 * * 0', async () => {
        try {
            const query = `SELECT id as user_id FROM users WHERE is_user = true`;
            const users = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
            await fireScheduledNotification('WEEKLY_HEALTH_SUMMARY', users.map(u => u.user_id));
        } catch(e) { console.error(e); }
    }, { scheduled: true, timezone: "Asia/Kolkata" });

    console.log('Cron Jobs Initialized successfully.');
};
