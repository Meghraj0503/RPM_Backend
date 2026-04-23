const { sequelize, UserVital, UserAlert } = require('../models');

exports.syncVitals = async (req, res) => {
    const { vitals } = req.body; 
    const userId = req.user.id;
    if (!Array.isArray(vitals)) return res.status(400).json({ error: 'Expected an array' });

    const transaction = await sequelize.transaction();
    try {
        const vitalsToInsert = [];
        const alertsToInsert = [];

        for (let vital of vitals) {
            vitalsToInsert.push({
                user_id: userId,
                vital_type: vital.vitalType,
                vital_value: vital.vitalValue,
                vital_unit: vital.vitalUnit,
                is_manual: vital.isManual || false,
                source: vital.source || 'wearable',
                recorded_at: vital.recordedAt || new Date()
            });

            if (vital.vitalType === 'spo2' && vital.vitalValue < 90) {
                alertsToInsert.push({ user_id: userId, vital_type: 'spo2', message: `Low SpO2: ${vital.vitalValue}%` });
            }
            if (vital.vitalType === 'heart_rate' && vital.vitalValue > 120) {
                alertsToInsert.push({ user_id: userId, vital_type: 'heart_rate', message: `High Resting HR: ${vital.vitalValue} bpm` });
            }
        }

        await UserVital.bulkCreate(vitalsToInsert, { transaction });
        if (alertsToInsert.length > 0) {
            await UserAlert.bulkCreate(alertsToInsert, { transaction });
        }

        await transaction.commit();
        res.json({ message: 'Vitals synced successfully' });
    } catch (error) {
        await transaction.rollback();
        console.error(error);
        res.status(500).json({ error: 'Server error syncing vitals' });
    }
};

exports.getDashboard = async (req, res) => {
    const userId = req.user.id;
    try {
        const vitals = await sequelize.query(`
            SELECT DISTINCT ON (vital_type) vital_type, vital_value, vital_unit, recorded_at, source, is_manual 
            FROM user_vitals 
            WHERE user_id = :userId AND recorded_at > NOW() - INTERVAL '24 HOURS'
            ORDER BY vital_type, recorded_at DESC
        `, { 
            replacements: { userId }, 
            type: sequelize.QueryTypes.SELECT 
        });
        
        res.json({ dashboard: vitals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.updateSyncStatus = async (req, res) => {
    const userId = req.user.id;
    const syncTime = req.body.sync_time ? new Date(req.body.sync_time) : new Date();
    try {
        const [syncRecord] = await sequelize.models.user_sync_log.upsert({
            user_id: userId,
            last_synced_at: syncTime
        });
        return res.status(200).json({ 
            message: 'Sync timestamp updated successfully',
            last_synced_at: syncRecord.last_synced_at 
        });
    } catch (error) {
        console.error('Error updating sync status:', error);
        return res.status(500).json({ error: 'Failed to update sync timestamp' });
    }
};

exports.getSyncStatus = async (req, res) => {
    const userId = req.user.id;
    try {
        const syncRecord = await sequelize.models.user_sync_log.findOne({ where: { user_id: userId } });
        if (!syncRecord) {
            return res.status(200).json({ user_id: userId, last_synced_at: null });
        }
        return res.status(200).json({ user_id: syncRecord.user_id, last_synced_at: syncRecord.last_synced_at });
    } catch (error) {
        console.error('Error fetching sync status:', error);
        return res.status(500).json({ error: 'Failed to fetch sync status' });
    }
};
