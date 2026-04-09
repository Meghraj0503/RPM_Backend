const { UserDevice } = require('../models');

exports.pairDevice = async (req, res) => {
    const { deviceName, macAddress } = req.body;
    const userId = req.user.id;
    try {
        const device = await UserDevice.create({
            user_id: userId,
            device_name: deviceName,
            mac_address: macAddress,
            last_connected_at: new Date()
        });
        res.json({ message: 'Device paired successfully', device });
    } catch (error) {
        res.status(500).json({ error: 'Server error pairing device' });
    }
};

exports.getConnectedDevices = async (req, res) => {
    const userId = req.user.id;
    try {
        const devices = await UserDevice.findAll({ where: { user_id: userId } });
        res.json({ devices });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching devices' });
    }
};
