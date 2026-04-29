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

// MB-11 extended demographic fields added to existing user_profiles table
const UserProfile = sequelize.define('user_profile', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    date_of_birth: DataTypes.DATEONLY,
    gender: DataTypes.STRING(20),
    height: DataTypes.DECIMAL(5, 2),
    height_unit: DataTypes.STRING(10),
    weight: DataTypes.DECIMAL(5, 2),
    weight_unit: DataTypes.STRING(10),
    bmi: DataTypes.DECIMAL(5, 2),
    // Extended demographics (MB-11)
    blood_group: DataTypes.STRING(10),
    occupation: DataTypes.STRING(100),
    marital_status: DataTypes.STRING(30),
    waist_circumference: DataTypes.DECIMAL(5, 2),
    hip_circumference: DataTypes.DECIMAL(5, 2),
    waist_to_hip_ratio: DataTypes.DECIMAL(5, 3),
    program_start_date: DataTypes.DATEONLY,
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
}, { tableName: 'user_lifestyle', timestamps: true, createdAt: false, updatedAt: 'updated_at' });

// MB-10: step_goal added to user_settings
const UserSettings = sequelize.define('user_setting', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    push_notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    email_notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    app_version: { type: DataTypes.STRING(50) },
    step_goal: { type: DataTypes.INTEGER, defaultValue: 10000 }
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
    requested_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    processed_at: { type: DataTypes.DATE }
}, { tableName: 'data_deletion_requests', timestamps: false });

// MB-12: Body composition metrics
const UserBodyComposition = sequelize.define('user_body_composition', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    body_fat_pct: DataTypes.DECIMAL(5, 2),
    muscle_mass_pct: DataTypes.DECIMAL(5, 2),
    hydration_pct: DataTypes.DECIMAL(5, 2),
    bone_mass_kg: DataTypes.DECIMAL(5, 2),
    recorded_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'user_body_composition', timestamps: false });

// MB-13: Blood test profile
const UserBloodTest = sequelize.define('user_blood_test', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    fasting_blood_sugar: DataTypes.DECIMAL(6, 2),
    hba1c: DataTypes.DECIMAL(4, 1),
    hemoglobin: DataTypes.DECIMAL(4, 1),
    total_cholesterol: DataTypes.DECIMAL(6, 2),
    ldl_cholesterol: DataTypes.DECIMAL(6, 2),
    blood_pressure_systolic: DataTypes.INTEGER,
    blood_pressure_diastolic: DataTypes.INTEGER,
    recorded_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'user_blood_tests', timestamps: false });

// MB-14: Wellness quotes (admin-managed)
const WellnessQuote = sequelize.define('wellness_quote', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    quote_text: { type: DataTypes.TEXT, allowNull: false },
    author: { type: DataTypes.STRING(255), defaultValue: 'Unknown' },
    day_of_week: { type: DataTypes.INTEGER } // 0=Sun … 6=Sat; NULL = random pool
}, { tableName: 'wellness_quotes', timestamps: true, createdAt: 'created_at', updatedAt: false });

// MB-15: Wellness task templates (admin-managed)
const WellnessTask = sequelize.define('wellness_task', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: DataTypes.TEXT,
    category: { type: DataTypes.STRING(50), defaultValue: 'Health' }, // Health | Mental Wellbeing | Nutrition
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'wellness_tasks', timestamps: true, createdAt: 'created_at', updatedAt: false });

// MB-15: User task completions
const UserTaskCompletion = sequelize.define('user_task_completion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    task_id: { type: DataTypes.INTEGER },
    completed_date: { type: DataTypes.DATEONLY, allowNull: false }
}, { tableName: 'user_task_completions', timestamps: false });

// MB-16: Announcements (admin-created, user-readable)
const Announcement = sequelize.define('announcement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    short_description: DataTypes.TEXT,
    full_content: DataTypes.TEXT,
    created_by: DataTypes.STRING(255),
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'announcements', timestamps: true, createdAt: 'created_at', updatedAt: false });

module.exports = {
    sequelize,
    User, UserProfile,
    UserMedicalCondition, UserMedication, UserAllergy, UserLifestyle,
    UserSettings, UserConsent, DataDeletionRequest,
    UserBodyComposition, UserBloodTest,
    WellnessQuote, WellnessTask, UserTaskCompletion, Announcement
};
