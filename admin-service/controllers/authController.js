/**
 * Admin Authentication Controller
 * - adminLogin : email + password (bcrypt), returns JWT
 * - adminRegister : create new admin/manager account (super_admin only)
 */
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { AdminUser } = require('../models');

const JWT_SECRET  = process.env.JWT_SECRET  || 'fallback_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES  || '8h';

/* ── POST /api/admin/auth/login ──────────────────────────── */
exports.adminLogin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const admin = await AdminUser.findOne({ where: { email: email.toLowerCase().trim() } });

        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        if (!admin.is_active) {
            return res.status(403).json({ error: 'This admin account has been deactivated.' });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Update last login timestamp
        await admin.update({ last_login_at: new Date() });

        const token = jwt.sign(
            { id: admin.id, role: admin.role, email: admin.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        return res.json({
            token,
            role:  admin.role,
            name:  admin.name,
            email: admin.email,
            message: 'Login successful'
        });

    } catch (err) {
        console.error('[adminLogin]', err);
        return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

/* ── POST /api/admin/auth/register  (super_admin only) ───── */
exports.adminRegister = async (req, res) => {
    const { name, email, password, role = 'admin' } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email and password are required.' });
    }

    const ALLOWED_ROLES = ['super_admin', 'admin', 'manager'];
    if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
    }

    try {
        const existing = await AdminUser.findOne({ where: { email: email.toLowerCase().trim() } });
        if (existing) {
            return res.status(409).json({ error: 'An admin with this email already exists.' });
        }

        const password_hash = await bcrypt.hash(password, 12);
        const admin = await AdminUser.create({
            name, email: email.toLowerCase().trim(), password_hash, role
        });

        return res.status(201).json({
            message: 'Admin account created successfully.',
            id: admin.id, name: admin.name, email: admin.email, role: admin.role
        });
    } catch (err) {
        console.error('[adminRegister]', err);
        return res.status(500).json({ error: 'Registration failed.' });
    }
};

/* ── GET /api/admin/auth/me ─────────────────────────────── */
exports.getMe = async (req, res) => {
    try {
        const admin = await AdminUser.findByPk(req.user.id, {
            attributes: ['id', 'name', 'email', 'role', 'last_login_at', 'created_at']
        });
        if (!admin) return res.status(404).json({ error: 'Admin not found.' });
        res.json(admin);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
};
