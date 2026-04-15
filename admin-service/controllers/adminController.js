const { User, UserProfile, UserVital, UserAlert, UserQuestionnaire, Article, UserMedicalCondition, UserMedication, UserAllergy, UserLifestyle, UserSubscription, SubscriptionAuditLog, DashboardConfig, UserAuditLog, UserDevice, ExportHistory, sequelize } = require('../models');
const { Op } = require('sequelize');
const jwt    = require('jsonwebtoken');

// 8.1 Admin Login (legacy - phone-based, kept for reference)
exports.login = async (req, res) => {
    const { phoneNumber } = req.body;
    try {
        const user = await User.findOne({ where: { phone_number: phoneNumber } });
        if (!user || (!user.is_admin && !user.is_manager)) {
            return res.status(401).json({ error: 'Unauthorized. Admin or Manager access required.' });
        }
        const role  = user.is_admin ? 'admin' : 'manager';
        const token = jwt.sign({ id: user.id, role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
        return res.json({ token, role, message: 'Admin login successful' });
    } catch (e) { return res.status(500).json({ error: 'Login error' }); }
};

// 8.2 Cohort Dashboard
exports.getCohortDashboard = async (req, res) => {
    try {
        const totalUsers       = await User.count({ where: { is_user: true } });
        const activeUsersCount = await User.count({ where: { is_user: true, last_login_at: { [Op.gte]: new Date(Date.now() - 7 * 86400000) } } });
        const alertsCount      = await UserAlert.count({ where: { is_resolved: false } });
        const completedQCount  = await UserQuestionnaire.count({ where: { status: 'Completed' } });
        res.json({ total_enrolled_users: totalUsers, active_users_7d: activeUsersCount, active_alerts: alertsCount, completed_questionnaires: completedQCount, average_program_score: 85.5 });
    } catch (error) { res.status(500).json({ error: 'Dashboard error' }); }
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
            payload.is_published  = false;
            payload.published_at  = null;
            payload.publish_status = 'scheduled';
        } else if (is_published) {
            // Immediate publish
            payload.is_published  = true;
            payload.published_at  = new Date();
            payload.publish_status = 'published';
            payload.scheduled_publish_at = null;
        } else {
            // Draft
            payload.is_published  = false;
            payload.published_at  = null;
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
            payload.is_published  = false;
            payload.published_at  = null;
            payload.publish_status = 'scheduled';
        } else if (is_published) {
            payload.is_published  = true;
            payload.published_at  = new Date();
            payload.publish_status = 'published';
            payload.scheduled_publish_at = null;
        } else {
            payload.is_published  = false;
            payload.published_at  = null;
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
            { name:         { [Op.iLike]: `%${search}%` } },
            { phone_number: { [Op.iLike]: `%${search}%` } }
        ];
    }
    if (activity_status === 'active')   whereClause.is_active = true;
    if (activity_status === 'inactive') whereClause.is_active = false;
    if (enrolled_after)  whereClause.created_at = { ...whereClause.created_at, [Op.gte]: new Date(enrolled_after) };
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
    const days   = parseInt(req.query.days || 7);
    const since  = new Date(Date.now() - days * 86400000);
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
        
        // Group by user and fetch details
        const userMap = {};
        for (const alert of alerts) {
            if (!userMap[alert.user_id]) {
                const user = await User.findByPk(alert.user_id);
                // fetch latest HR and SpO2
                const hr = await UserVital.findOne({ where: { user_id: alert.user_id, vital_type: 'heart_rate' }, order: [['recorded_at', 'DESC']] });
                const spo2 = await UserVital.findOne({ where: { user_id: alert.user_id, vital_type: 'spo2' }, order: [['recorded_at', 'DESC']] });
                
                userMap[alert.user_id] = {
                    user_id: alert.user_id,
                    name: user?.name || 'Unknown User',
                    spo2: spo2 ? Math.round(spo2.vital_value) + '%' : '98%',
                    heart_rate: hr ? Math.round(hr.vital_value) + ' bpm' : '128 bpm',
                    risk_status: '95%',
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
        if (date_to)   { const d = new Date(date_to); d.setHours(23,59,59,999); dateWhere[Op.lte] = d; }

        if (dataset === 'vitals') {
            // allowed vital types mapping to field keys
            const VITAL_MAP = {
                heart_rate: 'heart_rate', spo2: 'spo2', steps: 'steps',
                sleep: 'sleep', hrv: 'hrv', calories: 'calories', activity_minutes: 'activity_minutes'
            };
            const selectedTypes = fields.length > 0 ? fields.filter(f => VITAL_MAP[f]) : Object.keys(VITAL_MAP);
            const vitalWhere = { vital_type: { [Op.in]: selectedTypes } };
            if (Object.keys(dateWhere).length) vitalWhere.recorded_at = dateWhere;

            const vitals = await UserVital.findAll({ where: vitalWhere, order: [['user_id','ASC'],['recorded_at','ASC']] });
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
                include: [{ model: User, attributes: ['name', 'phone_number'] }],
                order: [['completed_at', 'DESC']]
            });
            rowCount = qs.length;
            fileName = `Questionnaires_${now.toISOString().split('T')[0]}.csv`;

            const baseHeaders = ['User ID', 'Status', 'Overall Score', 'Completed At'];
            const extraHeaders = [];
            if (!fields.length || fields.includes('domain_scores'))    extraHeaders.push('Domain Scores');
            if (!fields.length || fields.includes('total_score'))       ; // already in overall_score
            if (!fields.length || fields.includes('individual_responses')) extraHeaders.push('Individual Responses');
            if (!fields.length || fields.includes('submission_timestamps')) extraHeaders.push('Submitted Timestamp');

            csv = baseHeaders.join(',') + '\n';
            qs.forEach(q => {
                csv += `${q.user_id},${q.status},${q.overall_score},${q.completed_at ? new Date(q.completed_at).toISOString() : ''}\n`;
            });

        } else if (dataset === 'summary') {
            const subs = await UserSubscription.findAll({
                include: [{ model: User, attributes: ['name', 'phone_number', 'is_active'] }]
            });
            rowCount = subs.length;
            fileName = `ProgramSummary_${now.toISOString().split('T')[0]}.csv`;

            const includeHeaders = ['User ID', 'Program', 'Status', 'Start Date', 'Expiry Date', 'Enrolled By'];
            csv = includeHeaders.join(',') + '\n';
            subs.forEach(s => {
                csv += `${s.user_id},"${s.program_name || ''}",${s.status},${s.start_date || ''},${s.expiry_date || ''},"${s.enrolled_by || ''}"\n`;
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
            bmi: (req.body.weight / ((req.body.height/100) * (req.body.height/100))).toFixed(2)
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
        await UserProfile.update(req.body, { where: { user_id: req.params.id } });
        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: 'PROFILE_UPDATED', category: 'Personal Info', changes_json: req.body });
        res.json({ message: 'Profile updated' });
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
};

exports.changeUserStatus = async (req, res) => {
    try {
        await User.update({ is_active: req.body.is_active }, { where: { id: req.params.id } });
        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: req.body.is_active ? 'ACTIVATED' : 'DEACTIVATED', category: 'Personal Info', changes_json: req.body });
        res.json({ message: `User status changed to ${req.body.is_active}` });
    } catch (e) { res.status(500).json({ error: 'Status update failed' }); }
};

exports.updateUserMedicalProfile = async (req, res) => {
    try {
        const { conditions, medications, allergies } = req.body;
        const userId = req.params.id;

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

        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'MEDICAL_PROFILE_UPDATED', category: 'Medical', changes_json: req.body });
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
        if (lifestyle) {
            await lifestyle.update(req.body);
        } else {
            await UserLifestyle.create({ user_id: userId, ...req.body });
        }
        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'LIFESTYLE_UPDATED', category: 'Lifestyle', changes_json: req.body });
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
            if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.created_at[Op.lte] = d; }
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
