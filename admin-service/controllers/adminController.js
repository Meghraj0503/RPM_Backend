const { User, UserProfile, UserVital, UserAlert, UserQuestionnaire, Article, UserMedicalCondition, UserLifestyle, UserSubscription, SubscriptionAuditLog, DashboardConfig, UserAuditLog, UserDevice, sequelize } = require('../models');
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
        const payload = { ...req.body, id: 'ART-' + require('crypto').randomBytes(4).toString('hex') };
        if (payload.is_published) payload.published_at = new Date();
        else payload.published_at = null;
        const article = await Article.create(payload);
        res.status(201).json({ message: 'Created', article });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
exports.deleteArticle = async (req, res) => {
    try {
        await Article.destroy({ where: { id: req.params.id } });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
exports.updateArticle = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.is_published && !payload.published_at) payload.published_at = new Date();
        else if (!payload.is_published) payload.published_at = null;
        await Article.update(payload, { where: { id: req.params.id } });
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
};
exports.publishArticle = async (req, res) => {
    try {
        await Article.update({ is_published: true, published_at: new Date() }, { where: { id: req.params.id } });
        res.json({ message: 'Article published' });
    } catch (err) { res.status(500).json({ error: 'Publish failed' }); }
};
exports.unpublishArticle = async (req, res) => {
    try {
        await Article.update({ is_published: false, published_at: null }, { where: { id: req.params.id } });
        res.json({ message: 'Article unpublished' });
    } catch (err) { res.status(500).json({ error: 'Unpublish failed' }); }
};

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
        res.json({ at_risk_users: alerts });
    } catch (error) {
        res.status(500).json({ error: 'Failed fetching alerts' });
    }
};

// 8.7 Export
exports.exportDataset = async (req, res) => {
    try {
        const { ids, format } = req.body;
        let whereClause = { is_user: true };
        if (ids && Array.isArray(ids) && ids.length > 0) {
            whereClause.id = { [Op.in]: ids };
        }
        
        const users = await User.findAll({ where: whereClause });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="users_export.csv"`);
        
        let csv = "ID,Name,Phone,Status,Enrolled Date\n";
        users.forEach(u => {
            csv += `${u.id},"${u.name || ''}",${u.phone_number},${u.is_active ? 'Active' : 'Inactive'},${u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : ''}\n`;
        });
        
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Export failed' });
    }
};

// ==================== 8.8 SUBSCRIPTION MANAGEMENT ====================
exports.assignSubscription = async (req, res) => {
    const { validity_days } = req.body;
    const userId = req.params.id;
    try {
        const start_date = new Date();
        const expiry_date = new Date();
        expiry_date.setDate(start_date.getDate() + parseInt(validity_days || 30));

        let sub = await UserSubscription.findOne({ where: { user_id: userId } });
        if (sub) {
            await sub.update({ start_date, expiry_date, status: 'Active', validity_days });
        } else {
            sub = await UserSubscription.create({ user_id: userId, start_date, expiry_date, status: 'Active', validity_days });
        }

        await SubscriptionAuditLog.create({ user_id: userId, admin_id: req.user.id, action: 'ASSIGNED', new_status: 'Active' });
        res.json({ message: 'Subscription assigned', subscription: sub });
    } catch (e) { res.status(500).json({ error: 'Subscription assignment failed' }); }
};

exports.suspendSubscription = async (req, res) => {
    try {
        await UserSubscription.update({ status: 'Suspended' }, { where: { user_id: req.params.id } });
        await SubscriptionAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action: 'SUSPENDED', new_status: 'Suspended' });
        res.json({ message: 'User subscription suspended' });
    } catch (e) { res.status(500).json({ error: 'Suspension failed' }); }
};

exports.reactivateSubscription = async (req, res) => {
    try {
        const sub = await UserSubscription.findOne({ where: { user_id: req.params.id } });
        if (!sub) return res.status(404).json({ error: 'No subscription found' });
        
        const start_date = new Date();
        const expiry_date = new Date();
        expiry_date.setDate(start_date.getDate() + (sub.validity_days || 30));
        await sub.update({ start_date, expiry_date, status: 'Active' });
        
        await SubscriptionAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action: 'REACTIVATED', new_status: 'Active' });
        res.json({ message: 'Subscription reactivated', subscription: sub });
    } catch (e) { res.status(500).json({ error: 'Reactivation failed' }); }
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

        await UserAuditLog.create({ user_id: userId, admin_id: req.user.id, action_type: 'USER_CREATED', changes_json: req.body }, { transaction });

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
        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: 'PROFILE_UPDATED', changes_json: req.body });
        res.json({ message: 'Profile updated' });
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
};

exports.changeUserStatus = async (req, res) => {
    try {
        await User.update({ is_active: req.body.is_active }, { where: { id: req.params.id } });
        await UserAuditLog.create({ user_id: req.params.id, admin_id: req.user.id, action_type: req.body.is_active ? 'ACTIVATED' : 'DEACTIVATED', changes_json: req.body });
        res.json({ message: `User status changed to ${req.body.is_active}` });
    } catch (e) { res.status(500).json({ error: 'Status update failed' }); }
};

exports.getUserAuditTrail = async (req, res) => {
    try {
        const logs = await UserAuditLog.findAll({ where: { user_id: req.params.id }, order: [['created_at', 'DESC']] });
        res.json({ history: logs });
    } catch (e) { res.status(500).json({ error: 'Audit fetch failed' }); }
};
