const { sequelize, UserVital, UserAlert, Notification } = require('../models');

// BUG-03: Write health-alert notification directly to shared DB (avoids cross-service HTTP dependency)
async function fireAlertNotification(userId, message) {
    try {
        await Notification.create({
            user_id: userId,
            category: 'health_alert',
            title: 'Health Alert',
            message
        });
    } catch (e) {
        console.error('[vitals] Alert notification write failed:', e.message);
    }
}

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

        // BUG-03 fix: fire notification for each alert after commit (non-blocking)
        for (const alert of alertsToInsert) {
            fireAlertNotification(alert.user_id, alert.message);
        }

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

        // MB-06: SpO2 min/max/avg for last 24 hours
        const spo2Stats = await sequelize.query(`
            SELECT
                MIN(vital_value::numeric) AS min_spo2,
                MAX(vital_value::numeric) AS max_spo2,
                ROUND(AVG(vital_value::numeric), 1) AS avg_spo2
            FROM user_vitals
            WHERE user_id = :userId AND vital_type = 'spo2' AND recorded_at > NOW() - INTERVAL '24 HOURS'
        `, { replacements: { userId }, type: sequelize.QueryTypes.SELECT });

        res.json({ dashboard: vitals, spo2_stats: spo2Stats[0] || {} });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// MB-03: User-facing alerts endpoint
exports.getUserAlerts = async (req, res) => {
    const userId = req.user.id;
    try {
        const alerts = await UserAlert.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            limit: 50
        });
        res.json({ alerts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching alerts' });
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

// ── Manual Vital Entry (user enters data when device not worn) ────────────────
const ALLOWED_TYPES = new Set([
    'heart_rate', 'spo2', 'hrv', 'steps',
    'sleep', 'sleep_deep', 'sleep_light', 'sleep_rem',
    'calories', 'active_calories', 'resting_calories',
    'activity_minutes', 'stress_score'
]);

const DEFAULT_UNITS = {
    heart_rate: 'bpm',
    spo2: '%',
    hrv: 'ms',
    steps: 'steps',
    sleep: 'hours',
    sleep_deep: 'hours',
    sleep_light: 'hours',
    sleep_rem: 'hours',
    calories: 'kcal',
    active_calories: 'kcal',
    resting_calories: 'kcal',
    activity_minutes: 'min',
    stress_score: 'score'
};

exports.logManualVitals = async (req, res) => {
    const userId = req.user.id;
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0)
        return res.status(400).json({ error: '`entries` must be a non-empty array' });

    // Validate each entry
    const errors = [];
    entries.forEach((e, i) => {
        if (!e.vital_type)
            errors.push(`entries[${i}]: vital_type is required`);
        else if (!ALLOWED_TYPES.has(e.vital_type))
            errors.push(`entries[${i}]: unknown vital_type "${e.vital_type}"`);
        if (e.vital_value === undefined || e.vital_value === null || isNaN(Number(e.vital_value)))
            errors.push(`entries[${i}]: vital_value must be a number`);
        else if (Number(e.vital_value) < 0)
            errors.push(`entries[${i}]: vital_value cannot be negative`);
        if (e.recorded_at && isNaN(Date.parse(e.recorded_at)))
            errors.push(`entries[${i}]: recorded_at is not a valid date`);
        if (e.duration_minutes !== undefined && (isNaN(Number(e.duration_minutes)) || Number(e.duration_minutes) < 0))
            errors.push(`entries[${i}]: duration_minutes must be a non-negative number`);
    });
    if (errors.length) return res.status(400).json({ errors });

    const transaction = await sequelize.transaction();
    try {
        const vitalsToInsert = [];
        const alertsToFire = [];

        for (const e of entries) {
            const value = Number(e.vital_value);
            const recordedAt = e.recorded_at ? new Date(e.recorded_at) : new Date();

            vitalsToInsert.push({
                user_id: userId,
                vital_type: e.vital_type,
                vital_value: value,
                vital_unit: e.vital_unit || DEFAULT_UNITS[e.vital_type] || null,
                is_manual: true,
                source: 'manual_entry',
                duration_minutes: e.vital_type === 'steps' && e.duration_minutes != null
                    ? Number(e.duration_minutes)
                    : null,
                recorded_at: recordedAt
            });

            // Same alert thresholds as device sync
            if (e.vital_type === 'spo2' && value < 90)
                alertsToFire.push({ user_id: userId, vital_type: 'spo2', message: `Low SpO2: ${value}%` });
            if (e.vital_type === 'heart_rate' && value > 120)
                alertsToFire.push({ user_id: userId, vital_type: 'heart_rate', message: `High Resting HR: ${value} bpm` });
        }

        await UserVital.bulkCreate(vitalsToInsert, { transaction });
        if (alertsToFire.length)
            await UserAlert.bulkCreate(alertsToFire, { transaction });

        await transaction.commit();

        for (const alert of alertsToFire)
            fireAlertNotification(alert.user_id, alert.message);

        res.status(201).json({
            message: 'Vitals saved successfully',
            saved: vitalsToInsert.length,
            alerts_raised: alertsToFire.length
        });
    } catch (err) {
        await transaction.rollback();
        console.error('[manual-vitals]', err);
        res.status(500).json({ error: 'Failed to save vitals' });
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
