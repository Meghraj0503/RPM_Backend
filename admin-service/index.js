const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const { sequelize, AdminUser } = require('./models');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes  = require('./routes/authRoutes');

dotenv.config();
const app  = express();
const PORT = process.env.PORT || 3006;

const path = require('path');
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Admin auth (email + password) — public + protected
app.use('/api/admin/auth', authRoutes);

// All other admin routes (protected via adminMiddleware inside)
app.use('/api/admin', adminRoutes);

// Sync all models including new admin_users table
sequelize.sync({ alter: { drop: false } }).then(() => {
    console.log('Admin Service DB synced (admin_users table ready).');
    app.listen(PORT, () => console.log(`Admin Service running on port ${PORT}`));
}).catch(console.error);

