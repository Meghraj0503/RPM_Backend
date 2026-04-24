const { User, UserProfile, UserVital, UserAlert, UserQuestionnaire, Article, UserMedicalCondition, UserMedication, UserAllergy, UserLifestyle, UserSubscription, SubscriptionAuditLog, DashboardConfig, UserAuditLog, UserDevice, ExportHistory, sequelize, QuestionnaireTemplate, Question } = require('../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');

// 8.1 Admin Login (legacy - phone-based, kept for reference)
exports.login = async (req, res) => {
    const { phoneNumber } = req.body;
    try {
        const user = await User.findOne({ where: { phone_number: phoneNumber } });
        if (!user || (!user.is_admin && !user.is_manager)) {
            return res.status(401).json({ error: 'Unauthorized. Admin or Manager access required.' });
        }
        const role = user.is_admin ? 'admin' : 'manager';
        const token = jwt.sign({ id: user.id, role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
        return res.json({ token, role, message: 'Admin login successful' });
    } catch (e) { return res.status(500).json({ error: 'Login error' }); }
};

// 8.2 Cohort Dashboard
exports.getCohortDashboard = async (req, res) => {
    try {
        // --- 1. Top Level Overarching Stats ---
        const totalUsers = await User.count({ where: { is_user: true } });
        const activeUsersCount = await User.count({ where: { is_user: true, last_login_at: { [Op.gte]: new Date(Date.now() - 30 * 86400000) } } }); // 30d
        const atRiskUsersCount = await UserAlert.count({ where: { is_resolved: false }, distinct: true, col: 'user_id' });
        const completedQCount = await UserQuestionnaire.count({ where: { status: 'Completed' } });
        const totalQCount = await UserQuestionnaire.count();
        const qCompletionRate = totalQCount ? Math.round((completedQCount / totalQCount) * 100) : 0;

        // --- 2. Vitals Aggregations (Raw SQL for performance) ---
        // Get the latest vital reading of a specific type per user for cross-sectional analysis
        // SpO2 Distribution (<90, 90-94, 95-100)
        const spo2Query = `
            WITH LatestSpO2 AS (
                SELECT DISTINCT ON (user_id) vital_value::numeric AS val 
                FROM user_vitals WHERE vital_type = 'spo2' ORDER BY user_id, recorded_at DESC
            )
            SELECT 
                COUNT(*) FILTER (WHERE val >= 95) AS normal,
                COUNT(*) FILTER (WHERE val >= 90 AND val < 95) AS low,
                COUNT(*) FILTER (WHERE val < 90) AS critical,
                AVG(val) AS avg_spo2
            FROM LatestSpO2;
        `;
        // HR Distribution (<40, 40-59, 60-79, 80-100, 101-120, >120)
        const hrQuery = `
            WITH LatestHR AS (
                SELECT DISTINCT ON (user_id) vital_value::numeric AS val 
                FROM user_vitals WHERE vital_type = 'heart_rate' ORDER BY user_id, recorded_at DESC
            )
            SELECT 
                COUNT(*) FILTER (WHERE val < 40) AS below_40,
                COUNT(*) FILTER (WHERE val >= 40 AND val < 60) AS hr_40_59,
                COUNT(*) FILTER (WHERE val >= 60 AND val < 80) AS hr_60_79,
                COUNT(*) FILTER (WHERE val >= 80 AND val <= 100) AS hr_80_100,
                COUNT(*) FILTER (WHERE val > 100 AND val <= 120) AS hr_101_120,
                COUNT(*) FILTER (WHERE val > 120) AS above_120,
                AVG(val) AS avg_hr
            FROM LatestHR;
        `;
        // HRV Distribution (avg over last 7d)
        const hrvQuery = `
            WITH UserAvgHRV AS (
                SELECT user_id, AVG(vital_value::numeric) AS avg_val
                FROM user_vitals WHERE vital_type = 'hrv' AND recorded_at >= NOW() - INTERVAL '7 days'
                GROUP BY user_id
            )
            SELECT 
                COUNT(*) FILTER (WHERE avg_val < 20) AS below_20,
                COUNT(*) FILTER (WHERE avg_val >= 20 AND avg_val < 40) AS hrv_20_39,
                COUNT(*) FILTER (WHERE avg_val >= 40 AND avg_val < 60) AS hrv_40_59,
                COUNT(*) FILTER (WHERE avg_val >= 60 AND avg_val < 80) AS hrv_60_79,
                COUNT(*) FILTER (WHERE avg_val >= 80) AS above_80,
                AVG(avg_val) AS cohort_avg_hrv,
                COUNT(*) FILTER (WHERE avg_val < 70) AS alert_users
            FROM UserAvgHRV;
        `;
        // Sleep Distribution (avg over last 7d)
        const sleepQuery = `
            WITH UserAvgSleep AS (
                SELECT user_id, AVG(vital_value::numeric) AS avg_val
                FROM user_vitals WHERE vital_type = 'sleep' AND recorded_at >= NOW() - INTERVAL '7 days'
                GROUP BY user_id
            )
            SELECT 
                COUNT(*) FILTER (WHERE avg_val < 4) AS below_4,
                COUNT(*) FILTER (WHERE avg_val >= 4 AND avg_val < 5) AS sleep_4_4_9,
                COUNT(*) FILTER (WHERE avg_val >= 5 AND avg_val < 6) AS sleep_5_5_9,
                COUNT(*) FILTER (WHERE avg_val >= 6 AND avg_val < 7) AS sleep_6_6_9,
                COUNT(*) FILTER (WHERE avg_val >= 7 AND avg_val < 8) AS sleep_7_7_9,
                COUNT(*) FILTER (WHERE avg_val >= 8) AS above_8,
                AVG(avg_val) AS cohort_avg_sleep,
                COUNT(*) FILTER (WHERE avg_val < 4) AS critical_sleep_users
            FROM UserAvgSleep;
        `;
        // Daily Activity (Steps trend 7d)
        const stepsTrendQuery = `
            SELECT DATE(recorded_at) AS day, ROUND(AVG(vital_value::numeric)) AS avg_steps
            FROM user_vitals 
            WHERE vital_type = 'steps' AND recorded_at >= NOW() - INTERVAL '6 days'
            GROUP BY DATE(recorded_at) ORDER BY DATE(recorded_at) ASC;
        `;
        // Other Physical
        const physQuery = `
            SELECT 
                (SELECT ROUND(AVG(vital_value::numeric)) FROM user_vitals WHERE vital_type = 'calories' AND recorded_at >= NOW() - INTERVAL '1 day') AS avg_calories_daily,
                (SELECT COUNT(*) FROM (SELECT user_id, SUM(vital_value::numeric) as sums FROM user_vitals WHERE vital_type = 'calories' AND recorded_at >= NOW() - INTERVAL '1 day' GROUP BY user_id) s WHERE sums >= 350) AS targeted_cal_users,
                (SELECT ROUND(AVG(vital_value::numeric)) FROM user_vitals WHERE vital_type = 'activity_minutes' AND recorded_at >= NOW() - INTERVAL '7 days') AS weekly_avg_minutes
        `;

        // --- 3. Subscriptions/Programs ---
        const progQuery = `
            SELECT program_name, COUNT(*) AS count
            FROM user_subscriptions
            WHERE status = 'Active'
            GROUP BY program_name;
        `;

        // --- 4. Devices / ABHA ---
        const deviceQuery = `
            SELECT 
                COUNT(*) AS total_devices,
                COUNT(*) FILTER(WHERE is_connected=true) as connected_devices 
            FROM user_devices;
        `;

        // ABHA: count distinct enrolled users (simulates linkage based on active subscriptions)
        const abhaQuery = `
            SELECT 
                COUNT(DISTINCT user_id) FILTER (WHERE status = 'Active') AS linked,
                COUNT(DISTINCT user_id) AS total
            FROM user_subscriptions;
        `;

        // Only count each user once — using their MOST RECENT unresolved alert's vital_type
        const alertBreakdownQuery = `
            WITH LatestAlertPerUser AS (
                SELECT DISTINCT ON (user_id) user_id, vital_type
                FROM user_alerts
                WHERE is_resolved = false
                ORDER BY user_id, created_at DESC
            )
            SELECT vital_type, COUNT(user_id) AS count
            FROM LatestAlertPerUser
            GROUP BY vital_type;
        `;

        // --- 6. Education Hub ---
        const educationQuery = `
            SELECT 
                a.category,
                COUNT(DISTINCT a.id) AS total_articles,
                COUNT(DISTINCT a.id) FILTER(WHERE a.publish_status = 'published') AS published_count,
                COUNT(ba.article_id) AS bookmark_count
            FROM articles a
            LEFT JOIN bookmarked_articles ba ON ba.article_id = a.id
            WHERE a.is_deleted = false
            GROUP BY a.category
            ORDER BY published_count DESC;
        `;
        const articleLibraryQuery = `
            SELECT
                COUNT(*) FILTER(WHERE publish_status = 'published') AS published,
                COUNT(*) FILTER(WHERE publish_status = 'draft') AS draft,
                COUNT(*) FILTER(WHERE publish_status = 'scheduled') AS scheduled,
                COUNT(*) AS total,
                (SELECT COUNT(*) FROM bookmarked_articles) AS total_bookmarks
            FROM articles WHERE is_deleted = false;
        `;
        const topArticlesQuery = `
            SELECT a.id, a.title, a.category,
                COUNT(ba.article_id) AS bookmarks
            FROM articles a
            LEFT JOIN bookmarked_articles ba ON a.id = ba.article_id
            WHERE a.is_deleted = false AND a.publish_status = 'published'
            GROUP BY a.id, a.title, a.category
            ORDER BY bookmarks DESC
            LIMIT 5;
        `;

        // --- 7. DAU (uses last_login_at as proxy for daily activity) ---
        const dauQuery = `
            SELECT DATE(last_login_at) AS day, COUNT(DISTINCT id) AS dau
            FROM users
            WHERE is_user = true
              AND last_login_at >= NOW() - INTERVAL '90 days'
            GROUP BY DATE(last_login_at)
            ORDER BY day ASC;
        `;

        // --- 8. Questionnaire Performance ---
        const questStatsQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'Completed' AND DATE(completed_at) = CURRENT_DATE) as completed_today,
                COUNT(*) FILTER (WHERE status != 'Completed' AND scheduled_for < CURRENT_DATE) as overdue
            FROM user_questionnaires;
        `;
        const questCategoryQuery = `
            SELECT t.title as name, COUNT(DISTINCT u.user_id) as value
            FROM questionnaire_templates t
            LEFT JOIN user_questionnaires u ON t.id = u.questionnaire_id AND u.status = 'Completed'
            GROUP BY t.id, t.title
            ORDER BY value DESC
            LIMIT 5;
        `;
        const questDomainQuery = `
            SELECT 
                key as domain, 
                ROUND(AVG(CAST(value AS numeric))) as score
            FROM user_questionnaire_scores,
            jsonb_each_text(domain_scores_json)
            GROUP BY key;
        `;

        // --- Execute Raw Queries ---
        const [[spo2Rows], [hrRows], [hrvRows], [sleepRows], [stepsTrend], [physRows], [progRows], [deviceRows], [alertBreakdown], [abhaRows], [educationRows], [libraryRows], [topArticleRows], [dauRows], [questStatsRows], [questCategoryRows], [questDomainRows]] = await Promise.all([
            sequelize.query(spo2Query),
            sequelize.query(hrQuery),
            sequelize.query(hrvQuery),
            sequelize.query(sleepQuery),
            sequelize.query(stepsTrendQuery),
            sequelize.query(physQuery),
            sequelize.query(progQuery),
            sequelize.query(deviceQuery),
            sequelize.query(alertBreakdownQuery),
            sequelize.query(abhaQuery),
            sequelize.query(educationQuery),
            sequelize.query(articleLibraryQuery),
            sequelize.query(topArticlesQuery),
            sequelize.query(dauQuery),
            sequelize.query(questStatsQuery),
            sequelize.query(questCategoryQuery),
            sequelize.query(questDomainQuery)
        ]);

        // Compute avg bookmarks per enrolled user
        const totalBookmarks = Number(libraryRows[0]?.total_bookmarks || 0);
        const avgArticlesPerUser = totalUsers > 0 ? (totalBookmarks / totalUsers).toFixed(1) : '0';

        res.json({
            top_level: {
                total_enrolled_users: totalUsers,
                active_users_30d: activeUsersCount,
                active_alerts: atRiskUsersCount,
                q_completion_rate: qCompletionRate,
                average_program_score: 85.5,
                avg_articles_per_user: avgArticlesPerUser
            },
            critical_alerts: {
                spo2: spo2Rows[0],
                hr: hrRows[0]
            },
            health_risk: {
                hrv: hrvRows[0],
                sleep: sleepRows[0]
            },
            physical_activity: {
                steps_trend_7d: stepsTrend,
                avg_calories_daily: physRows[0]?.avg_calories_daily,
                targeted_cal_users: physRows[0]?.targeted_cal_users,
                weekly_avg_minutes: physRows[0]?.weekly_avg_minutes
            },
            enrollment: {
                programs: progRows,
                devices: deviceRows[0],
                abha: abhaRows[0]
            },
            education: {
                by_category: educationRows,
                library: libraryRows[0],
                top_articles: topArticleRows,
                total_bookmarks: totalBookmarks,
                avg_articles_per_user: avgArticlesPerUser
            },
            questionnaires: {
                completed_today: Number(questStatsRows[0]?.completed_today || 0),
                overdue: Number(questStatsRows[0]?.overdue || 0),
                completion_rate: qCompletionRate,
                by_type: questCategoryRows.map(r => ({ name: r.name, value: Number(r.value) })),
                domain_scores: questDomainRows.map(r => ({ domain: r.domain, score: Number(r.score) }))
            },
            dau_trend: dauRows,
            at_risk_breakdown: alertBreakdown
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Dashboard error', details: error.message });
    }
};

// 8.3 Educational Content Management
exports.getArticles = async (req, res) => {
    try {
        const articles = await Article.findAll({ order: [['created_at', 'DESC']] });
        res.json({ articles });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
exports.getArticle = async (req, res) => {
    try {
        const article = await Article.findByPk(req.params.id);
        if (!article) return res.status(404).json({ error: 'Not found' });
        res.json({ article });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
exports.createArticle = async (req, res) => {
    try {
        const { scheduled_publish_at, is_published, ...rest } = req.body;
        const payload = { ...rest, id: 'ART-' + require('crypto').randomBytes(4).toString('hex') };

        if (scheduled_publish_at) {
            // Schedule for future publish
            payload.scheduled_publish_at = new Date(scheduled_publish_at);
            payload.is_published = false;
            payload.published_at = null;
            payload.publish_status = 'scheduled';
        } else if (is_published) {
            // Immediate publish
            payload.is_published = true;
            payload.published_at = new Date();
            payload.publish_status = 'published';
            payload.scheduled_publish_at = null;
        } else {
            // Draft
            payload.is_published = false;
            payload.published_at = null;
            payload.publish_status = 'draft';
            payload.scheduled_publish_at = null;
        }

        const article = await Article.create(payload);
        res.status(201).json({ message: 'Created', article });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
};
exports.deleteArticle = async (req, res) => {
    try {
        await Article.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
exports.updateArticle = async (req, res) => {
    try {
        const { scheduled_publish_at, is_published, ...rest } = req.body;
        const payload = { ...rest };

        if (scheduled_publish_at) {
            payload.scheduled_publish_at = new Date(scheduled_publish_at);
            payload.is_published = false;
            payload.published_at = null;
            payload.publish_status = 'scheduled';
        } else if (is_published) {
            payload.is_published = true;
            payload.published_at = new Date();
            payload.publish_status = 'published';
            payload.scheduled_publish_at = null;
        } else {
            payload.is_published = false;
            payload.published_at = null;
            payload.publish_status = 'draft';
            payload.scheduled_publish_at = null;
        }

        await Article.update(payload, { where: { id: req.params.id } });
        res.json({ message: 'Updated' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
};
exports.publishArticle = async (req, res) => {
    try {
        await Article.update({ is_published: true, published_at: new Date(), publish_status: 'published', scheduled_publish_at: null }, { where: { id: req.params.id } });
        res.json({ message: 'Article published' });
    } catch (err) { res.status(500).json({ error: 'Publish failed' }); }
};
exports.unpublishArticle = async (req, res) => {
    try {
        await Article.update({ is_published: false, published_at: null, publish_status: 'draft' }, { where: { id: req.params.id } });
        res.json({ message: 'Article unpublished' });
    } catch (err) { res.status(500).json({ error: 'Unpublish failed' }); }
};

// ── Scheduled publish runner — checks every 60 seconds ──────────────────────
const { Op: OpLocal } = require('sequelize');
setInterval(async () => {
    try {
        const due = await Article.findAll({
            where: {
                publish_status: 'scheduled',
                is_published: false,
                scheduled_publish_at: { [OpLocal.lte]: new Date() }
            }
        });
        for (const art of due) {
            await art.update({ is_published: true, published_at: new Date(), publish_status: 'published' });
            console.log(`[Scheduler] Auto-published article ${art.id} "${art.title}"`);
        }
    } catch (e) { console.error('[Scheduler] Error:', e.message); }
}, 60 * 1000); // every 60 seconds

// 8.4 User Management Table (with full filters per requirement)
exports.getUsers = async (req, res) => {
    const { search, page = 1, limit = 20, activity_status, q_status, enrolled_after, enrolled_before } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = { is_user: true };
    if (search) {
        whereClause[Op.or] = [
            { name: { [Op.iLike]: `%${search}%` } },
            { phone_number: { [Op.iLike]: `%${search}%` } }
        ];
    }
    if (activity_status === 'active') whereClause.is_active = true;
    if (activity_status === 'inactive') whereClause.is_active = false;
    if (enrolled_after) whereClause.created_at = { ...whereClause.created_at, [Op.gte]: new Date(enrolled_after) };
    if (enrolled_before) whereClause.created_at = { ...whereClause.created_at, [Op.lte]: new Date(enrolled_before) };

    try {
        let includeClause = [{ model: UserProfile }];
        let questFilter = {};
        if (q_status) questFilter.status = q_status;

        const { rows, count } = await User.findAndCountAll({
            where: whereClause,
            include: [
                { model: UserProfile },
                { model: UserQuestionnaire, as: 'user_questionnaires', required: false, where: Object.keys(questFilter).length ? questFilter : undefined }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['created_at', 'DESC']],
            distinct: true
        });
        res.json({ total: count, users: rows, page: parseInt(page) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed fetching users' });
    }
};

// 8.5 User Detail View (full health + vitals + questionnaires + article engagement)
exports.getUserDetail = async (req, res) => {
    const userId = req.params.id;
    const days = parseInt(req.query.days || 7);
    const since = new Date(Date.now() - days * 86400000);
    try {
        const user = await User.findByPk(userId, {
            include: [UserProfile, UserMedicalCondition, UserLifestyle,
                { model: UserMedication, required: false },
                { model: UserAllergy, required: false },
                { model: UserDevice, required: false },
                { model: UserSubscription, required: false }]
        });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const vitals = await UserVital.findAll({
            where: { user_id: userId, recorded_at: { [Op.gte]: since } },
            order: [['recorded_at', 'DESC']]
        });
        const questionnaires = await UserQuestionnaire.findAll({
            where: { user_id: userId }, order: [['completed_at', 'DESC']]
        });
        const alerts = await UserAlert.findAll({
            where: { user_id: userId }, order: [['created_at', 'DESC']], limit: 10
        });

        res.json({ user, vitals, questionnaires, alerts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed fetching user detail' });
    }
};


// 8.6 At-Risk Identification
exports.getAtRiskUsers = async (req, res) => {
    try {
        const alerts = await UserAlert.findAll({
            where: { is_resolved: false },
            order: [['created_at', 'DESC']]
        });

        const userMap = {};
        for (const alert of alerts) {
            if (!userMap[alert.user_id]) {
                const user = await User.findByPk(alert.user_id);
                const sub = await UserSubscription.findOne({ where: { user_id: alert.user_id, status: 'Active' } });

                userMap[alert.user_id] = {
                    user_id: alert.user_id,
                    name: user?.name || 'Unknown User',
                    program: sub?.program_name || 'Unassigned',
                    vital: alert.vital_type,
                    message: alert.message,
                    reading: alert.message.includes(':') ? alert.message.split(':')[1].trim() : alert.message,
                    latest_alertDate: alert.created_at
                };
            }
        }

        res.json({ at_risk_users: Object.values(userMap) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed fetching alerts' });
    }
};

// 8.7 Export
// 8.7 Data Export — field-filtered, date-ranged, history-logged
exports.exportDataset = async (req, res) => {
    try {
        const { dataset, fields = [], date_from, date_to, program } = req.body;
        const adminId = req.user?.id || 'ADMIN';
        const adminName = req.user?.name || 'Admin';
        const now = new Date();
        let csv = '';
        let fileName = '';
        let rowCount = 0;

        // Date filter helper for vitals / questionnaires
        const dateWhere = {};
        if (date_from) dateWhere[Op.gte] = new Date(date_from);
        if (date_to) { const d = new Date(date_to); d.setHours(23, 59, 59, 999); dateWhere[Op.lte] = d; }

        if (dataset === 'vitals') {
            // allowed vital types mapping to field keys
            const VITAL_MAP = {
                heart_rate: 'heart_rate', spo2: 'spo2', steps: 'steps',
                sleep: 'sleep', hrv: 'hrv', calories: 'calories', activity_minutes: 'activity_minutes'
            };
            const selectedTypes = fields.length > 0 ? fields.filter(f => VITAL_MAP[f]) : Object.keys(VITAL_MAP);
            const vitalWhere = { vital_type: { [Op.in]: selectedTypes } };
            if (Object.keys(dateWhere).length) vitalWhere.recorded_at = dateWhere;

            const vitals = await UserVital.findAll({ where: vitalWhere, order: [['user_id', 'ASC'], ['recorded_at', 'ASC']] });
            rowCount = vitals.length;
            fileName = `Vitals_${now.toISOString().split('T')[0]}.csv`;

            const headers = ['User ID', 'Vital Type', 'Value', 'Recorded At'];
            csv = headers.join(',') + '\n';
            vitals.forEach(v => {
                csv += `${v.user_id},${v.vital_type},${v.vital_value},${new Date(v.recorded_at).toISOString()}\n`;
            });

        } else if (dataset === 'questionnaires') {
            const qWhere = {};
            if (Object.keys(dateWhere).length) qWhere.completed_at = dateWhere;

            const qs = await UserQuestionnaire.findAll({
                where: qWhere,
                include: [
                    { model: User, attributes: ['name', 'phone_number'] },
                    { model: sequelize.models.user_questionnaire_score, as: 'scores' }
                ],
                order: [['completed_at', 'DESC']]
            });
            rowCount = qs.length;
            fileName = `Questionnaires_${now.toISOString().split('T')[0]}.csv`;

            const incDomain = !fields.length || fields.includes('domain_scores');
            const incTotal = !fields.length || fields.includes('total_score');
            const incResponses = !fields.length || fields.includes('individual_responses');
            const incTime = !fields.length || fields.includes('submission_timestamps');

            const allHeaders = ['User ID', 'Status'];
            if (incTotal) allHeaders.push('Overall Score');
            if (incDomain) allHeaders.push('Domain Scores');
            if (incResponses) allHeaders.push('Individual Responses');
            if (incTime) allHeaders.push('Completed At');

            csv = allHeaders.join(',') + '\n';
            qs.forEach(q => {
                let row = [q.user_id, q.status];
                if (incTotal) row.push(q.overall_score || '');
                if (incDomain) {
                    const ds = q.scores && q.scores.domain_scores_json ? JSON.stringify(q.scores.domain_scores_json).replace(/"/g, '""') : '';
                    row.push(`"${ds}"`);
                }
                if (incResponses) row.push('N/A');
                if (incTime) row.push(q.completed_at ? new Date(q.completed_at).toISOString() : '');
                
                csv += row.join(',') + '\n';
            });

        } else if (dataset === 'summary') {
            const subs = await UserSubscription.findAll({
                include: [{ model: User, attributes: ['name', 'phone_number', 'is_active'] }]
            });
            rowCount = subs.length;
            fileName = `ProgramSummary_${now.toISOString().split('T')[0]}.csv`;

            const allHeaders = ['User ID', 'Program', 'Status', 'Start Date', 'Expiry Date', 'Enrolled By'];
            if (!fields.length || fields.includes('cohort_overview')) allHeaders.push('Cohort Overview');
            if (!fields.length || fields.includes('kpi_charts')) allHeaders.push('KPI Charts');
            if (!fields.length || fields.includes('q_completion_stats')) allHeaders.push('Q-Completion Stats');
            if (!fields.length || fields.includes('at_risk_summary')) allHeaders.push('At-Risk Summary');
            if (!fields.length || fields.includes('score_trends')) allHeaders.push('Score Trends');
            if (!fields.length || fields.includes('individual_user_profiles')) allHeaders.push('Individual Profiles');
            
            csv = allHeaders.join(',') + '\n';
            subs.forEach(s => {
                let row = [s.user_id, `"${s.program_name || ''}"`, s.status, s.start_date || '', s.expiry_date || '', `"${s.enrolled_by || ''}"`];
                if (!fields.length || fields.includes('cohort_overview')) row.push('Standard');
                if (!fields.length || fields.includes('kpi_charts')) row.push('Generated');
                if (!fields.length || fields.includes('q_completion_stats')) row.push('85%');
                if (!fields.length || fields.includes('at_risk_summary')) row.push('Normal');
                if (!fields.length || fields.includes('score_trends')) row.push('Stable');
                if (!fields.length || fields.includes('individual_user_profiles')) row.push('Included');
                
                csv += row.join(',') + '\n';
            });
        } else if (dataset === 'users') {
            const users = await User.findAll({
                include: [
                    { model: UserProfile },
                    { model: UserSubscription }
                ]
            });
            rowCount = users.length;
            fileName = `UsersList_${now.toISOString().split('T')[0]}.csv`;

            const headers = ['User ID', 'Name', 'Phone', 'Email', 'Active Status', 'Gender', 'Age', 'BMI', 'Enrolled Program'];
            csv = headers.join(',') + '\n';
            users.forEach(u => {
                const profile = u.user_profile || {};
                const sub = u.user_subscription || {};
                const age = profile.date_of_birth ? Math.floor((new Date() - new Date(profile.date_of_birth)) / 31557600000) : '';
                csv += `${u.id},"${u.name || ''}",${u.phone_number || ''},${u.email || ''},${u.is_active ? 'Active' : 'Inactive'},${profile.gender || ''},${age},${profile.bmi || ''},"${sub.program_name || 'None'}"\n`;
            });
        } else {
            return res.status(400).json({ error: 'Invalid dataset type' });
        }

        const fileSizeKb = Math.round(Buffer.byteLength(csv, 'utf8') / 1024) || 1;

        // Log to export_history
        await ExportHistory.create({
            admin_id: adminId,
            export_type: dataset,
            file_name: fileName,
            fields_exported: fields.length ? fields : ['all'],
            date_from: date_from || null,
            date_to: date_to || null,
            program: program || 'All Programs',
            row_count: rowCount,
            file_size_kb: fileSizeKb
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csv);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
};

exports.getExportHistory = async (req, res) => {
    try {
        const history = await ExportHistory.findAll({
            order: [['created_at', 'DESC']],
            limit: 50
        });
        res.json({ history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch export history' });
    }
};

// ==================== 8.8 SUBSCRIPTION MANAGEMENT ====================
exports.assignSubscription = async (req, res) => {
    const { validity_days, program_name, enrolled_by, reason, start_date: reqStartDate } = req.body;
    const userId = req.params.id;
    try {
        const start_date = reqStartDate ? new Date(reqStartDate) : new Date();
        const expiry_date = new Date(start_date);
        expiry_date.setDate(start_date.getDate() + parseInt(validity_days || 30));
        const progName = program_name || 'Wellness Program 2025';
        const enrolledBy = enrolled_by || req.user?.name || 'Admin';

        let sub = await UserSubscription.findOne({ where: { user_id: userId } });
        const prevProgram = sub?.program_name || null;
        if (sub) {
            await sub.update({ start_date, expiry_date, status: 'Active', validity_days, program_name: progName, enrolled_by: enrolledBy });
        } else {
            sub = await UserSubscription.create({ user_id: userId, start_date, expiry_date, status: 'Active', validity_days, program_name: progName, enrolled_by: enrolledBy });
        }

        const action = prevProgram && prevProgram !== progName ? 'PROGRAM_CHANGED' : 'ASSIGNED';
        await SubscriptionAuditLog.create({ user_id: userId, admin_id: req.user.id, action, program_name: progName, reason: reason || null, previous_status: prevProgram, new_status: 'Active' });
        res.json({ message: 'Subscription assigned', subscription: sub });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Subscription assignment failed' }); }
};

exports.changeProgram = async (req, res) => {
    const { program_name, start_date: reqStartDate, reason } = req.body;
    const userId = req.params.id;
    try {
        let sub = await UserSubscription.findOne({ where: { user_id: userId } });
        const prevProgram = sub?.program_name || null;
        const start_date = reqStartDate ? new Date(reqStartDate) : new Date();
        const expiry_date = new Date(start_date);
        expiry_date.setDate(start_date.getDate() + (sub?.validity_days || 30));
        if (sub) {
            await sub.update({ program_name, start_date, expiry_date, status: 'Active', enrolled_by: req.user?.name || 'Admin' });
        } else {
            sub = await UserSubscription.create({ user_id: userId, program_name, start_date, expiry_date, status: 'Active', enrolled_by: req.user?.name || 'Admin', validity_days: 30 });
        }
        await SubscriptionAuditLog.create({ user_id: userId, admin_id: req.user.id, action: 'PROGRAM_CHANGED', program_name, reason: reason || null, previous_status: prevProgram, new_status: 'Active' });
        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'PROGRAM_CHANGED', category: 'Program', changes_json: { from: prevProgram, to: program_name, reason: reason || null } });
        res.json({ message: 'Program changed', subscription: sub });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Program change failed' }); }
};

exports.suspendSubscription = async (req, res) => {
    const { reason } = req.body || {};
    try {
        const sub = await UserSubscription.findOne({ where: { user_id: req.params.id } });
        await UserSubscription.update({ status: 'Removed' }, { where: { user_id: req.params.id } });
        await SubscriptionAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action: 'REMOVED', program_name: sub?.program_name, reason: reason || null, previous_status: 'Active', new_status: 'Removed' });
        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: 'REMOVED_FROM_PROGRAM', category: 'Program', changes_json: { program: sub?.program_name, reason: reason || null } });
        res.json({ message: 'User removed from program' });
    } catch (e) { res.status(500).json({ error: 'Removal failed' }); }
};

exports.reactivateSubscription = async (req, res) => {
    try {
        const sub = await UserSubscription.findOne({ where: { user_id: req.params.id } });
        if (!sub) return res.status(404).json({ error: 'No subscription found' });

        const start_date = new Date();
        const expiry_date = new Date();
        expiry_date.setDate(start_date.getDate() + (sub.validity_days || 30));
        await sub.update({ start_date, expiry_date, status: 'Active' });

        await SubscriptionAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action: 'REACTIVATED', program_name: sub.program_name, new_status: 'Active' });
        res.json({ message: 'Subscription reactivated', subscription: sub });
    } catch (e) { res.status(500).json({ error: 'Reactivation failed' }); }
};

exports.getEnrollmentHistory = async (req, res) => {
    try {
        const logs = await SubscriptionAuditLog.findAll({
            where: { user_id: req.params.id },
            order: [['created_at', 'DESC']]
        });
        res.json({ history: logs });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch enrollment history' }); }
};

// ==================== 8.9 DASHBOARD CONFIG ====================
exports.getDashboardConfig = async (req, res) => {
    try {
        const config = await DashboardConfig.findByPk(req.user.id);
        res.json({ layout: config ? config.layout_json : {} });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};
exports.saveDashboardConfig = async (req, res) => {
    try {
        await DashboardConfig.upsert({ admin_id: req.user.id, layout_json: req.body });
        res.json({ message: 'Dashboard layout saved successfully' });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
};

// ==================== 8.10 ADMIN USER MANAGEMENT ====================
exports.createUserProfile = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const userId = `USR-${Date.now()}`;
        await User.create({
            id: userId, name: req.body.name, phone_number: req.body.phone_number,
            is_user: true, is_active: true, created_at: new Date()
        }, { transaction });

        await UserProfile.create({
            user_id: userId, date_of_birth: req.body.date_of_birth, gender: req.body.gender,
            height: req.body.height, weight: req.body.weight,
            bmi: (req.body.weight / ((req.body.height / 100) * (req.body.height / 100))).toFixed(2)
        }, { transaction });

        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'USER_CREATED', category: 'Personal Info', changes_json: req.body }, { transaction });

        await transaction.commit();
        res.status(201).json({ message: 'User successfully created by admin', userId });
    } catch (e) {
        await transaction.rollback();
        res.status(500).json({ error: 'User creation failed' });
    }
};

exports.updateUserProfile = async (req, res) => {
    try {
        const oldProfile = await UserProfile.findOne({ where: { user_id: req.params.id } });
        await UserProfile.update(req.body, { where: { user_id: req.params.id } });

        let changes = {};
        for (const [k, v] of Object.entries(req.body)) {
            changes[k] = { old: oldProfile ? oldProfile.get(k) : null, new: v };
        }

        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: 'PROFILE_UPDATED', category: 'Personal Info', changes_json: changes });
        res.json({ message: 'Profile updated' });
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
};

exports.changeUserStatus = async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        const oldStatus = user ? user.is_active : null;
        await User.update({ is_active: req.body.is_active }, { where: { id: req.params.id } });

        let changes = {
            status: { old: oldStatus ? 'Active' : 'Deactivated', new: req.body.is_active ? 'Active' : 'Deactivated' }
        };
        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: req.body.is_active ? 'ACTIVATED' : 'DEACTIVATED', category: 'Personal Info', changes_json: changes });
        res.json({ message: `User status changed to ${req.body.is_active}` });
    } catch (e) { res.status(500).json({ error: 'Status update failed' }); }
};

exports.updateUserMedicalProfile = async (req, res) => {
    try {
        const { conditions, medications, allergies } = req.body;
        const userId = req.params.id;

        const oldConditions = await UserMedicalCondition.findAll({ where: { user_id: userId } });
        const oldMedications = await UserMedication.findAll({ where: { user_id: userId } });
        const oldAllergies = await UserAllergy.findAll({ where: { user_id: userId } });

        let changes = {};
        if (conditions) changes.conditions = { old: oldConditions.map(c => c.condition_name), new: conditions };
        if (medications) changes.medications = { old: oldMedications.map(m => m.medication_name), new: medications };
        if (allergies) changes.allergies = { old: oldAllergies.map(a => a.allergy_name), new: allergies };

        if (conditions) {
            await UserMedicalCondition.destroy({ where: { user_id: userId } });
            await UserMedicalCondition.bulkCreate(conditions.map(c => ({ user_id: userId, condition_name: c })));
        }
        if (medications) {
            await UserMedication.destroy({ where: { user_id: userId } });
            await UserMedication.bulkCreate(medications.map(m => ({ user_id: userId, medication_name: m })));
        }
        if (allergies) {
            await UserAllergy.destroy({ where: { user_id: userId } });
            await UserAllergy.bulkCreate(allergies.map(a => ({ user_id: userId, allergy_name: a })));
        }

        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'MEDICAL_PROFILE_UPDATED', category: 'Medical', changes_json: changes });
        res.json({ message: 'Medical profile updated' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Update failed' });
    }
};

exports.updateUserLifestyle = async (req, res) => {
    try {
        const userId = req.params.id;
        let lifestyle = await UserLifestyle.findOne({ where: { user_id: userId } });

        let changes = {};
        for (const [k, v] of Object.entries(req.body)) {
            changes[k] = { old: lifestyle ? lifestyle.get(k) : null, new: v };
        }

        if (lifestyle) {
            await lifestyle.update(req.body);
        } else {
            await UserLifestyle.create({ user_id: userId, ...req.body });
        }
        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'LIFESTYLE_UPDATED', category: 'Lifestyle', changes_json: changes });
        res.json({ message: 'Lifestyle updated' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Update failed' });
    }
};

exports.getUserAuditTrail = async (req, res) => {
    try {
        const { category, from, to } = req.query;
        const where = { user_id: req.params.id };
        if (category && category !== 'All Changes') where.category = category;
        if (from || to) {
            where.created_at = {};
            if (from) where.created_at[Op.gte] = new Date(from);
            if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.created_at[Op.lte] = d; }
        }
        const logs = await UserAuditLog.findAll({ where, order: [['created_at', 'DESC']] });
        res.json({ history: logs });
    } catch (e) { res.status(500).json({ error: 'Audit fetch failed' }); }
};

// ==================== DEVICE MANAGEMENT ====================
exports.getUserDevices = async (req, res) => {
    try {
        const devices = await UserDevice.findAll({ where: { user_id: req.params.id } });
        res.json({ devices });
    } catch (e) { res.status(500).json({ error: 'Failed to fetch devices' }); }
};

exports.assignDevice = async (req, res) => {
    const { mac_address, nickname } = req.body;
    const userId = req.params.id;
    try {
        if (!mac_address) return res.status(400).json({ error: 'Device serial number (mac_address) is required' });
        const device = await UserDevice.create({
            user_id: userId,
            device_name: nickname || mac_address,
            mac_address,
            nickname: nickname || null,
            assigned_by: req.user?.name || req.user?.id || 'Admin',
            assigned_at: new Date()
        });
        await UserAuditLog.create({
            user_id: userId, admin_id: req.user.id, action_type: 'DEVICE_ASSIGNED',
            category: 'Device',
            changes_json: { device_name: device.device_name, mac_address, assigned_to: userId }
        });
        res.json({ message: 'Device assigned', device });
    } catch (e) {
        console.error(e);
        if (e.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ error: 'Device already assigned to this user' });
        res.status(500).json({ error: 'Device assignment failed' });
    }
};

exports.removeDevice = async (req, res) => {
    const { deviceId } = req.params;
    const userId = req.params.id;
    try {
        const device = await UserDevice.findOne({ where: { id: deviceId, user_id: userId } });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        await UserAuditLog.create({
            user_id: userId, admin_id: req.user.id, action_type: 'DEVICE_REMOVED',
            category: 'Device',
            changes_json: { device_name: device.device_name, mac_address: device.mac_address }
        });
        await device.destroy();
        res.json({ message: 'Device removed' });
    } catch (e) { res.status(500).json({ error: 'Device removal failed' }); }
};

// ==================== QUESTIONNAIRE MODULE ====================

exports.getQuestionnaires = async (req, res) => {
    try {
        const templates = await QuestionnaireTemplate.findAll({
            include: [{ model: UserQuestionnaire, attributes: ['id', 'user_id', 'status', 'scheduled_for'] }],
            order: [['created_at', 'DESC']]
        });

        const mapped = templates.map(t => {
            const assignments = t.user_questionnaires || [];
            // Deduplicate by user_id (for any old duplicate data)
            const uniqueUserIds = new Set(assignments.map(a => a.user_id));
            const assignmentCount = uniqueUserIds.size;

            let status = 'Draft';
            let scheduled_for = null;
            if (assignmentCount > 0) {
                const scheduled = assignments.filter(a => a.status === 'Scheduled');
                if (scheduled.length > 0) {
                    status = 'Scheduled';
                    // Pick the most recent scheduled_for
                    scheduled_for = scheduled.sort((a, b) => new Date(b.scheduled_for) - new Date(a.scheduled_for))[0].scheduled_for;
                } else {
                    status = 'Assigned';
                }
            }

            return {
                id: t.id,
                title: t.title,
                category: t.category,
                type: t.type,
                created_by: t.created_by,
                scheduled_days_after_enrollment: t.scheduled_days_after_enrollment,
                status,
                scheduled_for,
                assignment_count: assignmentCount,
                created_at: t.created_at
            };
        });

        res.json(mapped);
    } catch (e) {
        console.error('getQuestionnaires error:', e);
        res.status(500).json({ error: e.message, stack: e.stack });
    }
};

exports.getQuestionnaireDetail = async (req, res) => {
    try {
        const tmpl = await QuestionnaireTemplate.findOne({
            where: { id: req.params.id },
            include: [{ model: Question, as: 'questions' }]
        });
        if (!tmpl) return res.status(404).json({ error: 'Not found' });

        // Return questions sorted
        tmpl.questions.sort((a, b) => a.sort_order - b.sort_order);
        res.json(tmpl);
    } catch (e) { res.status(500).json({ error: 'Failed to fetch questionnaire' }); }
};

exports.createQuestionnaire = async (req, res) => {
    const { title, category, type, questions } = req.body;
    try {
        const tmpl = await QuestionnaireTemplate.create({
            title,
            category,
            type: type || 'One-Time',
            created_by: req.user?.name || 'Admin',
            scheduled_days_after_enrollment: 0
        });

        if (questions && questions.length > 0) {
            const mappedQs = questions.map((q, i) => ({
                questionnaire_id: tmpl.id,
                question_text: q.question_text,
                question_type: q.question_type,
                options_json: q.options_json || [],
                sort_order: i
            }));
            await Question.bulkCreate(mappedQs);
        }

        res.json({ message: 'Questionnaire created', id: tmpl.id });
    } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }); }
};

exports.updateQuestionnaire = async (req, res) => {
    const { title, category, type, questions } = req.body;
    try {
        await QuestionnaireTemplate.update({ title, category, type }, { where: { id: req.params.id } });

        if (questions) {
            await Question.destroy({ where: { questionnaire_id: req.params.id } });
            const mappedQs = questions.map((q, i) => ({
                questionnaire_id: req.params.id,
                question_text: q.question_text,
                question_type: q.question_type,
                options_json: q.options_json || [],
                sort_order: i
            }));
            await Question.bulkCreate(mappedQs);
        }
        res.json({ message: 'Questionnaire updated' });
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
};

exports.deleteQuestionnaire = async (req, res) => {
    try {
        await QuestionnaireTemplate.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Questionnaire deleted' });
    } catch (e) { res.status(500).json({ error: 'Deletion failed' }); }
};

exports.getQuestionnaireTargetUsers = async (req, res) => {
    try {
        const tmpl = await QuestionnaireTemplate.findByPk(req.params.id);
        if (!tmpl) return res.status(404).json({ error: 'Template not found' });

        // Fetch all active users with their sub & vital logs
        const users = await User.findAll({
            where: { is_active: true },
            include: [
                { model: UserSubscription, required: false },
                { model: UserVital, required: false, order: [['recorded_at', 'DESC']], limit: 5 }
            ]
        });

        // Also fetch existing assignments for this questionnaire
        const existing = await UserQuestionnaire.findAll({
            where: { questionnaire_id: req.params.id },
            attributes: ['user_id', 'status', 'scheduled_for']
        });
        const assignedUserIds = existing.map(a => a.user_id);
        // Pick the most recent scheduled_for from any scheduled assignment
        const scheduledEntries = existing.filter(a => a.scheduled_for);
        let existingScheduledFor = null;
        if (scheduledEntries.length > 0) {
            existingScheduledFor = scheduledEntries.sort(
                (a, b) => new Date(b.scheduled_for) - new Date(a.scheduled_for)
            )[0].scheduled_for;
        }

        const record = (u, sub) => ({ id: u.id, name: u.name, phone: u.phone_number, program: sub ? sub.program_name : null });
        const highPriority = [];
        const mandatory = [];
        const allUsers = [];
        users.forEach(u => {
            const sub = u.user_subscription;
            let needsHighPriority = false;
            let needsMandatory = false;

            if (sub && sub.status === 'Active') {
                if (tmpl.category && sub.program_name && sub.program_name.toLowerCase().includes(tmpl.category.toLowerCase())) {
                    needsHighPriority = true;
                    needsMandatory = true;
                }
            }

            const vitals = u.user_vitals || [];
            if (!needsHighPriority) {
                const spo2 = vitals.find(v => v.vital_type === 'spo2');
                const hr = vitals.find(v => v.vital_type === 'heart_rate');
                if ((spo2 && spo2.vital_value < 95) || (hr && hr.vital_value > 100)) {
                    needsHighPriority = true;
                }
            }

            if (needsHighPriority) highPriority.push(record(u, sub));
            if (needsMandatory) mandatory.push(record(u, sub));
            allUsers.push(record(u, sub));
        });

        res.json({ highPriority, mandatory, allUsers, assignedUserIds, existingScheduledFor });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed target analysis' });
    }
};

exports.assignQuestionnaire = async (req, res) => {
    const { userIds, scheduled_for, priority, is_mandatory } = req.body;
    try {
        if (!userIds || userIds.length === 0) return res.status(400).json({ error: 'No users selected' });

        const qId = req.params.id;

        // Parse scheduled_for properly — treat as local time if no timezone offset given
        let scheduledTs = null;
        if (scheduled_for) {
            scheduledTs = new Date(scheduled_for);
            if (isNaN(scheduledTs.getTime())) scheduledTs = null;
        }

        const newStatus = scheduledTs ? 'Scheduled' : 'Pending';

        // Upsert: update if (user_id, questionnaire_id) already exists, else insert
        for (const uid of userIds) {
            const existing = await UserQuestionnaire.findOne({
                where: { user_id: uid, questionnaire_id: qId }
            });
            if (existing) {
                // Update the existing assignment instead of creating a duplicate
                await existing.update({
                    status: newStatus,
                    scheduled_for: scheduledTs,
                    priority: priority || existing.priority,
                    is_mandatory: is_mandatory !== undefined ? !!is_mandatory : existing.is_mandatory
                });
            } else {
                await UserQuestionnaire.create({
                    user_id: uid,
                    questionnaire_id: qId,
                    status: newStatus,
                    scheduled_for: scheduledTs,
                    priority: priority || 'Normal',
                    is_mandatory: !!is_mandatory
                });
            }
        }

        res.json({ message: 'Questionnaires successfully assigned' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to assign questionnaires' });
    }
};

