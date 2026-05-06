const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME    || 'remote_patient_monitor',
    process.env.DB_USER    || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
        host:    process.env.DB_HOST || 'localhost',
        port:    process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false,
    }
);

/* ─── Programs ──────────────────────────────────────────── */
const Program = sequelize.define('program', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:        { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT },
    start_date:  { type: DataTypes.DATEONLY },
    end_date:    { type: DataTypes.DATEONLY },
    created_by:  { type: DataTypes.STRING(50) },
}, { tableName: 'programs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/* ─── Sub-Programs ──────────────────────────────────────── */
const SubProgram = sequelize.define('sub_program', {
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    program_id:        { type: DataTypes.INTEGER, allowNull: false },
    name:              { type: DataTypes.STRING(200), allowNull: false },
    description:       { type: DataTypes.TEXT },
    start_date:        { type: DataTypes.DATEONLY },
    end_date:          { type: DataTypes.DATEONLY },
    opt_out_enabled:   { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'sub_programs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/* ─── Dataset Field Definitions (schema per sub-program) ── */
const DatasetField = sequelize.define('dataset_field', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sub_program_id: { type: DataTypes.INTEGER, allowNull: false },
    phase:          { type: DataTypes.ENUM('pre', 'post', 'both'), defaultValue: 'both' },
    field_key:      { type: DataTypes.STRING(100), allowNull: false },
    field_label:    { type: DataTypes.STRING(300), allowNull: false },
    field_type:     { type: DataTypes.ENUM('number', 'text', 'select'), defaultValue: 'text' },
    unit:           { type: DataTypes.STRING(50) },
    sort_order:     { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'dataset_fields', timestamps: false });

/* ─── Program Members ───────────────────────────────────── */
const ProgramMember = sequelize.define('program_member', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    program_id:   { type: DataTypes.INTEGER, allowNull: false },
    user_id:      { type: DataTypes.STRING(50) },          // FK to users.id — nullable until linked
    external_id:  { type: DataTypes.STRING(30) },          // MMES_001 from the sheet
    name:         { type: DataTypes.STRING(200) },
    phone:        { type: DataTypes.STRING(20) },
    gender:       { type: DataTypes.STRING(20) },
    age:          { type: DataTypes.INTEGER },
    class_info:   { type: DataTypes.STRING(200) },         // e.g. "Ist Year B.Com (G)"
    place:        { type: DataTypes.STRING(100) },
    watch_serial: { type: DataTypes.STRING(100) },
    is_active:    { type: DataTypes.BOOLEAN, defaultValue: true },
    joined_at:    { type: DataTypes.DATEONLY },
}, { tableName: 'program_members', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/* ─── Sub-Program Opt-Outs ──────────────────────────────── */
const SubProgramOptOut = sequelize.define('sub_program_opt_out', {
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sub_program_id: { type: DataTypes.INTEGER, allowNull: false },
    member_id:      { type: DataTypes.INTEGER, allowNull: false },
    opted_out_at:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'sub_program_opt_outs', timestamps: false });

/* ─── Data Records (Pre / Post) ─────────────────────────── */
const ProgramDataRecord = sequelize.define('program_data_record', {
    id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sub_program_id:      { type: DataTypes.INTEGER, allowNull: false },
    member_id:           { type: DataTypes.INTEGER, allowNull: false },
    phase:               { type: DataTypes.ENUM('pre', 'post'), allowNull: false },
    data_json:           { type: DataTypes.JSONB, defaultValue: {} },
    verification_status: { type: DataTypes.ENUM('pending', 'verified'), defaultValue: 'pending' },
    verified_by:         { type: DataTypes.STRING(50) },
    verified_at:         { type: DataTypes.DATE },
    created_by:          { type: DataTypes.STRING(50) },
    notes:               { type: DataTypes.TEXT },
}, { tableName: 'program_data_records', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

/* ─── Audit Logs ────────────────────────────────────────── */
const ProgramAuditLog = sequelize.define('program_audit_log', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    record_id:       { type: DataTypes.INTEGER },
    sub_program_id:  { type: DataTypes.INTEGER },
    program_id:      { type: DataTypes.INTEGER },
    member_id:       { type: DataTypes.INTEGER },
    phase:           { type: DataTypes.STRING(10) },
    action:          { type: DataTypes.ENUM('created', 'updated', 'verified', 'deleted') },
    changed_fields:  { type: DataTypes.JSONB },   // { field_key: { old, new } }
    changed_by:      { type: DataTypes.STRING(50) },
    changed_by_role: { type: DataTypes.STRING(30) },
    changed_at:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'program_audit_logs', timestamps: false });

/* ─── Associations ──────────────────────────────────────── */
Program.hasMany(SubProgram,      { foreignKey: 'program_id', as: 'sub_programs' });
SubProgram.belongsTo(Program,    { foreignKey: 'program_id' });

SubProgram.hasMany(DatasetField, { foreignKey: 'sub_program_id', as: 'fields' });
DatasetField.belongsTo(SubProgram, { foreignKey: 'sub_program_id' });

Program.hasMany(ProgramMember,   { foreignKey: 'program_id', as: 'members' });
ProgramMember.belongsTo(Program, { foreignKey: 'program_id' });

SubProgram.hasMany(SubProgramOptOut, { foreignKey: 'sub_program_id' });
ProgramMember.hasMany(SubProgramOptOut, { foreignKey: 'member_id', as: 'opt_outs' });

SubProgram.hasMany(ProgramDataRecord, { foreignKey: 'sub_program_id', as: 'records' });
ProgramMember.hasMany(ProgramDataRecord, { foreignKey: 'member_id', as: 'records' });
ProgramDataRecord.belongsTo(SubProgram,    { foreignKey: 'sub_program_id' });
ProgramDataRecord.belongsTo(ProgramMember, { foreignKey: 'member_id' });

module.exports = {
    sequelize,
    Program,
    SubProgram,
    DatasetField,
    ProgramMember,
    SubProgramOptOut,
    ProgramDataRecord,
    ProgramAuditLog,
};
