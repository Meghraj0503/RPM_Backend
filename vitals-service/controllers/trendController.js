const { UserVital, sequelize } = require('../models');
const PDFDocument = require('pdfkit');

// MB-05: Resolve time-period filter to a UTC start Date
function resolvePeriodStart(period, days) {
    const now = new Date();
    switch (period) {
        case 'today': {
            const d = new Date(now);
            d.setHours(0, 0, 0, 0);
            return d;
        }
        case 'yesterday': {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            d.setHours(0, 0, 0, 0);
            return d;
        }
        case 'yesterday_end': {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            d.setHours(23, 59, 59, 999);
            return d;
        }
        case 'this_week': {
            const d = new Date(now);
            const day = d.getDay();
            d.setDate(d.getDate() - day);
            d.setHours(0, 0, 0, 0);
            return d;
        }
        case '15days':
            return new Date(Date.now() - 15 * 86400000);
        case '30days':
        case 'this_month':
            return new Date(Date.now() - 30 * 86400000);
        default:
            return new Date(Date.now() - parseInt(days || 7) * 86400000);
    }
}

exports.getVitalsTrends = async (req, res) => {
    const userId = req.user.id;
    const { period, days = 7, type } = req.query;
    try {
        let startDate = resolvePeriodStart(period, days);
        let endDate = new Date(); // now

        // For "yesterday" period, clamp end to end-of-yesterday
        if (period === 'yesterday') {
            endDate = resolvePeriodStart('yesterday_end');
        }

        let query = `
            SELECT vital_type, vital_value, vital_unit, recorded_at
            FROM user_vitals
            WHERE user_id = :userId AND recorded_at >= :startDate AND recorded_at <= :endDate
        `;
        let replacements = { userId, startDate, endDate };

        if (type) {
            query += ` AND vital_type = :type`;
            replacements.type = type;
        }
        query += ` ORDER BY recorded_at ASC`;

        const trends = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        res.json({ trends, period: period || `${days}days`, from: startDate, to: endDate });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching trends' });
    }
};

// MB-20: PDF export of health data
exports.exportHealthData = async (req, res) => {
    const userId = req.user.id;
    const { format = 'pdf' } = req.query;

    try {
        const data = await sequelize.query(`
            SELECT vital_type, vital_value, vital_unit, is_manual, source, recorded_at
            FROM user_vitals
            WHERE user_id = :userId
            ORDER BY recorded_at DESC
            LIMIT 500
        `, { replacements: { userId }, type: sequelize.QueryTypes.SELECT });

        if (format === 'json') {
            return res.json({ message: 'Export ready', records: data });
        }

        // PDF generation
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="health_report_${userId}_${new Date().toISOString().split('T')[0]}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('Personal Health Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').text(`User ID: ${userId}`, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });
        doc.moveDown(1);

        // Summary section
        const byType = {};
        for (const row of data) {
            if (!byType[row.vital_type]) byType[row.vital_type] = [];
            byType[row.vital_type].push(Number(row.vital_value));
        }

        doc.fontSize(14).font('Helvetica-Bold').text('Vitals Summary (Latest 500 Readings)');
        doc.moveDown(0.5);

        const typeLabels = {
            heart_rate: 'Heart Rate (bpm)',
            spo2: 'Blood Oxygen SpO2 (%)',
            hrv: 'Heart Rate Variability (ms)',
            steps: 'Steps',
            sleep: 'Sleep (hours)',
            sleep_deep: 'Deep Sleep (hours)',
            sleep_light: 'Light Sleep (hours)',
            sleep_rem: 'REM Sleep (hours)',
            calories: 'Calories Burned',
            active_calories: 'Active Calories',
            resting_calories: 'Resting Calories',
            activity_minutes: 'Activity Minutes',
            stress_score: 'Stress Score'
        };

        for (const [vtype, values] of Object.entries(byType)) {
            const label = typeLabels[vtype] || vtype;
            const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
            const min = Math.min(...values);
            const max = Math.max(...values);
            doc.fontSize(11).font('Helvetica-Bold').text(label);
            doc.fontSize(10).font('Helvetica').text(`  Readings: ${values.length}   Avg: ${avg}   Min: ${min}   Max: ${max}`);
            doc.moveDown(0.3);
        }

        // Detail table
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Detailed Readings');
        doc.moveDown(0.5);

        const colWidths = [110, 80, 55, 70, 85, 110];
        const headers = ['Date & Time', 'Vital Type', 'Value', 'Unit', 'Source', 'Manual'];
        const tableX = 40;
        let y = doc.y;

        // Table header row
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((h, i) => {
            doc.text(h, tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
        });
        y += 16;
        doc.moveTo(tableX, y).lineTo(tableX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
        y += 4;

        doc.fontSize(8).font('Helvetica');
        for (const row of data.slice(0, 300)) {
            if (y > 760) { doc.addPage(); y = 40; }
            const cells = [
                new Date(row.recorded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                row.vital_type,
                String(row.vital_value),
                row.vital_unit || '—',
                row.source || 'wearable',
                row.is_manual ? 'Yes' : 'No'
            ];
            cells.forEach((cell, i) => {
                doc.text(cell, tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
            });
            y += 14;
        }

        doc.end();
    } catch (error) {
        console.error(error);
        if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
    }
};
