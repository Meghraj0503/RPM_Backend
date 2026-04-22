const cron = require('node-cron');
const { UserQuestionnaire } = require('./models/index.js');
const { Op } = require('sequelize');

/**
 * Scheduled Questionnaire Dispatcher
 * Runs every minute. Finds all user_questionnaires where:
 *   - status = 'Scheduled'
 *   - scheduled_for <= NOW()
 * And flips them to status = 'Pending' so patients can see and answer them.
 */
function startScheduler() {
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const released = await UserQuestionnaire.update(
                { status: 'Pending' },
                {
                    where: {
                        status: 'Scheduled',
                        scheduled_for: { [Op.lte]: now }
                    }
                }
            );
            const count = released[0];
            if (count > 0) {
                console.log(`[Scheduler] Released ${count} scheduled questionnaire(s) to patients at ${now.toISOString()}`);
            }
        } catch (e) {
            console.error('[Scheduler] Error dispatching questionnaires:', e.message);
        }
    });

    console.log('[Scheduler] Questionnaire dispatch scheduler started — checking every minute.');
}

module.exports = { startScheduler };
