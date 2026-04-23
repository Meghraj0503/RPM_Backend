const { UserProfile, UserSettings, UserConsent, DataDeletionRequest, User } = require('../models');

exports.getSettings = async (req, res) => {
    const userId = req.user.id;
    try {
        let settings = await UserSettings.findOne({ where: { user_id: userId } });
        if (!settings) {
            settings = await UserSettings.create({ user_id: userId });
        }
        res.json({ settings });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching settings' });
    }
};

exports.updateSettings = async (req, res) => {
    const userId = req.user.id;
    const { push_notifications, app_version } = req.body;
    try {
        await UserSettings.upsert({
            user_id: userId,
            push_notifications,
            app_version
        });
        res.json({ message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ error: 'Server error updating settings' });
    }
};

exports.provideConsent = async (req, res) => {
    const userId = req.user.id;
    const { consentVersion, ipAddress } = req.body;
    try {
        await UserConsent.create({
            user_id: userId,
            consent_version: consentVersion || 'v1.0',
            status: 'Accepted',
            ip_address: ipAddress || req.ip
        });
        res.json({ message: 'Data consent successfully recorded' });
    } catch (error) {
        res.status(500).json({ error: 'Server error saving consent' });
    }
};

exports.requestDeletion = async (req, res) => {
    const userId = req.user.id;
    try {
        await DataDeletionRequest.upsert({
            user_id: userId,
            status: 'Pending',
            requested_at: new Date()
        });
        res.json({ message: 'Data deletion request submitted' });
    } catch (error) {
        res.status(500).json({ error: 'Server error requesting deletion' });
    }
};

exports.getFullProfile = async (req, res) => {
    const userId = req.user.id;
    try {
        const profile = await UserProfile.findOne({ where: { user_id: userId } });
        const user = await User.findByPk(userId);
        res.json({ profile,user });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching profile' });
    }
};
