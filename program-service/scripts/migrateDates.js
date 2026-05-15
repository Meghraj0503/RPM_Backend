/**
 * One-time migration: fix dates for Steps Count and Sleep Duration sub-programs.
 *
 * What it does:
 *   1. PRE records  — sets created_at = '2024-04-01' for all PRE ProgramDataRecords
 *                     belonging to Steps Count and Sleep Duration.
 *   2. POST fields  — renames DatasetField.field_label from raw visit labels
 *                     (e.g. "August - 1st visit") to formatted dates
 *                     ("August 1, 2024" for 1st visit, "August 15, 2024" for 2nd visit).
 *
 * Month → year mapping:
 *   Aug, Sep, Oct, Nov, Dec → 2024
 *   Jan (+ "Janurary" typo), Feb, Mar, Apr → 2025
 *
 * Usage:
 *   node scripts/migrateDates.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, SubProgram, DatasetField, ProgramDataRecord } = require('../models');

const DRY_RUN = process.argv.includes('--dry-run');

// Month name → year (handles the "Janurary" typo from the TSV data)
const MONTH_YEAR = {
    august:    2025,
    september: 2025,
    october:   2025,
    november:  2025,
    december:  2025,
    january:   2026,
    janurary:  2026,   // typo present in source TSV
    february:  2026,
    march:     2026,
    april:     2026,
};

// Canonical spelling to use in output labels (normalises the "Janurary" typo)
const MONTH_CANONICAL = {
    august:    'August',
    september: 'September',
    october:   'October',
    november:  'November',
    december:  'December',
    january:   'January',
    janurary:  'January',
    february:  'February',
    march:     'March',
    april:     'April',
};

/**
 * Parse a raw visit label and return the formatted date string.
 * Returns null if the label doesn't look like a visit column.
 *
 * Examples:
 *   "August - 1st visit"   → "August 1, 2024"
 *   "August - 2nd visit"   → "August 15, 2024"
 *   "Janurary - 1st visit" → "January 1, 2025"
 */
function parseVisitLabel(label) {
    if (!label) return null;
    const lower = label.toLowerCase();

    // Extract month name from the beginning of the label
    const monthMatch = lower.match(/^([a-z]+)/);
    if (!monthMatch) return null;
    const monthKey = monthMatch[1];

    const year = MONTH_YEAR[monthKey];
    const canonical = MONTH_CANONICAL[monthKey];
    if (!year || !canonical) return null;

    // Determine day: 1st visit → day 1, 2nd visit → day 15
    let day;
    if (lower.includes('1st')) {
        day = 1;
    } else if (lower.includes('2nd')) {
        day = 15;
    } else {
        return null;
    }

    return `${canonical} ${day}, ${year}`;
}

async function main() {
    await sequelize.authenticate();
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN — no DB writes]' : ''}\n`);

    // ── Locate target sub-programs ────────────────────────────────────────
    const stepsRow = await SubProgram.findOne({ where: { name: 'Steps Count' } });
    const sleepRow = await SubProgram.findOne({ where: { name: 'Sleep Duration' } });

    if (!stepsRow) { console.error('ERROR: "Steps Count" sub-program not found'); process.exit(1); }
    if (!sleepRow) { console.error('ERROR: "Sleep Duration" sub-program not found'); process.exit(1); }

    const subIds  = [stepsRow.id, sleepRow.id];
    const subNames = { [stepsRow.id]: 'Steps Count', [sleepRow.id]: 'Sleep Duration' };
    console.log(`Target sub-programs: Steps Count (id=${stepsRow.id}), Sleep Duration (id=${sleepRow.id})\n`);

    // ── 1. Update PRE record created_at → 2024-04-01 ─────────────────────
    console.log('── Step 1: PRE records created_at ──────────────────────────────────');

    const preCount = await ProgramDataRecord.count({
        where: { sub_program_id: subIds, phase: 'pre' },
    });
    console.log(`  Found ${preCount} PRE records across both sub-programs.`);

    if (!DRY_RUN) {
        // Use raw SQL to bypass Sequelize's automatic timestamp management
        const [, meta] = await sequelize.query(
            `UPDATE program_data_records
                SET created_at = '2025-04-01 00:00:00'
              WHERE sub_program_id IN (:subIds)
                AND phase = 'pre'`,
            { replacements: { subIds } }
        );
        const affected = meta?.affectedRows ?? meta?.rowCount ?? '?';
        console.log(`  Updated ${affected} rows → created_at = 2025-04-01\n`);
    } else {
        console.log(`  [DRY RUN] Would update ${preCount} rows → created_at = 2025-04-01\n`);
    }

    // ── 2. Update POST DatasetField labels → formatted dates ──────────────
    console.log('── Step 2: POST DatasetField field_label ───────────────────────────');

    for (const subId of subIds) {
        const name = subNames[subId];
        const fields = await DatasetField.findAll({
            where: { sub_program_id: subId, phase: 'post' },
            order: [['sort_order', 'ASC']],
        });

        console.log(`\n  ${name} (id=${subId}) — ${fields.length} POST fields:`);

        let updated = 0, skipped = 0;
        for (const f of fields) {
            const newLabel = parseVisitLabel(f.field_label);
            if (!newLabel) {
                console.log(`    SKIP  "${f.field_label}" — could not parse`);
                skipped++;
                continue;
            }

            if (newLabel === f.field_label) {
                console.log(`    SAME  "${f.field_label}" — already correct`);
                skipped++;
                continue;
            }

            console.log(`    ${DRY_RUN ? '[DRY] ' : ''}${f.field_label}  →  ${newLabel}`);

            if (!DRY_RUN) {
                await DatasetField.update(
                    { field_label: newLabel },
                    { where: { id: f.id } }
                );
            }
            updated++;
        }

        console.log(`  → ${updated} updated, ${skipped} skipped`);
    }

    console.log('\n── Done. ───────────────────────────────────────────────────────────');
    await sequelize.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
