/**
 * Program Service — Database Migration Script
 *
 * Run:  node migrate.js
 *
 * - Creates all tables if they don't exist (safe to re-run)
 * - Each migration step is labelled; add new steps at the bottom for future columns
 * - Uses Sequelize QueryInterface so no raw SQL needed
 */

require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME     || 'remote_patient_monitor',
    process.env.DB_USER     || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
        host:    process.env.DB_HOST || 'localhost',
        port:    process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false,
    }
);

const qi = sequelize.getQueryInterface();

/* ─── helpers ────────────────────────────────────────────── */

async function tableExists(name) {
    const [rows] = await sequelize.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = :name LIMIT 1`,
        { replacements: { name }, type: Sequelize.QueryTypes.SELECT }
    );
    return !!rows;
}

async function columnExists(table, column) {
    const [rows] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = :table AND column_name = :column LIMIT 1`,
        { replacements: { table, column }, type: Sequelize.QueryTypes.SELECT }
    );
    return !!rows;
}

async function indexExists(name) {
    const [rows] = await sequelize.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = :name LIMIT 1`,
        { replacements: { name }, type: Sequelize.QueryTypes.SELECT }
    );
    return !!rows;
}

async function addColumnIfMissing(table, column, definition) {
    if (!(await columnExists(table, column))) {
        await qi.addColumn(table, column, definition);
        console.log(`  + Added column: ${table}.${column}`);
    }
}

async function createIndexIfMissing(name, table, fields, options = {}) {
    if (!(await indexExists(name))) {
        await qi.addIndex(table, fields, { name, ...options });
        console.log(`  + Created index: ${name}`);
    }
}

async function step(label, fn) {
    process.stdout.write(`[migration] ${label} ... `);
    try {
        await fn();
        console.log('OK');
    } catch (err) {
        console.log(`SKIP (${err.message.split('\n')[0]})`);
    }
}

/* ═══════════════════════════════════════════════════════════
   MIGRATION STEPS
   Add new steps at the bottom when you change the model.
   ═══════════════════════════════════════════════════════════ */

async function migrate() {
    await sequelize.authenticate();
    console.log('Connected to database.\n');

    /* ── Step 1: programs ──────────────────────────────────── */
    await step('Create table: programs', async () => {
        if (await tableExists('programs')) return;
        await qi.createTable('programs', {
            id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            name:        { type: DataTypes.STRING(200), allowNull: false },
            description: { type: DataTypes.TEXT },
            start_date:  { type: DataTypes.DATEONLY },
            end_date:    { type: DataTypes.DATEONLY },
            created_by:  { type: DataTypes.STRING(50) },
            created_at:  { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at:  { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
    });

    /* ── Step 2: sub_programs ──────────────────────────────── */
    await step('Create table: sub_programs', async () => {
        if (await tableExists('sub_programs')) return;
        await qi.createTable('sub_programs', {
            id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            program_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'programs', key: 'id' }, onDelete: 'CASCADE' },
            name:            { type: DataTypes.STRING(200), allowNull: false },
            description:     { type: DataTypes.TEXT },
            start_date:      { type: DataTypes.DATEONLY },
            end_date:        { type: DataTypes.DATEONLY },
            opt_out_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
            created_at:      { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at:      { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
    });

    /* ── Step 3: dataset_fields ────────────────────────────── */
    await step('Create table: dataset_fields', async () => {
        if (await tableExists('dataset_fields')) return;
        await qi.createTable('dataset_fields', {
            id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            sub_program_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sub_programs', key: 'id' }, onDelete: 'CASCADE' },
            phase:          { type: DataTypes.STRING(10), defaultValue: 'both' },
            field_key:      { type: DataTypes.STRING(100), allowNull: false },
            field_label:    { type: DataTypes.STRING(300), allowNull: false },
            field_type:     { type: DataTypes.STRING(20), defaultValue: 'text' },
            unit:           { type: DataTypes.STRING(50) },
            sort_order:     { type: DataTypes.INTEGER, defaultValue: 0 },
        });
    });

    /* ── Step 4: program_members ───────────────────────────── */
    await step('Create table: program_members', async () => {
        if (await tableExists('program_members')) return;
        await qi.createTable('program_members', {
            id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            program_id:   { type: DataTypes.INTEGER, allowNull: false, references: { model: 'programs', key: 'id' }, onDelete: 'CASCADE' },
            user_id:      { type: DataTypes.STRING(50) },
            external_id:  { type: DataTypes.STRING(30) },
            name:         { type: DataTypes.STRING(200) },
            phone:        { type: DataTypes.STRING(20) },
            gender:       { type: DataTypes.STRING(20) },
            age:          { type: DataTypes.INTEGER },
            class_info:   { type: DataTypes.STRING(200) },
            place:        { type: DataTypes.STRING(100) },
            watch_serial: { type: DataTypes.STRING(100) },
            is_active:    { type: DataTypes.BOOLEAN, defaultValue: true },
            joined_at:    { type: DataTypes.DATEONLY },
            created_at:   { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at:   { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
    });

    /* ── Step 5: sub_program_opt_outs ──────────────────────── */
    await step('Create table: sub_program_opt_outs', async () => {
        if (await tableExists('sub_program_opt_outs')) return;
        await qi.createTable('sub_program_opt_outs', {
            id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            sub_program_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sub_programs', key: 'id' }, onDelete: 'CASCADE' },
            member_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'program_members', key: 'id' }, onDelete: 'CASCADE' },
            opted_out_at:   { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
    });

    /* ── Step 6: program_data_records ──────────────────────── */
    await step('Create table: program_data_records', async () => {
        if (await tableExists('program_data_records')) return;
        await qi.createTable('program_data_records', {
            id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            sub_program_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: 'sub_programs', key: 'id' }, onDelete: 'CASCADE' },
            member_id:           { type: DataTypes.INTEGER, allowNull: false, references: { model: 'program_members', key: 'id' }, onDelete: 'CASCADE' },
            phase:               { type: DataTypes.STRING(5), allowNull: false },
            data_json:           { type: DataTypes.JSONB, defaultValue: {} },
            verification_status: { type: DataTypes.STRING(10), defaultValue: 'pending' },
            verified_by:         { type: DataTypes.STRING(50) },
            verified_at:         { type: DataTypes.DATE },
            created_by:          { type: DataTypes.STRING(50) },
            notes:               { type: DataTypes.TEXT },
            created_at:          { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at:          { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
    });

    /* ── Step 7: program_audit_logs ────────────────────────── */
    await step('Create table: program_audit_logs', async () => {
        if (await tableExists('program_audit_logs')) return;
        await qi.createTable('program_audit_logs', {
            id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            record_id:       { type: DataTypes.INTEGER },
            sub_program_id:  { type: DataTypes.INTEGER },
            program_id:      { type: DataTypes.INTEGER },
            member_id:       { type: DataTypes.INTEGER },
            phase:           { type: DataTypes.STRING(10) },
            action:          { type: DataTypes.STRING(20), allowNull: false },
            changed_fields:  { type: DataTypes.JSONB },
            changed_by:      { type: DataTypes.STRING(50) },
            changed_by_role: { type: DataTypes.STRING(30) },
            changed_at:      { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        });
    });

    /* ── Step 8: Indexes ───────────────────────────────────── */
    await step('Create indexes', async () => {
        await createIndexIfMissing('idx_sub_programs_program',  'sub_programs',           ['program_id']);
        await createIndexIfMissing('idx_dataset_fields_sub',    'dataset_fields',         ['sub_program_id']);
        await createIndexIfMissing('idx_program_members_prog',  'program_members',        ['program_id']);
        await createIndexIfMissing('idx_program_members_user',  'program_members',        ['user_id']);
        await createIndexIfMissing('idx_program_members_ext',   'program_members',        ['external_id']);
        await createIndexIfMissing('idx_program_members_phone', 'program_members',        ['phone']);
        await createIndexIfMissing('idx_opt_outs_sub',          'sub_program_opt_outs',   ['sub_program_id']);
        await createIndexIfMissing('idx_opt_outs_member',       'sub_program_opt_outs',   ['member_id']);
        await createIndexIfMissing('idx_pdr_sub',               'program_data_records',   ['sub_program_id']);
        await createIndexIfMissing('idx_pdr_member',            'program_data_records',   ['member_id']);
        await createIndexIfMissing('idx_pdr_phase',             'program_data_records',   ['sub_program_id', 'phase']);
        await createIndexIfMissing('idx_pdr_status',            'program_data_records',   ['verification_status']);
        await createIndexIfMissing('idx_pal_program',           'program_audit_logs',     ['program_id']);
        await createIndexIfMissing('idx_pal_sub',               'program_audit_logs',     ['sub_program_id']);
        await createIndexIfMissing('idx_pal_member',            'program_audit_logs',     ['member_id']);
        await createIndexIfMissing('idx_pal_changed_at',        'program_audit_logs',     ['changed_at']);
    });

    /* ══════════════════════════════════════════════════════════
       FUTURE MIGRATIONS — Add new steps below this line.
       Never modify steps above; only append new ones.

       Pattern for adding a new column:
       ══════════════════════════════════════════════════════════

    await step('Add column: programs.is_archived (v3.1)', async () => {
        await addColumnIfMissing('programs', 'is_archived', {
            type: DataTypes.BOOLEAN, defaultValue: false,
        });
    });

    await step('Add column: program_members.email (v3.2)', async () => {
        await addColumnIfMissing('program_members', 'email', {
            type: DataTypes.STRING(255),
        });
    });

    await step('Add column: program_data_records.import_source (v3.3)', async () => {
        await addColumnIfMissing('program_data_records', 'import_source', {
            type: DataTypes.STRING(50),
        });
    });

    ══════════════════════════════════════════════════════════ */

    console.log('\nAll migrations complete.\n');

    // Print current table summary
    const tables = ['programs','sub_programs','dataset_fields','program_members',
                    'sub_program_opt_outs','program_data_records','program_audit_logs'];
    console.log('Table row counts:');
    for (const t of tables) {
        try {
            const [[{ count }]] = await sequelize.query(`SELECT COUNT(*) AS count FROM "${t}"`);
            console.log(`  ${t.padEnd(32)} ${count} rows`);
        } catch { console.log(`  ${t.padEnd(32)} (not found)`); }
    }
}

migrate()
    .catch(err => { console.error('\nMigration failed:', err.message); process.exit(1); })
    .finally(() => sequelize.close());
