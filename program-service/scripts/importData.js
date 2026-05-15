/**
 * DHR Program Data Import Script
 *
 * Usage:
 *   node scripts/importData.js <command> [options]
 *
 * Commands:
 *   setup        — Create DHR program + 8 sub-programs + field schemas
 *   members      — Import members from a CSV file
 *                  --file <path>  --program-id <id>
 *   records      — Import pre/post data from a CSV file
 *                  --file <path>  --sub-program-id <id>  --phase pre|post
 *   visits       — Import visit-style tracking data (PRE baseline + repeated POST visits)
 *                  --file <path>  --sub-program-id <id>  [--create-missing]
 *
 * Examples:
 *   node scripts/importData.js setup
 *   node scripts/importData.js members --file ./data/members.csv --program-id 1
 *   node scripts/importData.js records --file ./data/PRE-Diet.csv --sub-program-id 1 --phase pre
 *   node scripts/importData.js visits  --file ./data/steps-count.tsv --sub-program-id 9
 *   node scripts/importData.js visits  --file ./data/sleep-duration.tsv --sub-program-id 10
 *
 * TSV format for visits (wide format):
 *   Col 0: ID (MMES_xxx)
 *   Col 1: Name
 *   Col 2: Gender
 *   Col 3: PRE value  (e.g. "PRE - Steps count")   → stored in pre record
 *   Col 4+: Visit values (e.g. "August - 1st visit")  → stored in post record
 *   Field definitions (DatasetField) are auto-created from the column headers.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const readline = require('readline');
const {
    sequelize, Program, SubProgram, DatasetField,
    ProgramMember, ProgramDataRecord,
} = require('../models');

/* ══════════════════════ DHR Field Definitions ═══════════════════════════
   These match the columns in the Google Sheet exactly.
   field_key: safe snake_case key used in data_json
   field_label: human-readable label shown in UI
   field_type: number | text | select
   unit: optional display unit
═══════════════════════════════════════════════════════════════════════════ */

const DHR_FIELD_SCHEMAS = {
    Diet: [
        { field_key: 'totc',                field_label: 'Total Calories',                      field_type: 'number', unit: 'Kals' },
        { field_key: 'calcar',              field_label: 'Calories from Carbohydrate',           field_type: 'number', unit: 'Kals' },
        { field_key: 'calcarp',             field_label: 'Calories from Carbohydrate %',         field_type: 'number', unit: '%' },
        { field_key: 'calpro',              field_label: 'Calories from Protein',                field_type: 'number', unit: 'Kals' },
        { field_key: 'calprop',             field_label: 'Calories from Protein %',              field_type: 'number', unit: '%' },
        { field_key: 'calfat',              field_label: 'Calories from Fat',                    field_type: 'number', unit: 'Kals' },
        { field_key: 'calfatp',             field_label: 'Calories from Fat %',                  field_type: 'number', unit: '%' },
        { field_key: 'totcarb',             field_label: 'Total Carbohydrate',                   field_type: 'number', unit: 'gm' },
        { field_key: 'proccarb',            field_label: 'Processed Carbohydrate',               field_type: 'number', unit: 'gm' },
        { field_key: 'procarbp',            field_label: 'Processed Carbohydrate %',             field_type: 'number', unit: '%' },
        { field_key: 'wholcarb',            field_label: 'Whole Carbohydrate',                   field_type: 'number', unit: 'gm' },
        { field_key: 'whocarbp',            field_label: 'Whole Carbohydrate %',                 field_type: 'number', unit: '%' },
        { field_key: 'totprot',             field_label: 'Total Protein',                        field_type: 'number', unit: 'gm' },
        { field_key: 'plantp',              field_label: 'Plant Protein',                        field_type: 'number', unit: 'gm' },
        { field_key: 'planpp',              field_label: 'Plant Protein %',                      field_type: 'number', unit: '%' },
        { field_key: 'animalp',             field_label: 'Animal Protein',                       field_type: 'number', unit: 'gm' },
        { field_key: 'animalpp',            field_label: 'Animal Protein %',                     field_type: 'number', unit: '%' },
        { field_key: 'totalf',              field_label: 'Total Fat',                            field_type: 'number', unit: 'gm' },
        { field_key: 'unsatf',              field_label: 'Unsaturated Fat',                      field_type: 'number', unit: 'gm' },
        { field_key: 'unsatfp',             field_label: 'Unsaturated Fat %',                    field_type: 'number', unit: '%' },
        { field_key: 'satf',                field_label: 'Saturated Fat',                        field_type: 'number', unit: 'gm' },
        { field_key: 'satfp',               field_label: 'Saturated Fat %',                      field_type: 'number', unit: '%' },
        { field_key: 'fibre',               field_label: 'Total Fibre',                          field_type: 'number', unit: 'gm' },
        { field_key: 'solubf',              field_label: 'Soluble Fibre',                        field_type: 'number', unit: 'gm' },
        { field_key: 'solubfp',             field_label: 'Soluble Fibre %',                      field_type: 'number', unit: '%' },
        { field_key: 'insolf',              field_label: 'Insoluble Fibre',                      field_type: 'number', unit: 'gm' },
        { field_key: 'insolfp',             field_label: 'Insoluble Fibre %',                    field_type: 'number', unit: '%' },
        { field_key: 'carotenoids',         field_label: 'Carotenoids',                          field_type: 'number', unit: 'mcg' },
        { field_key: 'polyphenols',         field_label: 'Polyphenols',                          field_type: 'number', unit: 'mg' },
        { field_key: 'long_chain_omega3',   field_label: 'Long Chain Omega-3 Fatty Acid',        field_type: 'number', unit: 'mg' },
        { field_key: 'trans_fat',           field_label: 'Trans Fat',                            field_type: 'number', unit: 'gm' },
        { field_key: 'salt_per_day',        field_label: 'Salt Per Day',                         field_type: 'number', unit: 'gm' },
    ],

    BIA: [
        { field_key: 'weight',              field_label: 'Weight',                               field_type: 'number', unit: 'kg' },
        { field_key: 'height',              field_label: 'Height',                               field_type: 'number', unit: 'cm' },
        { field_key: 'fat_free_mass',       field_label: 'Fat Free Mass',                        field_type: 'number', unit: 'kg' },
        { field_key: 'body_fat',            field_label: 'Body Fat',                             field_type: 'number', unit: 'kg' },
        { field_key: 'body_fat_percent',    field_label: 'Body Fat %',                           field_type: 'number', unit: '%' },
        { field_key: 'muscle_mass',         field_label: 'Muscle Mass',                          field_type: 'number', unit: 'kg' },
        { field_key: 'skeletal_muscle_mass',field_label: 'Skeletal Muscle Mass',                 field_type: 'number', unit: 'kg' },
        { field_key: 'seg_muscle_la',       field_label: 'Segmental Muscle Mass – Left Arm',     field_type: 'number', unit: 'kg' },
        { field_key: 'seg_muscle_ra',       field_label: 'Segmental Muscle Mass – Right Arm',    field_type: 'number', unit: 'kg' },
        { field_key: 'seg_muscle_tr',       field_label: 'Segmental Muscle Mass – Trunk',        field_type: 'number', unit: 'kg' },
        { field_key: 'seg_muscle_ll',       field_label: 'Segmental Muscle Mass – Left Leg',     field_type: 'number', unit: 'kg' },
        { field_key: 'seg_muscle_rl',       field_label: 'Segmental Muscle Mass – Right Leg',    field_type: 'number', unit: 'kg' },
        { field_key: 'seg_fat_la',          field_label: 'Segmental Fat Mass – Left Arm',        field_type: 'number', unit: 'kg' },
        { field_key: 'seg_fat_ra',          field_label: 'Segmental Fat Mass – Right Arm',       field_type: 'number', unit: 'kg' },
        { field_key: 'seg_fat_tr',          field_label: 'Segmental Fat Mass – Trunk',           field_type: 'number', unit: 'kg' },
        { field_key: 'seg_fat_ll',          field_label: 'Segmental Fat Mass – Left Leg',        field_type: 'number', unit: 'kg' },
        { field_key: 'seg_fat_rl',          field_label: 'Segmental Fat Mass – Right Leg',       field_type: 'number', unit: 'kg' },
        { field_key: 'bmi',                 field_label: 'BMI',                                  field_type: 'number', unit: 'kg/m²' },
        { field_key: 'desirable_weight',    field_label: 'Desirable Weight',                     field_type: 'number', unit: 'kg' },
        { field_key: 'weight_control',      field_label: 'Weight Control',                       field_type: 'number', unit: 'kg' },
        { field_key: 'body_fat_control',    field_label: 'Body Fat Control',                     field_type: 'number', unit: 'kg' },
        { field_key: 'muscle_control',      field_label: 'Muscle Control',                       field_type: 'number', unit: 'kg' },
        { field_key: 'visceral_fat_level',  field_label: 'Visceral Fat Level',                   field_type: 'text' },
        { field_key: 'subcutaneous_fat_area',field_label:'Subcutaneous Fat Area',                field_type: 'number', unit: 'cm²' },
        { field_key: 'visceral_fat_area',   field_label: 'Visceral Fat Area',                    field_type: 'number', unit: 'cm²' },
        { field_key: 'vsr',                 field_label: 'VSR (Visceral-to-Subcutaneous Ratio)', field_type: 'number' },
        { field_key: 'abdominal_fat_ratio', field_label: 'Abdominal Fat Ratio',                  field_type: 'number' },
        { field_key: 'mediana_score',       field_label: 'Mediana Score',                        field_type: 'number' },
        { field_key: 'waist_circumference', field_label: 'Waist Circumference',                  field_type: 'number', unit: 'cm' },
    ],

    MOCA: [
        { field_key: 'moca_score', field_label: 'MOCA Score (out of 30)', field_type: 'number' },
    ],

    Nutrition:         Array.from({ length: 58 }, (_, i) => ({
        field_key: `q_${i + 1}`, field_label: `Q ${i + 1}`, field_type: 'text',
    })),

    'Physical Activity': Array.from({ length: 39 }, (_, i) => ({
        field_key: `q_${i + 1}`, field_label: `Q ${i + 1}`, field_type: 'text',
    })),

    Mental: Array.from({ length: 71 }, (_, i) => ({
        field_key: `q_${i + 1}`, field_label: `Q ${i + 1}`, field_type: 'text',
    })),

    Social: Array.from({ length: 40 }, (_, i) => ({
        field_key: `q_${i + 1}`, field_label: `Q ${i + 1}`, field_type: 'text',
    })),

    Sleep: Array.from({ length: 18 }, (_, i) => ({
        field_key: `q_${i + 1}`, field_label: `Q ${i + 1}`, field_type: 'text',
    })),
};

/* ══════════════════════════ File Parser ══════════════════════════════════
   Supports:
   - .tsv  — tab-separated (Google Sheets "Tab Separated Values" export)
   - .csv  — comma-separated (Google Sheets "Comma Separated Values" export)
   - .txt  — treated as tab-separated
   Does NOT support .xlsx / .xls — export from Google Sheets as TSV or CSV.
═══════════════════════════════════════════════════════════════════════════ */

function parseCsv(filePath) {
    return new Promise((resolve, reject) => {
        // Detect binary (Excel) files early — PK magic bytes = ZIP/XLSX
        const fd = fs.openSync(filePath, 'r');
        const sig = Buffer.alloc(4);
        fs.readSync(fd, sig, 0, 4, 0);
        fs.closeSync(fd);
        if (sig[0] === 0x50 && sig[1] === 0x4B) {
            return reject(new Error(
                `"${path.basename(filePath)}" is an Excel file (.xlsx).\n` +
                `  → In Google Sheets: File → Download → Tab Separated Values (.tsv)\n` +
                `  → Re-run the import with the downloaded .tsv file.`
            ));
        }

        const ext = path.extname(filePath).toLowerCase();
        const delimiter = ext === '.csv' ? ',' : '\t';

        const lines = [];
        const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
        rl.on('line', line => lines.push(line));
        rl.on('close', () => {
            const rows = lines
                .filter(l => l.trim())
                .map(line => line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '')));
            const headers = rows[0];
            const records = rows.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
                return obj;
            });
            resolve({ headers, records });
        });
        rl.on('error', reject);
    });
}

/* ═══════════════════════ Command: setup ════════════════════════════════ */

async function cmdSetup() {
    console.log('Creating DHR program and sub-programs...');

    let program = await Program.findOne({ where: { name: 'DHR' } });
    if (!program) {
        program = await Program.create({
            name: 'DHR',
            description: 'Shobana DHR Health Data Program — Pre and Post assessment of diet, body composition, cognition, and lifestyle factors.',
            start_date: '2024-01-01',
            end_date:   '2025-12-31',
            created_by: 'system',
        });
        console.log(`  ✓ Created program: DHR (id=${program.id})`);
    } else {
        console.log(`  — Program DHR already exists (id=${program.id})`);
    }

    const subProgramDefs = [
        { name: 'Diet',              description: 'Dietary intake assessment — caloric and nutrient breakdown.' },
        { name: 'BIA',               description: 'Body composition analysis using Bioelectrical Impedance.' },
        { name: 'MOCA',              description: 'Montreal Cognitive Assessment — cognitive screening score.' },
        { name: 'Nutrition',         description: 'Nutrition knowledge, attitude, and practice questionnaire (58 items).' },
        { name: 'Physical Activity', description: 'Physical activity levels and exercise habits questionnaire (39 items).' },
        { name: 'Mental',            description: 'Mental health and wellbeing questionnaire (71 items).' },
        { name: 'Social',            description: 'Social well-being and community engagement questionnaire (40 items).' },
        { name: 'Sleep',             description: 'Sleep quality and habits questionnaire (18 items).' },
        { name: 'Steps Count',       description: 'Daily step count — PRE baseline + bi-monthly POST visit readings.' },
        { name: 'Sleep Duration',    description: 'Nightly sleep duration — PRE baseline + bi-monthly POST visit readings.' },
    ];

    for (const def of subProgramDefs) {
        let sub = await SubProgram.findOne({ where: { program_id: program.id, name: def.name } });
        if (!sub) {
            sub = await SubProgram.create({
                program_id: program.id,
                name: def.name,
                description: def.description,
                start_date: program.start_date,
                end_date:   program.end_date,
                opt_out_enabled: false,
            });
            console.log(`  ✓ Created sub-program: ${def.name} (id=${sub.id})`);
        } else {
            console.log(`  — Sub-program ${def.name} already exists (id=${sub.id})`);
        }

        // Seed field definitions
        const schema = DHR_FIELD_SCHEMAS[def.name];
        if (schema) {
            const existing = await DatasetField.count({ where: { sub_program_id: sub.id } });
            if (existing === 0) {
                await DatasetField.bulkCreate(
                    schema.map((f, i) => ({ sub_program_id: sub.id, phase: 'both', sort_order: i, ...f }))
                );
                console.log(`    ✓ Seeded ${schema.length} field definitions for ${def.name}`);
            } else {
                console.log(`    — Field definitions already exist for ${def.name} (${existing} fields)`);
            }
        }
    }

    console.log('\nSetup complete!');
    console.log('Program ID:', program.id);
    const subs = await SubProgram.findAll({ where: { program_id: program.id } });
    console.log('Sub-Program IDs:');
    subs.forEach(s => console.log(`  ${s.id}: ${s.name}`));
}

/* ════════════════════ Command: import members ══════════════════════════ */

async function cmdImportMembers(args) {
    const fileIdx = args.indexOf('--file');
    const pidIdx  = args.indexOf('--program-id');
    if (fileIdx === -1 || pidIdx === -1) {
        console.error('Usage: importData.js members --file <csv> --program-id <id>');
        process.exit(1);
    }
    const filePath  = args[fileIdx + 1];
    const programId = args[pidIdx + 1];

    console.log(`Importing members from ${filePath} into program ${programId}...`);
    const { records } = await parseCsv(filePath);

    let inserted = 0, skipped = 0;
    for (const row of records) {
        // Expected columns: S.No | Name | Class, Dept & Year | Place | Mobile No. | WATCH SERIAL NO. | (SIGNATURE)
        const sNo        = row['S.no.'] || row['S.No.'] || row['S. no.'] || Object.values(row)[0];
        const name       = row['Name of the student'] || row['Name'] || Object.values(row)[1];
        const classInfo  = row['Class, Dept & Year']  || row['Class'] || Object.values(row)[2];
        const place      = row['Place']               || Object.values(row)[3];
        const phone      = row['Mobile No.']          || row['Mobile'] || Object.values(row)[4];
        const watchSerial= row['WATCH SERIAL NO. (W1912ALWH450065KX)'] || row['WATCH SERIAL NO.'] || Object.values(row)[5];

        if (!sNo || !name) { skipped++; continue; }
        const externalId = `MMES_${String(sNo).trim().padStart(3, '0')}`;

        const exists = await ProgramMember.findOne({ where: { program_id: programId, external_id: externalId } });
        if (exists) { skipped++; continue; }

        await ProgramMember.create({
            program_id:   programId,
            external_id:  externalId,
            name:         name.trim(),
            phone:        phone?.trim(),
            class_info:   classInfo?.trim(),
            place:        place?.trim(),
            watch_serial: watchSerial?.trim(),
        });
        inserted++;
        if (inserted % 100 === 0) process.stdout.write(`  ${inserted} inserted...\r`);
    }
    console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
}

/* ════════════════════ Command: import records ══════════════════════════ */

async function cmdImportRecords(args) {
    const fileIdx       = args.indexOf('--file');
    const subIdx        = args.indexOf('--sub-program-id');
    const phaseIdx      = args.indexOf('--phase');
    const createMissing = args.includes('--create-missing');

    if (fileIdx === -1 || subIdx === -1 || phaseIdx === -1) {
        console.error('Usage: importData.js records --file <csv> --sub-program-id <id> --phase pre|post [--create-missing]');
        process.exit(1);
    }
    const filePath = args[fileIdx + 1];
    const subId    = parseInt(args[subIdx + 1]);
    const phase    = args[phaseIdx + 1];

    const sub = await SubProgram.findByPk(subId);
    if (!sub) { console.error(`Sub-program ${subId} not found`); process.exit(1); }

    const fields    = await DatasetField.findAll({ where: { sub_program_id: subId }, order: [['sort_order', 'ASC']] });
    const fieldKeys = fields.map(f => f.field_key);

    console.log(`Importing ${phase.toUpperCase()} records for "${sub.name}" from ${filePath}...`);
    if (createMissing) console.log('  --create-missing: members not in DB will be auto-created from TSV columns.');

    const { headers, records } = await parseCsv(filePath);

    // Columns: [ID, Name, Gender, Age, ...data columns...]
    const dataCols = headers.slice(4);

    let inserted = 0, updated = 0, created = 0;
    const missingIds = [];

    for (const row of records) {
        const externalId = (row[headers[0]] || '').trim();
        if (!externalId) continue;

        let member = await ProgramMember.findOne({
            where: { program_id: sub.program_id, external_id: externalId },
        });

        if (!member) {
            if (createMissing) {
                // Auto-create member from TSV row (columns 1=Name, 2=Gender, 3=Age)
                const name   = (row[headers[1]] || '').trim();
                const gender = (row[headers[2]] || '').trim();
                const age    = row[headers[3]] ? parseInt(row[headers[3]]) : null;
                member = await ProgramMember.create({
                    program_id:  sub.program_id,
                    external_id: externalId,
                    name:        name || externalId,
                    gender:      gender || null,
                    age:         isNaN(age) ? null : age,
                    created_by:  'import',
                });
                created++;
                console.log(`  ✓ Created missing member: ${externalId} — ${name}`);
            } else {
                missingIds.push(externalId);
                continue;
            }
        }

        // Build data_json: map column index → field_key
        const dataJson = {};
        dataCols.forEach((colHeader, i) => {
            const key = fieldKeys[i] || `col_${i + 5}`;
            const val = row[colHeader];
            if (val !== undefined && val !== '') {
                const field = fields[i];
                dataJson[key] = (field?.field_type === 'number' && !isNaN(Number(val)))
                    ? Number(val) : val;
            }
        });

        const existing = await ProgramDataRecord.findOne({
            where: { sub_program_id: subId, member_id: member.id, phase },
        });
        if (existing) {
            await existing.update({ data_json: { ...existing.data_json, ...dataJson } });
            updated++;
        } else {
            await ProgramDataRecord.create({
                sub_program_id: subId, member_id: member.id, phase,
                data_json: dataJson, created_by: 'import',
            });
            inserted++;
        }
        const total = inserted + updated;
        if (total % 100 === 0) process.stdout.write(`  ${total} processed...\r`);
    }

    console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}, Members auto-created: ${created}, Members not found: ${missingIds.length}`);
    if (missingIds.length > 0) {
        console.log('\nMissing external_ids (not in program_members, record skipped):');
        missingIds.forEach(id => console.log(`  ${id}`));
        console.log('\nTo auto-create these members and import their records, re-run with --create-missing');
    }
}

/* ════════════════════ Command: import visits (wide format) ═════════════ */
// Handles tracking data where Col3 = single PRE value and Col4+ = repeated POST visit columns.
// Field definitions (DatasetField) are auto-created from the TSV column headers.

function toFieldKey(label) {
    return label.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
}

async function cmdImportVisits(args) {
    const fileIdx       = args.indexOf('--file');
    const subIdx        = args.indexOf('--sub-program-id');
    const createMissing = args.includes('--create-missing');

    if (fileIdx === -1 || subIdx === -1) {
        console.error('Usage: importData.js visits --file <tsv> --sub-program-id <id> [--create-missing]');
        process.exit(1);
    }
    const filePath = args[fileIdx + 1];
    const subId    = parseInt(args[subIdx + 1]);

    const sub = await SubProgram.findByPk(subId);
    if (!sub) { console.error(`Sub-program ${subId} not found`); process.exit(1); }

    const { headers, records } = await parseCsv(filePath);
    // Expected layout: Col0=ID, Col1=Name, Col2=Gender, Col3=PRE value, Col4+=Visit columns
    if (headers.length < 5) {
        console.error('Expected at least 5 columns: ID, Name, Gender, PRE value, and at least one visit column.');
        process.exit(1);
    }

    const preHeader    = headers[3];
    const visitHeaders = headers.slice(4);
    const preKey       = toFieldKey(preHeader);

    console.log(`\nImporting visit data for sub-program "${sub.name}" (id=${subId})`);
    console.log(`  File    : ${filePath}`);
    console.log(`  PRE col : "${preHeader}" → field_key: "${preKey}"`);
    console.log(`  Visits  : ${visitHeaders.length} columns`);

    // Auto-create PRE field definition (phase = 'pre')
    await DatasetField.findOrCreate({
        where: { sub_program_id: subId, field_key: preKey },
        defaults: { field_label: preHeader, field_type: 'number', phase: 'pre', sort_order: 0 },
    });

    // Auto-create POST field definitions (phase = 'post'), one per visit column
    const visitFields = [];
    for (let i = 0; i < visitHeaders.length; i++) {
        const label = visitHeaders[i];
        const key   = toFieldKey(label);
        await DatasetField.findOrCreate({
            where: { sub_program_id: subId, field_key: key },
            defaults: { field_label: label, field_type: 'number', phase: 'post', sort_order: i + 1 },
        });
        visitFields.push({ key, header: label });
    }
    console.log(`  ✓ Field definitions ready: 1 PRE + ${visitFields.length} POST visit fields\n`);

    let preInserted = 0, preUpdated = 0;
    let postInserted = 0, postUpdated = 0;
    let membersCreated = 0;
    const missingIds = [];

    for (const row of records) {
        const externalId = (row[headers[0]] || '').trim();
        if (!externalId) continue;

        let member = await ProgramMember.findOne({
            where: { program_id: sub.program_id, external_id: externalId },
        });

        if (!member) {
            if (createMissing) {
                const name   = (row[headers[1]] || '').trim();
                const gender = (row[headers[2]] || '').trim();
                member = await ProgramMember.create({
                    program_id: sub.program_id, external_id: externalId,
                    name: name || externalId, gender: gender || null, created_by: 'import',
                });
                membersCreated++;
                console.log(`  ✓ Created member: ${externalId} — ${name}`);
            } else {
                missingIds.push(externalId);
                continue;
            }
        }

        // ── PRE record ─────────────────────────────────────────────────────
        const rawPre = row[preHeader];
        if (rawPre !== undefined && rawPre !== '') {
            const preJson = { [preKey]: isNaN(Number(rawPre)) ? rawPre : Number(rawPre) };
            const existingPre = await ProgramDataRecord.findOne({
                where: { sub_program_id: subId, member_id: member.id, phase: 'pre' },
            });
            if (existingPre) {
                await existingPre.update({ data_json: { ...existingPre.data_json, ...preJson } });
                preUpdated++;
            } else {
                await ProgramDataRecord.create({
                    sub_program_id: subId, member_id: member.id, phase: 'pre',
                    data_json: preJson, created_by: 'import',
                });
                preInserted++;
            }
        }

        // ── POST record (all visit columns) ────────────────────────────────
        const postJson = {};
        for (const { key, header } of visitFields) {
            const val = row[header];
            if (val !== undefined && val !== '') {
                postJson[key] = isNaN(Number(val)) ? val : Number(val);
            }
        }
        if (Object.keys(postJson).length > 0) {
            const existingPost = await ProgramDataRecord.findOne({
                where: { sub_program_id: subId, member_id: member.id, phase: 'post' },
            });
            if (existingPost) {
                await existingPost.update({ data_json: { ...existingPost.data_json, ...postJson } });
                postUpdated++;
            } else {
                await ProgramDataRecord.create({
                    sub_program_id: subId, member_id: member.id, phase: 'post',
                    data_json: postJson, created_by: 'import',
                });
                postInserted++;
            }
        }

        const total = preInserted + preUpdated + postInserted + postUpdated;
        if (total % 100 === 0 && total > 0) process.stdout.write(`  ${total} records...\r`);
    }

    console.log('\nDone.');
    console.log(`  PRE records  — Inserted: ${preInserted},  Updated: ${preUpdated}`);
    console.log(`  POST records — Inserted: ${postInserted}, Updated: ${postUpdated}`);
    console.log(`  Members — Auto-created: ${membersCreated}, Not found: ${missingIds.length}`);
    if (missingIds.length > 0) {
        console.log('\nMissing IDs (records skipped):');
        missingIds.forEach(id => console.log(`  ${id}`));
        console.log('\nRe-run with --create-missing to auto-create these members.');
    }
}

/* ═══════════════════════════ Entry ══════════════════════════════════════ */

async function main() {
    await sequelize.authenticate();
    await sequelize.sync({ alter: { drop: false } });

    const [,, command, ...rest] = process.argv;
    try {
        switch (command) {
            case 'setup':   await cmdSetup();              break;
            case 'members': await cmdImportMembers(rest);  break;
            case 'records': await cmdImportRecords(rest);  break;
            case 'visits':  await cmdImportVisits(rest);   break;
            default:
                console.log('Commands: setup | members | records | visits');
                console.log('Run with --help for usage.');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sequelize.close();
    }
}

main();
