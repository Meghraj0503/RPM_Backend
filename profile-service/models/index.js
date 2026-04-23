const { Sequelize, DataTypes } = require('sequelize');
const dotenv = require('dotenv');
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
    name: { type: DataTypes.STRING }
}, { tableName: 'users', timestamps: false });

const UserProfile = sequelize.define('user_profile', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    date_of_birth: DataTypes.DATEONLY,
    gender: DataTypes.STRING(20),
    height: DataTypes.DECIMAL(5, 2),
    height_unit: DataTypes.STRING(10),
    weight: DataTypes.DECIMAL(5, 2),
    weight_unit: DataTypes.STRING(10),
    bmi: DataTypes.DECIMAL(5, 2),
    is_personal_setup: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_medical_setup: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_lifestyle_setup: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'user_profiles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserMedicalCondition = sequelize.define('user_medical_condition', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    condition_name: { type: DataTypes.STRING(255), allowNull: false }
}, { tableName: 'user_medical_conditions', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserMedication = sequelize.define('user_medication', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    medication_name: { type: DataTypes.STRING(255), allowNull: false }
}, { tableName: 'user_medications', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserAllergy = sequelize.define('user_allergy', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    allergy_name: { type: DataTypes.STRING(255), allowNull: false }
}, { tableName: 'user_allergies', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserLifestyle = sequelize.define('user_lifestyle', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    diet_type: DataTypes.STRING(50),
    physical_activity_level: DataTypes.STRING(50),
    average_sleep_hours: DataTypes.DECIMAL(4, 2),
    smoking_status: DataTypes.STRING(50),
    alcohol_consumption: DataTypes.STRING(50),
}, { tableName: 'user_lifestyle', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserSettings = sequelize.define('user_setting', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    push_notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    email_notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    app_version: { type: DataTypes.STRING(50) }
}, { tableName: 'user_settings', timestamps: true, createdAt: false, updatedAt: 'updated_at' });

const UserConsent = sequelize.define('user_consent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    consent_version: { type: DataTypes.STRING(50), allowNull: false },
    status: { type: DataTypes.STRING(50), defaultValue: 'Accepted' },
    ip_address: { type: DataTypes.STRING(100) },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
}, { tableName: 'user_consents', timestamps: false });

const DataDeletionRequest = sequelize.define('data_deletion_request', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    status: { type: DataTypes.STRING(50), defaultValue: 'Pending' },
    requested_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'data_deletion_requests', timestamps: false });

module.exports = { sequelize, User, UserProfile, UserMedicalCondition, UserMedication, UserAllergy, UserLifestyle, UserSettings, UserConsent, DataDeletionRequest };
