/**
 * Seed required notification_templates rows.
 * Run once on fresh deployment: node seedTemplates.js
 * Safe to re-run — uses UPSERT (ON CONFLICT DO UPDATE).
 */
const { sequelize, NotificationTemplate } = require('./models');

const TEMPLATES = [
    {
        trigger_code: 'QUESTIONNAIRE_AVAILABLE',
        category: 'questionnaire',
        title_template: 'New Questionnaire Available',
        message_template: 'You have a new health questionnaire waiting for you. Please complete it to keep your wellness record up to date.'
    },
    {
        trigger_code: 'QUESTIONNAIRE_REMINDER',
        category: 'questionnaire',
        title_template: 'Questionnaire Reminder',
        message_template: 'You have an overdue questionnaire from yesterday. Please complete it as soon as possible.'
    },
    {
        trigger_code: 'ARTICLE_RECOMMENDATION',
        category: 'education',
        title_template: 'New Health Articles for You',
        message_template: 'Check out the latest health and wellness articles curated for your program.'
    },
    {
        trigger_code: 'MANUAL_ENTRY_REMINDER',
        category: 'vitals',
        title_template: 'Track Your Vitals Today',
        message_template: 'You have not recorded any health vitals today. Tap here to add a manual entry and keep your health record current.'
    },
    {
        trigger_code: 'WEEKLY_HEALTH_SUMMARY',
        category: 'summary',
        title_template: 'Your Weekly Health Summary',
        message_template: 'Your weekly wellness summary is ready. Review your progress and stay on track with your health goals.'
    },
    {
        trigger_code: 'HEALTH_ALERT',
        category: 'health_alert',
        title_template: 'Health Alert',
        message_template: 'An abnormal health reading has been detected. Please review your vitals and contact your care team if needed.'
    },
    {
        trigger_code: 'TASK_REMINDER',
        category: 'wellness',
        title_template: 'Daily Wellness Tasks',
        message_template: 'You have pending wellness tasks for today. Tap to view and complete them.'
    },
    {
        trigger_code: 'ANNOUNCEMENT',
        category: 'announcement',
        title_template: 'Program Announcement',
        message_template: 'There is a new announcement from your program team. Tap to read more.'
    }
];

async function seed() {
    try {
        await sequelize.authenticate();
        for (const t of TEMPLATES) {
            await NotificationTemplate.upsert(t);
            console.log(`  ✓ ${t.trigger_code}`);
        }
        console.log('Notification templates seeded successfully.');
        process.exit(0);
    } catch (e) {
        console.error('Seeding failed:', e.message);
        process.exit(1);
    }
}

seed();
