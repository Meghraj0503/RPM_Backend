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

const NotificationTemplate = sequelize.define('notification_template', {
    trigger_code: { type: DataTypes.STRING(100), primaryKey: true },
    category: { type: DataTypes.STRING(100) },
    title_template: { type: DataTypes.STRING(255) },
    message_template: { type: DataTypes.TEXT }
}, { tableName: 'notification_templates', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Notification = sequelize.define('notification', {
    id: { type: DataTypes.STRING(20), primaryKey: true, defaultValue: Sequelize.literal("'NOT-' || nextval('notif_seq')") },
    user_id: { type: DataTypes.STRING(20) },
    category: { type: DataTypes.STRING(100) },
    title: { type: DataTypes.STRING(255) },
    message: { type: DataTypes.TEXT },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'notifications', timestamps: true, createdAt: 'created_at', updatedAt: false });

module.exports = { sequelize, NotificationTemplate, Notification };
