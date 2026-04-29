/**
 * Seed script - creates the default super_admin account.
 * Run once: node seed.js
 *
 * Default credentials:
 *   Email   : admin@aayu.health
 *   Password: Admin@123
 *
 * Change these immediately after first login in production!
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const defineAdminUser = require('./models/adminUser');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME || 'remote_patient_monitor',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false
    }
);

const AdminUser = defineAdminUser(sequelize);

const DEFAULT_ADMINS = [
    {
        name: 'Super Admin',
        email: 'admin@pillnurse.com',
        password: 'Admin@123',
        role: 'super_admin'
    },
    {
        name: 'Program Manager',
        email: 'manager@pillnurse.com',
        password: 'Manager@123',
        role: 'manager'
    }
];

async function seed() {
    try {
        // Sync only this table (additive - safe)
        await AdminUser.sync({ alter: { drop: false } });
        console.log('✅  admin_users table synced');

        for (const a of DEFAULT_ADMINS) {
            const existing = await AdminUser.findOne({ where: { email: a.email } });
            if (existing) {
                console.log(`⏭️  Skipped (already exists): ${a.email}`);
                continue;
            }

            const password_hash = await bcrypt.hash(a.password, 12);
            await AdminUser.create({ name: a.name, email: a.email, password_hash, role: a.role });
            console.log(`✅  Created ${a.role}: ${a.email}  (password: ${a.password})`);
        }

        console.log('\n🎉  Seed complete!');
        console.log('──────────────────────────────────────────');
        console.log('  Admin Login   → admin@pillnurse.com  / Admin@123');
        console.log('  Manager Login → manager@pillnurse.com / Manager@123');
        console.log('──────────────────────────────────────────');
    } catch (err) {
        console.error('❌  Seed failed:', err.message);
    } finally {
        await sequelize.close();
    }
}

seed();
