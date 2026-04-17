const { sequelize, User, UserProfile, UserMedicalCondition, UserMedication, UserAllergy, UserLifestyle } = require('../models');

exports.savePersonalInfo = async (req, res) => {
    const { firstName, lastName, dateOfBirth, gender, height, heightUnit, weight, weightUnit } = req.body;
    const userId = req.user.id;
    let fullName = `${firstName} ${lastName}`
    if (!height || !weight || !heightUnit || !weightUnit) {
        return res.status(400).json({ error: 'Height, weight, and their units (ft, in, cm, kg, lbs) are required' });
    }

    let weightInKg = weightUnit === 'lbs' ? weight * 0.453592 : weight;
    let heightInMeters = 0;

    if (heightUnit === 'cm') {
        heightInMeters = height / 100;
    } else if (heightUnit === 'in' || heightUnit === 'inches') {
        heightInMeters = height * 0.0254; // 1 inch = 0.0254 meters
    } else if (heightUnit === 'ft') {
        heightInMeters = height * 0.3048; // 1 foot = 0.3048 meters
    } else {
        return res.status(400).json({ error: 'Invalid height unit. Use cm, in, or ft' });
    }

    if (heightInMeters <= 0 || weightInKg <= 0) {
        return res.status(400).json({ error: 'Realistic numeric values required' });
    }

    const bmi = (weightInKg / (heightInMeters * heightInMeters)).toFixed(2);

    try {
        if (fullName) {
            await User.update({ name: fullName }, { where: { id: userId } });
        }

        await UserProfile.upsert({
            user_id: userId,
            date_of_birth: dateOfBirth,
            gender: gender,
            height: height,
            height_unit: heightUnit,
            weight: weight,
            weight_unit: weightUnit,
            bmi: bmi,
            is_personal_setup: true
        });
        res.json({ message: 'Personal info saved', bmi });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.saveMedicalInfo = async (req, res) => {
    const { conditions, medications, allergies } = req.body;
    const userId = req.user.id;
    const transaction = await sequelize.transaction();
    try {
        await UserMedicalCondition.destroy({ where: { user_id: userId }, transaction });
        await UserMedication.destroy({ where: { user_id: userId }, transaction });
        await UserAllergy.destroy({ where: { user_id: userId }, transaction });

        if (conditions) {
            const conds = conditions.map(c => ({ user_id: userId, condition_name: c }));
            await UserMedicalCondition.bulkCreate(conds, { transaction });
        }
        if (medications) {
            const meds = medications.map(m => ({ user_id: userId, medication_name: m }));
            await UserMedication.bulkCreate(meds, { transaction });
        }
        if (allergies) {
            const algs = allergies.map(a => ({ user_id: userId, allergy_name: a }));
            await UserAllergy.bulkCreate(algs, { transaction });
        }

        await UserProfile.upsert({ user_id: userId, is_medical_setup: true }, { transaction });
        await transaction.commit();
        res.json({ message: 'Medical info saved' });
    } catch (error) {
        await transaction.rollback();
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.saveLifestyleInfo = async (req, res) => {
    const { dietType, physicalActivityLevel, averageSleepHours, smokingStatus, alcoholConsumption } = req.body;
    const userId = req.user.id;
    try {
        await UserLifestyle.upsert({
            user_id: userId,
            diet_type: dietType,
            physical_activity_level: physicalActivityLevel,
            average_sleep_hours: averageSleepHours,
            smoking_status: smokingStatus,
            alcohol_consumption: alcoholConsumption
        });
        await UserProfile.upsert({ user_id: userId, is_lifestyle_setup: true });
        res.json({ message: 'Lifestyle info saved' });
    } catch (error) {
        res.status(500).json({ error: 'Server error saving lifestyle info' });
    }
};
