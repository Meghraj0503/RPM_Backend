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
    vital_value: { type: DataTypes.DECIMAL(10,2), allowNull: false },
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
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true,
        autoIncrement: true
    },
    user_id: { type: DataTypes.STRING(20) },
    device_name: { type: DataTypes.STRING(100) },
    mac_address: { type: DataTypes.STRING(50) },
    last_connected_at: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING(20), defaultValue: 'Connected' }
}, { tableName: 'user_devices', timestamps: true, createdAt: 'created_at', updatedAt: false });

const UserSubscription = sequelize.define('user_subscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.STRING(20) },
    expiry_date: { type: DataTypes.DATEONLY },
    status: { type: DataTypes.STRING(50), defaultValue: 'Active' },
    validity_days: { type: DataTypes.INTEGER }
}, { tableName: 'user_subscriptions', timestamps: false });

module.exports = { sequelize, UserVital, UserAlert, UserDevice, UserSubscription };
