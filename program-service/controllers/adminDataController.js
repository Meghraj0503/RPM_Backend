const { Op, Sequelize } = require('sequelize');
const {
    Program, SubProgram, DatasetField,
    ProgramMember, SubProgramOptOut,
    ProgramDataRecord, ProgramAuditLog,
    sequelize,
} = require('../models');

/* ──────────────────────────── helpers ───────────────────── */

async function writeAudit({ record_id, sub_program_id, program_id, member_id, phase, action, changed_fields, changed_by, changed_by_role }) {
    try {
        await ProgramAuditLog.create({ record_id, sub_program_id, program_id, member_id, phase, action, changed_fields, changed_by, changed_by_role });
    } catch { /* non-fatal */ }
}

function diffJson(oldData = {}, newData = {}) {
    const changes = {};
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    for (const k of keys) {
        if (String(oldData[k] ?? '') !== String(newData[k] ?? ''))
            changes[k] = { old: oldData[k] ?? null, new: newData[k] ?? null };
    }
    return changes;
}

/* ═══════════════════════════ MEMBERS ════════════════════════════ */

exports.getMembers = async (req, res) => {
    const { q, gender, is_active = 'true', page = 1, limit = 50 } = req.query;
    const where = { program_id: req.params.id };
    if (is_active !== 'all') where.is_active = is_active === 'true';
    if (gender) where.gender = gender;
    if (q) {
        where[Op.or] = [
            { name:        { [Op.iLike]: `%${q}%` } },
            { external_id: { [Op.iLike]: `%${q}%` } },
            { phone:       { [Op.iLike]: `%${q}%` } },
        ];
    }
    try {
        const { count, rows } = await ProgramMember.findAndCountAll({
            where, order: [['external_id', 'ASC']],
            limit: Number(limit), offset: (Number(page) - 1) * Number(limit),
        });
        res.json({ total: count, page: Number(page), members: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addMember = async (req, res) => {
    const { external_id, name, phone, gender, age, class_info, place, watch_serial, joined_at } = req.body;
    try {
        const member = await ProgramMember.create({
            program_id: req.params.id, external_id, name, phone, gender, age,
            class_info, place, watch_serial, joined_at,
        });
        res.status(201).json({ member });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateMember = async (req, res) => {
    try {
        const member = await ProgramMember.findByPk(req.params.memberId);
        if (!member) return res.status(404).json({ error: 'Member not found' });
        await member.update(req.body);
        res.json({ member });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.removeMember = async (req, res) => {
    try {
        const member = await ProgramMember.findOne({
            where: { id: req.params.memberId, program_id: req.params.id },
        });
        if (!member) return res.status(404).json({ error: 'Member not found' });
        await member.update({ is_active: false });
        res.json({ message: 'Member removed from program' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Link program_members to users table by matching last-10-digits of phone_number
exports.linkMembers = async (req, res) => {
    try {
        const members = await ProgramMember.findAll({
            where: { program_id: req.params.id, user_id: null, phone: { [Op.ne]: null } },
        });
        let linked = 0;
        for (const m of members) {
            const last10 = (m.phone || '').replace(/\D/g, '').slice(-10);
            if (!last10) continue;
            const [user] = await sequelize.query(
                `SELECT id FROM users WHERE RIGHT(phone_number, 10) = :last10 LIMIT 1`,
                { replacements: { last10 }, type: sequelize.QueryTypes.SELECT }
            );
            if (user) { await m.update({ user_id: user.id }); linked++; }
        }
        res.json({ message: `Linked ${linked} of ${members.length} members to user accounts` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/programs/admin/users/:userId/programs
// Returns all program memberships for a given app user (by user_id or phone fallback)
exports.getUserPrograms = async (req, res) => {
    try {
        const userId = req.params.userId;
        const [userRow] = await sequelize.query(
            `SELECT phone_number FROM users WHERE id = :userId LIMIT 1`,
            { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );
        const last10 = userRow?.phone_number
            ? userRow.phone_number.replace(/\D/g, '').slice(-10) : null;

        const whereClause = last10
            ? { [Op.or]: [
                { user_id: userId },
                Sequelize.where(Sequelize.fn('RIGHT', Sequelize.col('phone'), 10), last10),
              ] }
            : { user_id: userId };

        const members = await ProgramMember.findAll({
            where: whereClause,
            include: [{ model: Program, attributes: ['id', 'name', 'description', 'start_date', 'end_date'] }],
            order: [['created_at', 'DESC']],
        });

        const result = await Promise.all(members.map(async m => {
            const subPrograms = await SubProgram.findAll({
                where: { program_id: m.program_id }, attributes: ['id', 'name'],
            });
            const dataSummary = await Promise.all(subPrograms.map(async sub => {
                const [pre, post, optOut] = await Promise.all([
                    ProgramDataRecord.findOne({ where: { sub_program_id: sub.id, member_id: m.id, phase: 'pre' }, attributes: ['id', 'verification_status', 'created_at'] }),
                    ProgramDataRecord.findOne({ where: { sub_program_id: sub.id, member_id: m.id, phase: 'post' }, attributes: ['id', 'verification_status', 'updated_at'] }),
                    SubProgramOptOut.findOne({ where: { sub_program_id: sub.id, member_id: m.id } }),
                ]);
                return { sub_program: sub, pre, post, opted_out: !!optOut };
            }));
            return { member: m.toJSON(), program: m.program, data_summary: dataSummary };
        }));

        res.json({ programs: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/programs/admin/users/:userId/program-audit
// Returns program audit logs for all memberships of a user
exports.getUserProgramAudit = async (req, res) => {
    try {
        const userId = req.params.userId;
        const members = await ProgramMember.findAll({
            where: { user_id: userId }, attributes: ['id'],
        });
        if (members.length === 0) return res.json({ audit: [] });

        const memberIds = members.map(m => m.id);
        const logs = await ProgramAuditLog.findAll({
            where: { member_id: { [Op.in]: memberIds } },
            order: [['changed_at', 'DESC']],
            limit: 200,
        });
        res.json({ audit: logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMemberDetail = async (req, res) => {
    try {
        const member = await ProgramMember.findByPk(req.params.memberId, {
            include: [{ model: Program, attributes: ['id', 'name'] }],
        });
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const subs = await SubProgram.findAll({ where: { program_id: member.program_id } });
        const summary = await Promise.all(subs.map(async sub => {
            const pre = await ProgramDataRecord.findOne({
                where: { sub_program_id: sub.id, member_id: member.id, phase: 'pre' },
                attributes: ['id', 'verification_status', 'created_at'],
            });
            const post = await ProgramDataRecord.findOne({
                where: { sub_program_id: sub.id, member_id: member.id, phase: 'post' },
                attributes: ['id', 'verification_status', 'updated_at'],
            });
            const optOut = await SubProgramOptOut.findOne({
                where: { sub_program_id: sub.id, member_id: member.id },
            });
            return { sub_program: { id: sub.id, name: sub.name }, pre, post, opted_out: !!optOut };
        }));
        res.json({ member, sub_program_summary: summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ════════════════════════ DATA RECORDS ══════════════════════════ */

exports.getRecords = async (req, res) => {
    const { sub_program_id, member_id, phase } = req.query;
    const where = {};
    if (sub_program_id) where.sub_program_id = sub_program_id;
    if (member_id)      where.member_id = member_id;
    if (phase)          where.phase = phase;
    try {
        const records = await ProgramDataRecord.findAll({
            where,
            include: [
                { model: ProgramMember, attributes: ['id', 'name', 'external_id'] },
                { model: SubProgram,    attributes: ['id', 'name'] },
            ],
            order: [['created_at', 'DESC']],
        });
        res.json({ records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all data for one member across all sub-programs (admin detail view)
exports.getMemberData = async (req, res) => {
    try {
        const member = await ProgramMember.findByPk(req.params.memberId);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const subs = await SubProgram.findAll({
            where: { program_id: member.program_id },
            include: [{ model: DatasetField, as: 'fields', order: [['sort_order', 'ASC']] }],
        });

        const data = await Promise.all(subs.map(async sub => {
            const [pre, post] = await Promise.all([
                ProgramDataRecord.findOne({ where: { sub_program_id: sub.id, member_id: member.id, phase: 'pre' } }),
                ProgramDataRecord.findOne({ where: { sub_program_id: sub.id, member_id: member.id, phase: 'post' } }),
            ]);
            const optedOut = await SubProgramOptOut.findOne({ where: { sub_program_id: sub.id, member_id: member.id } });
            return { sub_program: sub, pre, post, opted_out: !!optedOut };
        }));
        res.json({ member, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createRecord = async (req, res) => {
    const { sub_program_id, member_id, phase, data_json, notes } = req.body;
    if (!sub_program_id || !member_id || !phase)
        return res.status(400).json({ error: 'sub_program_id, member_id, phase are required' });
    try {
        // Prevent duplicate (only one pre and one post per member per sub-program)
        const existing = await ProgramDataRecord.findOne({ where: { sub_program_id, member_id, phase } });
        if (existing) return res.status(409).json({ error: `${phase} record already exists for this member`, record_id: existing.id });

        const record = await ProgramDataRecord.create({
            sub_program_id, member_id, phase, data_json: data_json || {},
            notes, created_by: req.user.id,
        });

        const sub = await SubProgram.findByPk(sub_program_id, { attributes: ['program_id'] });
        await writeAudit({
            record_id: record.id, sub_program_id, program_id: sub?.program_id,
            member_id, phase, action: 'created',
            changed_fields: data_json || {},
            changed_by: req.user.id, changed_by_role: req.user.role,
        });
        res.status(201).json({ record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateRecord = async (req, res) => {
    try {
        const record = await ProgramDataRecord.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        const oldData = record.data_json || {};
        const newData = { ...oldData, ...(req.body.data_json || {}) };
        const changes = diffJson(oldData, newData);

        await record.update({ data_json: newData, notes: req.body.notes ?? record.notes });

        if (Object.keys(changes).length > 0) {
            const sub = await SubProgram.findByPk(record.sub_program_id, { attributes: ['program_id'] });
            await writeAudit({
                record_id: record.id, sub_program_id: record.sub_program_id, program_id: sub?.program_id,
                member_id: record.member_id, phase: record.phase, action: 'updated',
                changed_fields: changes, changed_by: req.user.id, changed_by_role: req.user.role,
            });
        }
        res.json({ record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.verifyRecord = async (req, res) => {
    try {
        const record = await ProgramDataRecord.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        if (record.phase !== 'post')
            return res.status(400).json({ error: 'Only Post records can be verified' });
        if (record.verification_status === 'verified')
            return res.status(400).json({ error: 'Record already verified' });

        await record.update({
            verification_status: 'verified',
            verified_by: req.user.id,
            verified_at: new Date(),
        });

        const sub = await SubProgram.findByPk(record.sub_program_id, { attributes: ['program_id'] });
        await writeAudit({
            record_id: record.id, sub_program_id: record.sub_program_id, program_id: sub?.program_id,
            member_id: record.member_id, phase: 'post', action: 'verified',
            changed_fields: { verification_status: { old: 'pending', new: 'verified' } },
            changed_by: req.user.id, changed_by_role: req.user.role,
        });
        res.json({ message: 'Record verified. It is now locked for user editing.', record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteRecord = async (req, res) => {
    try {
        const record = await ProgramDataRecord.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        const sub = await SubProgram.findByPk(record.sub_program_id, { attributes: ['program_id'] });
        await writeAudit({
            record_id: record.id, sub_program_id: record.sub_program_id, program_id: sub?.program_id,
            member_id: record.member_id, phase: record.phase, action: 'deleted',
            changed_fields: {}, changed_by: req.user.id, changed_by_role: req.user.role,
        });
        await record.destroy();
        res.json({ message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ═══════════════════════════ AUDIT LOGS ════════════════════════ */

exports.getAuditLogs = async (req, res) => {
    const { program_id, sub_program_id, member_id, action, from, to, page = 1, limit = 50 } = req.query;
    const where = {};
    if (program_id)     where.program_id     = program_id;
    if (sub_program_id) where.sub_program_id = sub_program_id;
    if (member_id)      where.member_id      = member_id;
    if (action)         where.action         = action;
    if (from || to) {
        where.changed_at = {};
        if (from) where.changed_at[Op.gte] = new Date(from);
        if (to)   where.changed_at[Op.lte] = new Date(to + 'T23:59:59');
    }
    try {
        const { count, rows } = await ProgramAuditLog.findAndCountAll({
            where, order: [['changed_at', 'DESC']],
            limit: Number(limit), offset: (Number(page) - 1) * Number(limit),
        });
        res.json({ total: count, page: Number(page), logs: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ═══════════════════════════ BULK IMPORT ═══════════════════════ */

// POST /import/members — body: { program_id, members: [{external_id, name, phone, gender, age, class_info, place, watch_serial},...] }
exports.importMembers = async (req, res) => {
    const { program_id, members } = req.body;
    if (!program_id || !Array.isArray(members) || members.length === 0)
        return res.status(400).json({ error: 'program_id and members[] are required' });
    try {
        let inserted = 0, skipped = 0;
        for (const m of members) {
            if (!m.external_id) { skipped++; continue; }
            const exists = await ProgramMember.findOne({ where: { program_id, external_id: m.external_id } });
            if (exists) { skipped++; continue; }
            await ProgramMember.create({ program_id, ...m });
            inserted++;
        }
        res.json({ message: `Import complete`, inserted, skipped });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /import/records — body: { sub_program_id, phase, records: [{external_id, data_json},...] }
exports.importRecords = async (req, res) => {
    const { sub_program_id, phase, records } = req.body;
    if (!sub_program_id || !phase || !Array.isArray(records) || records.length === 0)
        return res.status(400).json({ error: 'sub_program_id, phase, and records[] are required' });

    const sub = await SubProgram.findByPk(sub_program_id);
    if (!sub) return res.status(404).json({ error: 'Sub-program not found' });

    try {
        let inserted = 0, updated = 0, notFound = 0;
        for (const r of records) {
            const member = await ProgramMember.findOne({
                where: { program_id: sub.program_id, external_id: r.external_id },
            });
            if (!member) { notFound++; continue; }

            const existing = await ProgramDataRecord.findOne({
                where: { sub_program_id, member_id: member.id, phase },
            });
            if (existing) {
                await existing.update({ data_json: { ...existing.data_json, ...r.data_json } });
                updated++;
            } else {
                await ProgramDataRecord.create({
                    sub_program_id, member_id: member.id, phase,
                    data_json: r.data_json || {}, created_by: 'import',
                });
                inserted++;
            }
        }
        res.json({ message: 'Record import complete', inserted, updated, not_found: notFound });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get members with their data for comparison view (all members in a sub-program)
exports.getSubProgramAllMembersData = async (req, res) => {
    const { phase = 'pre' } = req.query;
    try {
        const sub = await SubProgram.findByPk(req.params.subId, {
            include: [{ model: DatasetField, as: 'fields', order: [['sort_order', 'ASC']] }],
        });
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });

        const records = await ProgramDataRecord.findAll({
            where: { sub_program_id: req.params.subId, phase },
            include: [{ model: ProgramMember, attributes: ['id', 'name', 'external_id', 'gender', 'age'] }],
            order: [[ProgramMember, 'external_id', 'ASC']],
        });
        res.json({ sub_program: sub, phase, records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
