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
    id: {
        type: DataTypes.STRING(20),
        primaryKey: true,
        defaultValue: Sequelize.literal("'USR-' || nextval('user_seq')")
    },
    name: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone_number: { type: DataTypes.STRING(15), allowNull: false },
    is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_manager: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_user: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    biometric_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_login_at: { type: DataTypes.DATE }
}, { tableName: 'users', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const UserProfile = sequelize.define('user_profile', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true }
}, { tableName: 'user_profiles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

// GQ-05: Refresh token store
const RefreshToken = sequelize.define('refresh_token', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20), allowNull: false },
    token_hash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    is_revoked: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'refresh_tokens', timestamps: true, createdAt: 'created_at', updatedAt: false });

module.exports = { sequelize, User, UserProfile, RefreshToken };
