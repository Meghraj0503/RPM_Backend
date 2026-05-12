const { User, UserProfile, RefreshToken, sequelize } = require('../models');
const admin = require('../firebase');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const ACCESS_TTL = '24h';       // Short-lived access token
const REFRESH_TTL_DAYS = 30;  // Long-lived refresh token

const authMiddleware = require('../authMiddleware');

exports.verifyOtp = async (req, res) => {
    const idToken = req.headers.authorization;
    if (!idToken) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const phoneNumber = decodedToken.phone_number;

        if (!phoneNumber) {
            return res.status(400).json({ error: 'No phone number linked' });
        }

        let user = await User.findOne({ where: { phone_number: phoneNumber } });

        if (!user) {
            user = await User.create({
                phone_number: phoneNumber,
                is_user: true,
                is_active: true
            });

            await UserProfile.create({ user_id: user.id });

            // Auto-link to any program_members with matching phone (last 10 digits)
            const last10 = phoneNumber.replace(/\D/g, '').slice(-10);
            if (last10) {
                try {
                    await sequelize.query(
                        `UPDATE program_members SET user_id = :userId WHERE user_id IS NULL AND RIGHT(phone, 10) = :last10`,
                        { replacements: { userId: user.id, last10 } }
                    );

                    // Find every program this user was just linked to
                    const linkedPrograms = await sequelize.query(
                        `SELECT DISTINCT p.id AS program_id, p.name AS program_name
                         FROM program_members pm
                         JOIN programs p ON p.id = pm.program_id
                         WHERE pm.user_id = :userId`,
                        { replacements: { userId: user.id }, type: sequelize.QueryTypes.SELECT }
                    );

                    for (const prog of linkedPrograms) {
                        // Create subscription only if not already existing for this program
                        await sequelize.query(
                            `INSERT INTO user_subscriptions
                               (user_id, program_name, enrolled_by, start_date, expiry_date, status, validity_days, created_at, updated_at)
                             SELECT :userId, :progName, 'System Auto',
                                    NOW(), NOW() + INTERVAL '365 days', 'Active', 365, NOW(), NOW()
                             WHERE NOT EXISTS (
                                 SELECT 1 FROM user_subscriptions
                                 WHERE user_id = :userId AND program_name = :progName
                             )`,
                            { replacements: { userId: user.id, progName: prog.program_name } }
                        );
                        // Enrollment audit log
                        await sequelize.query(
                            `INSERT INTO subscription_audit_logs
                               (user_id, admin_id, action, program_name, new_status, created_at)
                             VALUES (:userId, 'SYSTEM', 'AUTO_ASSIGNED', :progName, 'Active', NOW())`,
                            { replacements: { userId: user.id, progName: prog.program_name } }
                        );
                        // User audit trail
                        await sequelize.query(
                            `INSERT INTO user_audit_logs
                               (user_id, admin_id, action_type, category, changes_json, created_at, updated_at)
                             VALUES (:userId, 'SYSTEM', 'PROGRAM_AUTO_ASSIGNED', 'Program',
                                     :changes::jsonb, NOW(), NOW())`,
                            { replacements: {
                                userId: user.id,
                                changes: JSON.stringify({ program: prog.program_name, source: 'phone_match_on_registration' })
                            }}
                        );
                    }
                } catch { /* non-fatal if program_members table doesn't exist */ }
            }
        }

        if (!user.is_active) {
            return res.status(403).json({
                error: 'Account deactivated. Contact support.'
            });
        }

        user.last_login_at = new Date();
        await user.save();

        const accessToken = jwt.sign(
            { id: user.id, phoneNumber },
            JWT_SECRET,
            { expiresIn: ACCESS_TTL }
        );

        // GQ-05: Issue refresh token
        const rawToken = crypto.randomBytes(48).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000);
        await RefreshToken.create({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });

        return res.json({
            message: 'Authentication successful',
            token: accessToken,
            refresh_token: rawToken,
            expires_in: 3600,
            user: { id: user.id, phone: phoneNumber }
        });

    } catch (error) {
        console.error(error);
        return res.status(401).json({
            error: 'Invalid or expired Firebase ID token.'
        });
    }
};

// 1.2 – Enable/disable biometric login for a returning authenticated user
exports.enableBiometric = async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        await User.update({ biometric_enabled: req.body.enabled }, { where: { id: decoded.id } });
        res.json({ message: `Biometric login ${req.body.enabled ? 'enabled' : 'disabled'}` });
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

// 1.2 – Verify biometric: OS biometric succeeds on device, frontend sends stored JWT for re-issue
exports.verifyBiometric = async (req, res) => {
    const { sessionToken } = req.body;
    try {
        const decoded = jwt.verify(sessionToken, JWT_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user || !user.biometric_enabled) return res.status(403).json({ error: 'Biometric not enabled for this account' });
        if (user.is_active === false) return res.status(403).json({ error: 'Account deactivated' });
        const newToken = jwt.sign(
            { id: user.id, phoneNumber: user.phone_number },
            JWT_SECRET,
            { expiresIn: ACCESS_TTL }
        );
        await user.update({ last_login_at: new Date() });
        res.json({ message: 'Biometric login successful', token: newToken, expires_in: 3600 });
    } catch (e) { res.status(401).json({ error: 'Invalid or expired session token' }); }
};

// GQ-05: Refresh access token using a valid refresh token
exports.refreshToken = async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required' });
    try {
        const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        const record = await RefreshToken.findOne({
            where: { token_hash: tokenHash, is_revoked: false }
        });
        if (!record) return res.status(401).json({ error: 'Invalid refresh token' });
        if (new Date() > record.expires_at) {
            await record.update({ is_revoked: true });
            return res.status(401).json({ error: 'Refresh token expired. Please log in again.' });
        }
        const user = await User.findByPk(record.user_id);
        if (!user || !user.is_active) return res.status(403).json({ error: 'Account not accessible' });

        const newAccessToken = jwt.sign(
            { id: user.id, phoneNumber: user.phone_number },
            JWT_SECRET,
            { expiresIn: ACCESS_TTL }
        );
        res.json({ token: newAccessToken, expires_in: 3600 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Token refresh failed' });
    }
};

// GQ-05: Revoke refresh token (logout)
exports.logout = async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.json({ message: 'Logged out' });
    try {
        const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        await RefreshToken.update({ is_revoked: true }, { where: { token_hash: tokenHash } });
        res.json({ message: 'Logged out successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Logout failed' });
    }
};

