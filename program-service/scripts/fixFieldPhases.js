/**
 * One-time fix: set DatasetField.phase = 'both' for all questionnaire sub-programs.
 *
 * Problem: fields were imported with phase='pre', but questionnaire sub-programs
 * use the same field definitions for both PRE and POST submissions.
 * The UI filters fields by phase, so phase='pre' fields are hidden on the POST tab.
 *
 * Affected sub-programs: MOCA(3), Nutrition(4), Physical Activity(5),
 *                        Mental(6), Social(7), Sleep(8)
 *
 * NOT affected: Steps Count / Sleep Duration (visit-tracking, phase separation is intentional)
 *
 * Usage:
 *   node scripts/fixFieldPhases.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, SubProgram, DatasetField } = require('../models');

const DRY_RUN = process.argv.includes('--dry-run');

// Questionnaire sub-program IDs — same questions for PRE and POST
const QUESTIONNAIRE_IDS = [3, 4, 5, 6, 7, 8];

async function main() {
    await sequelize.authenticate();
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN — no DB writes]' : ''}\n`);

    const subs = await SubProgram.findAll({
        where: { id: QUESTIONNAIRE_IDS },
        order: [['id', 'ASC']],
    });

    for (const sub of subs) {
        const wrongFields = await DatasetField.findAll({
            where: { sub_program_id: sub.id, phase: 'pre' },
        });

        console.log(`${sub.name} (id=${sub.id}): ${wrongFields.length} fields with phase='pre'`);

        if (wrongFields.length === 0) {
            console.log('  → already correct, skipping\n');
            continue;
        }

        if (!DRY_RUN) {
            const [count] = await DatasetField.update(
                { phase: 'both' },
                { where: { sub_program_id: sub.id, phase: 'pre' } }
            );
            console.log(`  → updated ${count} fields to phase='both'\n`);
        } else {
            console.log(`  [DRY RUN] would update ${wrongFields.length} fields to phase='both'\n`);
        }
    }

    console.log('Done.');
    await sequelize.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
