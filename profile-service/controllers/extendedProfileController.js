const {
    sequelize, UserProfile, UserBodyComposition, UserBloodTest,
    WellnessQuote, WellnessTask, UserTaskCompletion, Announcement
} = require('../models');

// ─── MB-11: Extended Demographic Profile ─────────────────────────────────────

exports.updateExtendedProfile = async (req, res) => {
    const userId = req.user.id;
    const { blood_group, occupation, marital_status, waist_circumference, hip_circumference, program_start_date } = req.body;

    const waist = parseFloat(waist_circumference) || null;
    const hip = parseFloat(hip_circumference) || null;
    const whr = (waist && hip && hip > 0) ? parseFloat((waist / hip).toFixed(3)) : null;

    try {
        await UserProfile.upsert({
            user_id: userId,
            blood_group: blood_group || null,
            occupation: occupation || null,
            marital_status: marital_status || null,
            waist_circumference: waist,
            hip_circumference: hip,
            waist_to_hip_ratio: whr,
            program_start_date: program_start_date || null
        });
        res.json({ message: 'Extended profile updated', waist_to_hip_ratio: whr });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update extended profile' });
    }
};

// ─── MB-12: Body Composition ─────────────────────────────────────────────────

exports.upsertBodyComposition = async (req, res) => {
    const userId = req.user.id;
    const { body_fat_pct, muscle_mass_pct, hydration_pct, bone_mass_kg } = req.body;
    try {
        await UserBodyComposition.upsert({
            user_id: userId,
            body_fat_pct: body_fat_pct || null,
            muscle_mass_pct: muscle_mass_pct || null,
            hydration_pct: hydration_pct || null,
            bone_mass_kg: bone_mass_kg || null,
            recorded_at: new Date()
        });
        res.json({ message: 'Body composition saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save body composition' });
    }
};

exports.getBodyComposition = async (req, res) => {
    const userId = req.user.id;
    try {
        const data = await UserBodyComposition.findOne({ where: { user_id: userId } });
        res.json({ body_composition: data || {} });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch body composition' });
    }
};

// ─── MB-13: Blood Test Profile ────────────────────────────────────────────────

const BLOOD_TEST_RANGES = {
    fasting_blood_sugar: { normal: [70, 99], borderline: [100, 125] },   // mg/dL
    hba1c:               { normal: [0, 5.6], borderline: [5.7, 6.4] },   // %
    hemoglobin:          { normal_male: [13.5, 17.5], normal_female: [12.0, 15.5] },
    total_cholesterol:   { normal: [0, 200], borderline: [200, 239] },    // mg/dL
    ldl_cholesterol:     { normal: [0, 100], borderline: [100, 159] }     // mg/dL
};

function getStatus(param, value) {
    const range = BLOOD_TEST_RANGES[param];
    if (!range || value === null || value === undefined) return null;
    const norm = range.normal;
    const border = range.borderline;
    if (norm && value >= norm[0] && value <= norm[1]) return 'Normal';
    if (border && value >= border[0] && value <= border[1]) return 'Borderline';
    return 'High';
}

exports.addBloodTest = async (req, res) => {
    const userId = req.user.id;
    const { fasting_blood_sugar, hba1c, hemoglobin, total_cholesterol, ldl_cholesterol, blood_pressure_systolic, blood_pressure_diastolic } = req.body;
    try {
        const record = await UserBloodTest.create({
            user_id: userId,
            fasting_blood_sugar, hba1c, hemoglobin,
            total_cholesterol, ldl_cholesterol,
            blood_pressure_systolic, blood_pressure_diastolic,
            recorded_at: new Date()
        });
        res.status(201).json({ message: 'Blood test recorded', record });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save blood test' });
    }
};

exports.getBloodTests = async (req, res) => {
    const userId = req.user.id;
    try {
        const records = await UserBloodTest.findAll({
            where: { user_id: userId },
            order: [['recorded_at', 'DESC']],
            limit: 10
        });
        // Attach status indicators to latest record
        const latest = records[0];
        let statusMap = {};
        if (latest) {
            ['fasting_blood_sugar', 'hba1c', 'hemoglobin', 'total_cholesterol', 'ldl_cholesterol'].forEach(p => {
                statusMap[p] = { value: latest[p], status: getStatus(p, latest[p]) };
            });
            statusMap.blood_pressure = {
                value: `${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`,
                status: (latest.blood_pressure_systolic > 140 || latest.blood_pressure_diastolic > 90) ? 'High' :
                        (latest.blood_pressure_systolic > 130 || latest.blood_pressure_diastolic > 80) ? 'Borderline' : 'Normal'
            };
        }
        res.json({ records, latest_with_status: statusMap });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch blood tests' });
    }
};

// ─── MB-14: Daily Motivation Quote ───────────────────────────────────────────

exports.getDailyQuote = async (req, res) => {
    try {
        const dow = new Date().getDay(); // 0 (Sun) – 6 (Sat)
        // First try a day-of-week specific quote, then fall back to any quote
        let quote = await WellnessQuote.findOne({ where: { day_of_week: dow } });
        if (!quote) {
            // Rotate from full pool using day-of-year as offset
            const start = new Date(new Date().getFullYear(), 0, 0);
            const diff = new Date() - start;
            const oneDay = 86400000;
            const doy = Math.floor(diff / oneDay);
            const total = await WellnessQuote.count();
            if (total > 0) {
                quote = await WellnessQuote.findOne({ offset: doy % total });
            }
        }
        res.json({ quote: quote || { quote_text: 'Every day is a new beginning. Take a deep breath and start again.', author: 'AAYU Health' } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
};

// ─── MB-15: Daily Wellness Tasks ─────────────────────────────────────────────

exports.getDailyTasks = async (req, res) => {
    const userId = req.user.id;
    try {
        const today = new Date().toISOString().split('T')[0];
        const tasks = await WellnessTask.findAll({ where: { is_active: true }, order: [['id', 'ASC']] });
        const completions = await UserTaskCompletion.findAll({
            where: { user_id: userId, completed_date: today }
        });
        const completedSet = new Set(completions.map(c => c.task_id));
        const result = tasks.map(t => ({ ...t.toJSON(), is_completed: completedSet.has(t.id) }));
        res.json({ tasks: result, date: today });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
};

exports.completeTask = async (req, res) => {
    const userId = req.user.id;
    const { task_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    try {
        const [record, created] = await UserTaskCompletion.findOrCreate({
            where: { user_id: userId, task_id, completed_date: today },
            defaults: { user_id: userId, task_id, completed_date: today }
        });
        res.json({ message: created ? 'Task marked complete' : 'Already completed', record });
    } catch (err) {
        res.status(500).json({ error: 'Failed to complete task' });
    }
};

exports.uncompleteTask = async (req, res) => {
    const userId = req.user.id;
    const { task_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    try {
        await UserTaskCompletion.destroy({ where: { user_id: userId, task_id, completed_date: today } });
        res.json({ message: 'Task unmarked' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to uncomplete task' });
    }
};

// ─── MB-16: Program Announcements ────────────────────────────────────────────

exports.getAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.findAll({
            where: { is_active: true },
            order: [['created_at', 'DESC']],
            limit: 20
        });
        res.json({ announcements });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
};

exports.getAnnouncementDetail = async (req, res) => {
    try {
        const a = await Announcement.findOne({ where: { id: req.params.id, is_active: true } });
        if (!a) return res.status(404).json({ error: 'Announcement not found' });
        res.json({ announcement: a });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch announcement' });
    }
};
