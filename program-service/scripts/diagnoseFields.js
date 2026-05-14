/**
 * Diagnostic: shows field order vs sample user answers for all questionnaire sub-programs
 * Run: node scripts/diagnoseFields.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, DatasetField, ProgramDataRecord } = require('../models');

const SUB_PROGRAMS = {
    4: 'Nutrition',
    5: 'Physical Activity',
    6: 'Mental Health',
    7: 'Social',
    8: 'Sleep',
};

async function main() {
    await sequelize.authenticate();

    for (const [subId, subName] of Object.entries(SUB_PROGRAMS)) {
        const id = parseInt(subId);

        const fields = await DatasetField.findAll({
            where: { sub_program_id: id },
            order: [['sort_order', 'ASC']],
        });

        const sample = await ProgramDataRecord.findOne({
            where: { sub_program_id: id, phase: 'pre' },
        });

        console.log('\n' + '═'.repeat(160));
        console.log(`  ${subName.toUpperCase()} (sub_program_id=${id}) — ${fields.length} fields | sample member_id: ${sample?.member_id ?? 'NO RECORD FOUND'}`);
        console.log('═'.repeat(160));

        if (!sample) {
            console.log('  No pre records found — skipping answer check.\n');
            fields.slice(0, 5).forEach((f, i) => {
                console.log(`  Q${String(i + 1).padEnd(3)} sort_order=${f.sort_order} | ${f.field_key.padEnd(35)} | ${f.field_label}`);
            });
            if (fields.length > 5) console.log(`  ... and ${fields.length - 5} more fields`);
            continue;
        }

        console.log('Q#   | sort_order | field_key                         | answer in DB                   | label');
        console.log('─'.repeat(160));

        fields.forEach((f, i) => {
            const answer = sample.data_json?.[f.field_key] ?? '(empty)';
            console.log(
                `Q${String(i + 1).padEnd(4)}| ${String(f.sort_order).padEnd(11)}| ${f.field_key.padEnd(35)}| ${String(answer).substring(0, 30).padEnd(31)}| ${f.field_label.substring(0, 60)}`
            );
        });
    }

    await sequelize.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
