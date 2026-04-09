/**
 * AdminUser model — separate table from patient 'users' table.
 * Stores admin/manager accounts with email + bcrypt-hashed password.
 * Added to admin-service/models/index.js via this snippet.
 *
 * Table: admin_users
 */
const { Sequelize, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('admin_user', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            validate: { isEmail: true }
        },
        password_hash: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        role: {
            type: DataTypes.ENUM('super_admin', 'admin', 'manager'),
            defaultValue: 'admin'
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        last_login_at: {
            type: DataTypes.DATE
        }
    }, {
        tableName: 'admin_users',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });
};
