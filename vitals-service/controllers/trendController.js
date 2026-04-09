const { UserVital, sequelize } = require('../models');

exports.getVitalsTrends = async (req, res) => {
    const userId = req.user.id;
    const { days = 7, type } = req.query;
    try {
        let query = `
            SELECT vital_type, vital_value, vital_unit, recorded_at 
            FROM user_vitals 
            WHERE user_id = :userId AND recorded_at > NOW() - INTERVAL '${parseInt(days)} days'
        `;
        let replacements = { userId };
        
        if (type) {
            query += ` AND vital_type = :type`;
            replacements.type = type;
        }
        query += ` ORDER BY recorded_at ASC`;

        const trends = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });
        
        res.json({ trends });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching trends' });
    }
};

exports.exportHealthData = async (req, res) => {
    const userId = req.user.id;
    try {
        const data = await sequelize.query(`
            SELECT * FROM user_vitals WHERE user_id = :userId ORDER BY recorded_at DESC LIMIT 500
        `, { replacements: { userId }, type: sequelize.QueryTypes.SELECT });
        
        res.json({ message: "Export ready formatting for PDF", records: data });
    } catch (error) {
        res.status(500).json({ error: 'Export failed' });
    }
};
