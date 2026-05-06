const { Op } = require('sequelize');
const { Program, SubProgram, DatasetField, ProgramMember } = require('../models');

/* ═══════════════════════════════ PROGRAMS ═══════════════════════════════ */

exports.getPrograms = async (req, res) => {
    try {
        const programs = await Program.findAll({
            include: [{ model: SubProgram, as: 'sub_programs', attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']],
        });
        const result = await Promise.all(programs.map(async p => {
            const memberCount = await ProgramMember.count({ where: { program_id: p.id, is_active: true } });
            return { ...p.toJSON(), member_count: memberCount };
        }));
        res.json({ programs: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createProgram = async (req, res) => {
    const { name, description, start_date, end_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Program name is required' });
    try {
        const program = await Program.create({
            name, description, start_date, end_date,
            created_by: req.user.id,
        });
        res.status(201).json({ message: 'Program created', program });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getProgramDetail = async (req, res) => {
    try {
        const program = await Program.findByPk(req.params.id, {
            include: [{
                model: SubProgram,
                as: 'sub_programs',
                include: [{ model: DatasetField, as: 'fields', order: [['sort_order', 'ASC']] }],
            }],
        });
        if (!program) return res.status(404).json({ error: 'Program not found' });
        const memberCount = await ProgramMember.count({ where: { program_id: program.id, is_active: true } });
        res.json({ program: { ...program.toJSON(), member_count: memberCount } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProgram = async (req, res) => {
    try {
        const program = await Program.findByPk(req.params.id);
        if (!program) return res.status(404).json({ error: 'Program not found' });
        await program.update(req.body);
        res.json({ message: 'Program updated', program });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteProgram = async (req, res) => {
    try {
        const program = await Program.findByPk(req.params.id);
        if (!program) return res.status(404).json({ error: 'Program not found' });
        await program.destroy();
        res.json({ message: 'Program deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ════════════════════════════ SUB-PROGRAMS ══════════════════════════════ */

exports.getSubPrograms = async (req, res) => {
    try {
        const subs = await SubProgram.findAll({
            where: { program_id: req.params.id },
            order: [['id', 'ASC']],
        });
        res.json({ sub_programs: subs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createSubProgram = async (req, res) => {
    const { name, description, start_date, end_date, opt_out_enabled } = req.body;
    if (!name) return res.status(400).json({ error: 'Sub-program name is required' });
    try {
        const program = await Program.findByPk(req.params.id);
        if (!program) return res.status(404).json({ error: 'Program not found' });
        const sub = await SubProgram.create({
            program_id: req.params.id, name, description,
            start_date, end_date, opt_out_enabled: !!opt_out_enabled,
        });
        res.status(201).json({ message: 'Sub-program created', sub_program: sub });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getSubProgramDetail = async (req, res) => {
    try {
        const sub = await SubProgram.findByPk(req.params.id, {
            include: [{ model: DatasetField, as: 'fields', order: [['sort_order', 'ASC']] }],
        });
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });
        res.json({ sub_program: sub });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateSubProgram = async (req, res) => {
    try {
        const sub = await SubProgram.findByPk(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });
        await sub.update(req.body);
        res.json({ message: 'Sub-program updated', sub_program: sub });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteSubProgram = async (req, res) => {
    try {
        const sub = await SubProgram.findByPk(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });
        await sub.destroy();
        res.json({ message: 'Sub-program deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ══════════════════════════ FIELD DEFINITIONS ═══════════════════════════ */

exports.getFields = async (req, res) => {
    try {
        const fields = await DatasetField.findAll({
            where: { sub_program_id: req.params.id },
            order: [['sort_order', 'ASC'], ['id', 'ASC']],
        });
        res.json({ fields });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Bulk save: replaces all field definitions for a sub-program + phase
exports.saveFields = async (req, res) => {
    const { fields, phase } = req.body; // phase: 'pre'|'post'|'both' or omit for all
    if (!Array.isArray(fields) || fields.length === 0)
        return res.status(400).json({ error: '`fields` array is required' });

    try {
        const sub = await SubProgram.findByPk(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });

        const where = { sub_program_id: req.params.id };
        if (phase) where.phase = phase;
        await DatasetField.destroy({ where });

        const rows = fields.map((f, i) => ({
            sub_program_id: req.params.id,
            phase:       f.phase       || phase || 'both',
            field_key:   f.field_key,
            field_label: f.field_label,
            field_type:  f.field_type  || 'text',
            unit:        f.unit        || null,
            sort_order:  f.sort_order  !== undefined ? f.sort_order : i,
        }));
        const saved = await DatasetField.bulkCreate(rows);
        res.json({ message: `${saved.length} fields saved`, fields: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addField = async (req, res) => {
    const { field_key, field_label, field_type, unit, phase, sort_order } = req.body;
    if (!field_key || !field_label)
        return res.status(400).json({ error: 'field_key and field_label are required' });
    try {
        const field = await DatasetField.create({
            sub_program_id: req.params.id, phase: phase || 'both',
            field_key, field_label, field_type: field_type || 'text', unit, sort_order: sort_order || 0,
        });
        res.status(201).json({ field });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateField = async (req, res) => {
    try {
        const field = await DatasetField.findByPk(req.params.fieldId);
        if (!field) return res.status(404).json({ error: 'Field not found' });
        await field.update(req.body);
        res.json({ field });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteField = async (req, res) => {
    try {
        const field = await DatasetField.findByPk(req.params.fieldId);
        if (!field) return res.status(404).json({ error: 'Field not found' });
        await field.destroy();
        res.json({ message: 'Field deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
