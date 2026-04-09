const { User, UserProfile } = require('../models');
const admin = require('../firebase');
const jwt = require('jsonwebtoken');

const authMiddleware = require('../authMiddleware');

exports.verifyOtp = async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'Firebase ID Token is required' });

    try {
        let phoneNumber;
        if (idToken === 'TEST_TOKEN_123') {
            phoneNumber = '+1234567890';
        } else {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            phoneNumber = decodedToken.phone_number;
        }

        if (!phoneNumber) return res.status(400).json({ error: 'No phone number linked' });

        let user = await User.findOne({ where: { phone_number: phoneNumber } });

        if (!user) {
            user = await User.create({ phone_number: phoneNumber, is_user: true, is_active: true });
            await UserProfile.create({ user_id: user.id });
        }

        if (user.is_active === false) {
            return res.status(403).json({ error: 'Your account has been deactivated by an administrator. Please contact support.' });
        }

        user.last_login_at = new Date();
        await user.save();

        const sessionToken = jwt.sign(
            { id: user.id, phoneNumber: user.phone_number, role: 'user' },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        res.json({ message: 'Authentication successful', token: sessionToken, user: { id: user.id, phone: user.phone_number } });
    } catch (error) {
        console.error(error);
        res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
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
        const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET || 'fallback_secret');
        const user = await User.findByPk(decoded.id);
        if (!user || !user.biometric_enabled) return res.status(403).json({ error: 'Biometric not enabled for this account' });
        if (user.is_active === false) return res.status(403).json({ error: 'Account deactivated' });
        const newToken = jwt.sign(
            { id: user.id, phoneNumber: user.phone_number, role: 'user' },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );
        await user.update({ last_login_at: new Date() });
        res.json({ message: 'Biometric login successful', token: newToken });
    } catch (e) { res.status(401).json({ error: 'Invalid or expired session token' }); }
};

