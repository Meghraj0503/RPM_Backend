const { UserSubscription } = require('./models');

module.exports = async (req, res, next) => {
    try {
        const sub = await UserSubscription.findOne({ where: { user_id: req.user.id } });
        if (sub && (sub.status === 'Expired' || sub.status === 'Suspended')) {
            return res.status(403).json({ error: `Subscription is ${sub.status}. Wearable sync features are blocked.` });
        }
        next();
    } catch (e) {
        next(); // Fail open on DB error to avoid catastrophic cascade failure
    }
};
