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
    name: { type: DataTypes.STRING },
    phone_number: { type: DataTypes.STRING },
    is_admin: { type: DataTypes.BOOLEAN }
}, { tableName: 'users', timestamps: false });

const TrainingCategory = sequelize.define('training_category', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), unique: true, allowNull: false }
}, { tableName: 'training_categories', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const TrainingModule = sequelize.define('training_module', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'TRN-' || nextval('trn_seq')") },
    title: { type: DataTypes.STRING(255), allowNull: false },
    short_description: { type: DataTypes.STRING(255) },
    full_description: { type: DataTypes.TEXT },
    duration_minutes: { type: DataTypes.INTEGER },
    thumbnail_url: { type: DataTypes.STRING(500) },
    difficulty_level: { type: DataTypes.STRING(50), defaultValue: 'Intermediate' },
    is_published: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: { type: DataTypes.STRING(255) }
}, { tableName: 'training_modules', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const TrainingModuleCategory = sequelize.define('training_module_category', {
    module_id: { type: DataTypes.STRING(20), primaryKey: true },
    category_id: { type: DataTypes.INTEGER, primaryKey: true }
}, { tableName: 'training_module_categories', timestamps: false });

const TrainingSession = sequelize.define('training_session', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    module_id: { type: DataTypes.STRING(20) },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content_json: { type: DataTypes.JSONB },
    order_index: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'training_sessions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const TrainingSessionProgress = sequelize.define('training_session_progress', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    session_id: { type: DataTypes.INTEGER },
    is_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
    completed_at: { type: DataTypes.DATE }
}, { tableName: 'training_session_progress', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

// Training relationships
TrainingModule.belongsToMany(TrainingCategory, { through: TrainingModuleCategory, foreignKey: 'module_id', as: 'categories' });
TrainingCategory.belongsToMany(TrainingModule, { through: TrainingModuleCategory, foreignKey: 'category_id', as: 'modules' });

TrainingModule.hasMany(TrainingSession, { foreignKey: 'module_id', as: 'sessions' });
TrainingSession.belongsTo(TrainingModule, { foreignKey: 'module_id' });

User.hasMany(TrainingSessionProgress, { foreignKey: 'user_id' });
TrainingSessionProgress.belongsTo(User, { foreignKey: 'user_id' });

TrainingSession.hasMany(TrainingSessionProgress, { foreignKey: 'session_id' });
TrainingSessionProgress.belongsTo(TrainingSession, { foreignKey: 'session_id' });

module.exports = { sequelize, User, TrainingCategory, TrainingModule, TrainingModuleCategory, TrainingSession, TrainingSessionProgress };
