const cron = require('node-cron');
const { UserQuestionnaire, UserSubscription, Article } = require('./models/index.js');
const { Op } = require('sequelize');

/**
 * Scheduler — runs all background jobs for the admin service:
 * 1. Questionnaire dispatcher   — every minute
 * 2. Subscription expiry check  — daily at 00:05 IST (MA-06)
 * 3. Article auto-publish       — every minute (GQ-10 fix: moved from setInterval inside controller)
 */
function startScheduler() {
    // ── 1. Questionnaire Dispatcher (every minute) ──────────────────────────
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
                console.log(`[Scheduler] Released ${count} scheduled questionnaire(s) at ${now.toISOString()}`);
            }
        } catch (e) {
            console.error('[Scheduler] Questionnaire dispatch error:', e.message);
        }
    });

    // ── 2. Subscription Expiry (daily at 00:05 IST) — MA-06 ────────────────
    cron.schedule('5 0 * * *', async () => {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const [count] = await UserSubscription.update(
                { status: 'Expired' },
                {
                    where: {
                        status: 'Active',
                        expiry_date: { [Op.lt]: today }
                    }
                }
            );
            if (count > 0) {
                console.log(`[Scheduler] Expired ${count} subscription(s) on ${today}`);
            }
        } catch (e) {
            console.error('[Scheduler] Subscription expiry error:', e.message);
        }
    }, { scheduled: true, timezone: 'Asia/Kolkata' });

    // ── 3. Article Auto-Publish (every minute) — GQ-10 fix ─────────────────
    cron.schedule('* * * * *', async () => {
        try {
            const due = await Article.findAll({
                where: {
                    publish_status: 'scheduled',
                    is_published: false,
                    scheduled_publish_at: { [Op.lte]: new Date() }
                }
            });
            for (const art of due) {
                await art.update({ is_published: true, published_at: new Date(), publish_status: 'published' });
                console.log(`[Scheduler] Auto-published article ${art.id} "${art.title}"`);
            }
        } catch (e) {
            console.error('[Scheduler] Article auto-publish error:', e.message);
        }
    });

    console.log('[Scheduler] All jobs started: questionnaire dispatch, subscription expiry, article auto-publish.');
}

module.exports = { startScheduler };
