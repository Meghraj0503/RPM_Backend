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

const UserVital = sequelize.define('user_vital', {
    id: {
        type: DataTypes.STRING(25),
        primaryKey: true,
        defaultValue: Sequelize.literal("'VIT-' || nextval('vital_seq')")
    },
    user_id: { type: DataTypes.STRING(20) },
    vital_type: { type: DataTypes.STRING(50), allowNull: false },
    vital_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    vital_unit: { type: DataTypes.STRING(20) },
    is_manual: { type: DataTypes.BOOLEAN, defaultValue: false },
    source: { type: DataTypes.STRING(100) },
    recorded_at: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'user_vitals', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserAlert = sequelize.define('user_alert', {
    id: {
        type: DataTypes.STRING(20),
        primaryKey: true,
        defaultValue: Sequelize.literal("'ALR-' || nextval('alert_seq')")
    },
    user_id: { type: DataTypes.STRING(20) },
    vital_type: { type: DataTypes.STRING(50), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    is_resolved: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'user_alerts', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserDevice = sequelize.define('user_device', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    device_name: { type: DataTypes.STRING(255) },
    mac_address: { type: DataTypes.STRING(50) },
    nickname: { type: DataTypes.STRING(255) },
    assigned_by: { type: DataTypes.STRING(255) },
    assigned_at: { type: DataTypes.DATE },
    is_connected: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_connected_at: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING(20), defaultValue: 'Connected' } // Legacy column in model
}, { tableName: 'user_devices', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserSubscription = sequelize.define('user_subscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    expiry_date: { type: DataTypes.DATEONLY },
    status: { type: DataTypes.STRING(50), defaultValue: 'Active' },
    validity_days: { type: DataTypes.INTEGER }
}, { tableName: 'user_subscriptions', timestamps: false });

const UserSyncLog = sequelize.define('user_sync_log', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true, allowNull: false },
    last_synced_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW }
}, { tableName: 'user_sync_logs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

// Notification model — shared DB, used to fire health-alert inbox entries from vitals-service
const Notification = sequelize.define('notification', {
    id: {
        type: DataTypes.STRING(20),
        primaryKey: true,
        defaultValue: Sequelize.literal("'NOT-' || nextval('notif_seq')")
    },
    user_id: { type: DataTypes.STRING(20) },
    category: { type: DataTypes.STRING(100) },
    title: { type: DataTypes.STRING(255) },
    message: { type: DataTypes.TEXT },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'notifications', timestamps: true, createdAt: 'created_at', updatedAt: false });

module.exports = { sequelize, UserVital, UserAlert, UserDevice, UserSubscription, UserSyncLog, Notification };
