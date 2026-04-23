const { Sequelize, DataTypes } = require('sequelize');
const dotenv = require('dotenv');
const defineAdminUser = require('./adminUser');
dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME || 'remote_patient_monitor',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
});

const User = sequelize.define('user', {
    id: { type: DataTypes.STRING(20), primaryKey: true },
    name: { type: DataTypes.STRING },
    phone_number: { type: DataTypes.STRING },
    is_admin: { type: DataTypes.BOOLEAN },
    is_manager: { type: DataTypes.BOOLEAN },
    is_user: { type: DataTypes.BOOLEAN },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_login_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE }
}, { tableName: 'users', timestamps: false });

const UserProfile = sequelize.define('user_profile', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    date_of_birth: DataTypes.DATEONLY,
    gender: DataTypes.STRING(20),
    height: DataTypes.DECIMAL(5, 2),
    weight: DataTypes.DECIMAL(5, 2),
    bmi: DataTypes.DECIMAL(5, 2)
}, { tableName: 'user_profiles', timestamps: false });

const UserVital = sequelize.define('user_vital', {
    id: { type: DataTypes.STRING(25), primaryKey: true, defaultValue: Sequelize.literal("'VIT-' || nextval('vital_seq')") },
    user_id: { type: DataTypes.STRING(20) },
    vital_type: { type: DataTypes.STRING(50) },
    vital_value: { type: DataTypes.DECIMAL(10, 2) },
    recorded_at: { type: DataTypes.DATE }
}, { tableName: 'user_vitals', timestamps: false });

const UserAlert = sequelize.define('user_alert', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'ALR-' || nextval('alert_seq')") },
    user_id: { type: DataTypes.STRING(20) },
    vital_type: { type: DataTypes.STRING(50) },
    message: { type: DataTypes.TEXT },
    is_resolved: { type: DataTypes.BOOLEAN },
    created_at: { type: DataTypes.DATE }
}, { tableName: 'user_alerts', timestamps: false });

const QuestionnaireTemplate = sequelize.define('questionnaire_template', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'QST-' || nextval('qst_seq')") },
    title: { type: DataTypes.STRING(255) },
    category: { type: DataTypes.STRING(100) },
    type: { type: DataTypes.STRING(50), defaultValue: 'One-Time' },
    created_by: { type: DataTypes.STRING(255) },
    scheduled_days_after_enrollment: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'questionnaire_templates', timestamps: true, createdAt: 'created_at', updatedAt: false });

const Question = sequelize.define('question', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    questionnaire_id: { type: DataTypes.STRING(20) },
    question_text: { type: DataTypes.TEXT },
    question_type: { type: DataTypes.STRING(50) },
    options_json: { type: DataTypes.JSONB },
    sort_order: { type: DataTypes.INTEGER }
}, { tableName: 'questions', timestamps: false });

const UserQuestionnaire = sequelize.define('user_questionnaire', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'UQS-' || nextval('uqs_seq')") },
    user_id: { type: DataTypes.STRING(20) },
    questionnaire_id: { type: DataTypes.STRING(20) },
    status: { type: DataTypes.STRING(50), defaultValue: 'Pending' },
    scheduled_for: { type: DataTypes.DATE },
    priority: { type: DataTypes.STRING(50), defaultValue: 'Normal' },
    is_mandatory: { type: DataTypes.BOOLEAN, defaultValue: false },
    completed_at: { type: DataTypes.DATE },
    overall_score: { type: DataTypes.DECIMAL(5, 2) }
}, { tableName: 'user_questionnaires', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserQuestionnaireScore = sequelize.define('user_questionnaire_score', {
    user_questionnaire_id: { type: DataTypes.STRING(20), primaryKey: true },
    overall_score: { type: DataTypes.DECIMAL(5, 2) },
    domain_scores_json: { type: DataTypes.JSONB, allowNull: false }
}, { tableName: 'user_questionnaire_scores', timestamps: false });

const Article = sequelize.define('article', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'ART-' || nextval('article_seq')") },
    title: { type: DataTypes.STRING },
    author_name: { type: DataTypes.STRING },
    content: { type: DataTypes.TEXT },
    category: { type: DataTypes.STRING },
    cover_image_url: { type: DataTypes.STRING(500) },
    estimated_read_time: { type: DataTypes.INTEGER },
    is_published: { type: DataTypes.BOOLEAN, defaultValue: false },
    published_at: { type: DataTypes.DATE },
    scheduled_publish_at: { type: DataTypes.DATE },
    publish_status: { type: DataTypes.STRING(20), defaultValue: 'draft' }  // 'draft' | 'scheduled' | 'published'
}, { tableName: 'articles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const ManagerAssignedUser = sequelize.define('manager_assigned_user', {
    manager_id: { type: DataTypes.STRING(20), primaryKey: true },
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    assigned_at: { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
}, { tableName: 'manager_assigned_users', timestamps: false });

// Profile Detail Models
const UserMedicalCondition = sequelize.define('user_medical_condition', {
    user_id: { type: DataTypes.STRING(20) },
    condition_name: { type: DataTypes.STRING }
}, { tableName: 'user_medical_conditions', timestamps: false });

const UserMedication = sequelize.define('user_medication', {
    user_id: { type: DataTypes.STRING(20) },
    medication_name: { type: DataTypes.STRING }
}, { tableName: 'user_medications', timestamps: false });

const UserAllergy = sequelize.define('user_allergy', {
    user_id: { type: DataTypes.STRING(20) },
    allergy_name: { type: DataTypes.STRING }
}, { tableName: 'user_allergies', timestamps: false });

const UserLifestyle = sequelize.define('user_lifestyle', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    diet_type: DataTypes.STRING,
    physical_activity_level: DataTypes.STRING,
    smoking_status: DataTypes.STRING,
    alcohol_consumption: DataTypes.STRING
}, { tableName: 'user_lifestyle', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserDevice = sequelize.define('user_device', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'DEV-' || nextval('device_seq')") },
    user_id: { type: DataTypes.STRING(20) },
    device_name: { type: DataTypes.STRING(255) },
    mac_address: { type: DataTypes.STRING(50) },
    nickname: { type: DataTypes.STRING(255) },
    assigned_by: { type: DataTypes.STRING(255) },
    assigned_at: { type: DataTypes.DATE },
    is_connected: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_connected_at: { type: DataTypes.DATE }
}, { tableName: 'user_devices', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserSubscription = sequelize.define('user_subscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    program_name: { type: DataTypes.STRING(255), defaultValue: 'Wellness Program 2025' },
    enrolled_by: { type: DataTypes.STRING(255), defaultValue: 'System Auto' },
    start_date: DataTypes.DATEONLY,
    expiry_date: DataTypes.DATEONLY,
    status: { type: DataTypes.STRING(50), defaultValue: 'Active' },
    validity_days: DataTypes.INTEGER
}, { tableName: 'user_subscriptions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const SubscriptionAuditLog = sequelize.define('subscription_audit_log', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    admin_id: { type: DataTypes.STRING(20) },
    program_name: DataTypes.STRING,
    reason: DataTypes.TEXT,
    action: DataTypes.STRING,
    previous_status: DataTypes.STRING,
    new_status: DataTypes.STRING
}, { tableName: 'subscription_audit_logs', timestamps: true, createdAt: 'created_at', updatedAt: false });

const DashboardConfig = sequelize.define('dashboard_config', {
    admin_id: { type: DataTypes.STRING(20), primaryKey: true },
    layout_json: DataTypes.JSONB
}, { tableName: 'dashboard_configs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserAuditLog = sequelize.define('user_audit_log', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    admin_id: { type: DataTypes.STRING(20) },
    action_type: DataTypes.STRING,
    category: { type: DataTypes.STRING(50), defaultValue: 'Other' },
    changes_json: DataTypes.JSONB
}, { tableName: 'user_audit_logs', timestamps: true, createdAt: 'created_at', updatedAt: false });

const ExportHistory = sequelize.define('export_history', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    admin_id: { type: DataTypes.STRING(20) },
    export_type: { type: DataTypes.STRING(50) },
    file_name: { type: DataTypes.STRING(255) },
    fields_exported: { type: DataTypes.JSONB },
    date_from: { type: DataTypes.DATEONLY },
    date_to: { type: DataTypes.DATEONLY },
    program: { type: DataTypes.STRING(255) },
    row_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    file_size_kb: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'export_history', timestamps: true, createdAt: 'created_at', updatedAt: false });

// Admin user table (email + bcrypt password — separate from patient users)
const AdminUser = defineAdminUser(sequelize);

// Relationships for easy includes
User.hasOne(UserProfile, { foreignKey: 'user_id' });
UserProfile.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(UserMedicalCondition, { foreignKey: 'user_id' });
User.hasMany(UserMedication, { foreignKey: 'user_id' });
User.hasMany(UserAllergy, { foreignKey: 'user_id' });
User.hasOne(UserLifestyle, { foreignKey: 'user_id' });
User.hasOne(UserSubscription, { foreignKey: 'user_id' });
UserSubscription.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(UserDevice, { foreignKey: 'user_id' });
User.hasMany(UserVital, { foreignKey: 'user_id' });
UserVital.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(UserAlert, { foreignKey: 'user_id' });
UserAlert.belongsTo(User, { foreignKey: 'user_id' });
// Questionnaire relationships
QuestionnaireTemplate.hasMany(Question, { foreignKey: 'questionnaire_id', as: 'questions' });
Question.belongsTo(QuestionnaireTemplate, { foreignKey: 'questionnaire_id' });

User.hasMany(UserQuestionnaire, { foreignKey: 'user_id' });
UserQuestionnaire.belongsTo(User, { foreignKey: 'user_id' });

QuestionnaireTemplate.hasMany(UserQuestionnaire, { foreignKey: 'questionnaire_id' });
UserQuestionnaire.belongsTo(QuestionnaireTemplate, { foreignKey: 'questionnaire_id' });

UserQuestionnaire.hasOne(UserQuestionnaireScore, { foreignKey: 'user_questionnaire_id', as: 'scores' });
UserQuestionnaireScore.belongsTo(UserQuestionnaire, { foreignKey: 'user_questionnaire_id' });

module.exports = { sequelize, AdminUser, User, UserProfile, UserVital, UserAlert, QuestionnaireTemplate, Question, UserQuestionnaire, UserQuestionnaireScore, Article, ManagerAssignedUser, UserMedicalCondition, UserMedication, UserAllergy, UserLifestyle, UserDevice, UserSubscription, SubscriptionAuditLog, DashboardConfig, UserAuditLog, ExportHistory };
