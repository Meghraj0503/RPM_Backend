const { Op } = require('sequelize');
const {
    Program, SubProgram, DatasetField,
    ProgramMember, SubProgramOptOut,
    ProgramDataRecord, ProgramAuditLog,
} = require('../models');

/* ─────────────────────── helper ─────────────────────────── */

// Strips country code prefixes so "+919566776106" and "9566776106" both → "9566776106"
function normalizePhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

// Find the program_member row for the currently logged-in user.
// Tries user_id first; falls back to phone match (handles +91 prefix mismatch).
async function findMember(userId, userPhone, programId) {
    let member = await ProgramMember.findOne({
        where: { program_id: programId, user_id: userId, is_active: true },
    });
    if (!member && userPhone) {
        const normalized = normalizePhone(userPhone);
        const phoneVariants = [...new Set([userPhone, normalized])].filter(Boolean);
        member = await ProgramMember.findOne({
            where: { program_id: programId, phone: { [Op.in]: phoneVariants }, is_active: true },
        });
        if (member && !member.user_id) await member.update({ user_id: userId });
    }
    return member;
}

/* ══════════════════════ USER: PROGRAMS ══════════════════════ */

// GET /api/programs/user/
exports.getMyPrograms = async (req, res) => {
    try {
        const phoneVariants = req.user.phoneNumberNumber
            ? [...new Set([req.user.phoneNumberNumber, normalizePhone(req.user.phoneNumberNumber)])].filter(Boolean)
            : [];
        const memberships = await ProgramMember.findAll({
            where: { [Op.or]: [
                { user_id: req.user.id },
                ...(phoneVariants.length ? [{ phone: { [Op.in]: phoneVariants } }] : []),
            ], is_active: true },
            attributes: ['program_id'],
        });
        const programIds = [...new Set(memberships.map(m => m.program_id))];
        if (programIds.length === 0) return res.json({ programs: [] });

        const programs = await Program.findAll({
            where: { id: programIds },
            include: [{ model: SubProgram, as: 'sub_programs', attributes: ['id', 'name', 'description', 'start_date', 'end_date', 'opt_out_enabled'] }],
            order: [['start_date', 'DESC']],
        });
        res.json({ programs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/programs/user/:id  — program detail + sub-programs with opt-out status
exports.getProgramDetail = async (req, res) => {
    try {
        const program = await Program.findByPk(req.params.id, {
            include: [{
                model: SubProgram,
                as: 'sub_programs',
                attributes: ['id', 'name', 'description', 'start_date', 'end_date', 'opt_out_enabled'],
            }],
        });
        if (!program) return res.status(404).json({ error: 'Program not found' });

        const member = await findMember(req.user.id, req.user.phoneNumber, program.id);
        if (!member) return res.status(403).json({ error: 'You are not enrolled in this program' });

        // Attach opt-out status per sub-program
        const optOuts = await SubProgramOptOut.findAll({ where: { member_id: member.id } });
        const optOutSet = new Set(optOuts.map(o => o.sub_program_id));

        const subPrograms = program.sub_programs.map(s => ({
            ...s.toJSON(),
            opted_out: optOutSet.has(s.id),
        }));
        res.json({ program: { ...program.toJSON(), sub_programs: subPrograms } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ══════════════════ USER: OPT-OUT ═══════════════════════════ */

// POST /api/programs/user/sub-programs/:id/opt-out
exports.optOut = async (req, res) => {
    try {
        const sub = await SubProgram.findByPk(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });
        if (!sub.opt_out_enabled)
            return res.status(403).json({ error: 'Opt-out is not allowed for this sub-program' });

        const member = await findMember(req.user.id, req.user.phoneNumber, sub.program_id);
        if (!member) return res.status(403).json({ error: 'Not enrolled in this program' });

        const alreadyOpted = await SubProgramOptOut.findOne({
            where: { sub_program_id: sub.id, member_id: member.id },
        });
        if (alreadyOpted) return res.status(400).json({ error: 'Already opted out of this sub-program' });

        await SubProgramOptOut.create({ sub_program_id: sub.id, member_id: member.id });
        res.json({ message: `Opted out of ${sub.name}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ════════════════════ USER: VIEW DATA ════════════════════════ */

// GET /api/programs/user/sub-programs/:id/data — user's pre + post records for a sub-program
exports.getSubProgramData = async (req, res) => {
    try {
        const sub = await SubProgram.findByPk(req.params.id, {
            include: [{ model: DatasetField, as: 'fields', order: [['sort_order', 'ASC']] }],
        });
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });

        const member = await findMember(req.user.id, req.user.phoneNumber, sub.program_id);
        if (!member) return res.status(403).json({ error: 'Not enrolled in this program' });

        const optOut = await SubProgramOptOut.findOne({
            where: { sub_program_id: sub.id, member_id: member.id },
        });
        if (optOut) return res.status(403).json({ error: 'You have opted out of this sub-program' });

        const [pre, post] = await Promise.all([
            ProgramDataRecord.findOne({ where: { sub_program_id: sub.id, member_id: member.id, phase: 'pre' } }),
            ProgramDataRecord.findOne({ where: { sub_program_id: sub.id, member_id: member.id, phase: 'post' } }),
        ]);
        res.json({
            sub_program: { id: sub.id, name: sub.name, description: sub.description, start_date: sub.start_date, end_date: sub.end_date },
            fields: sub.fields,
            pre: pre ? { ...pre.toJSON() } : null,
            post: post ? { ...post.toJSON() } : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/* ═══════════════════ USER: SUBMIT / EDIT POST DATA ══════════ */

// POST /api/programs/user/sub-programs/:id/data — create or replace post record
exports.submitPostData = async (req, res) => {
    const { data_json, notes } = req.body;
    if (!data_json || typeof data_json !== 'object')
        return res.status(400).json({ error: 'data_json object is required' });
    try {
        const sub = await SubProgram.findByPk(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Sub-program not found' });

        const member = await findMember(req.user.id, req.user.phoneNumber, sub.program_id);
        if (!member) return res.status(403).json({ error: 'Not enrolled in this program' });

        const optOut = await SubProgramOptOut.findOne({ where: { sub_program_id: sub.id, member_id: member.id } });
        if (optOut) return res.status(403).json({ error: 'You have opted out of this sub-program' });

        const existing = await ProgramDataRecord.findOne({
            where: { sub_program_id: sub.id, member_id: member.id, phase: 'post' },
        });
        if (existing) {
            if (existing.verification_status === 'verified')
                return res.status(403).json({ error: 'Post data has been verified and is now locked' });
            // Merge update
            const oldData = existing.data_json || {};
            const newData = { ...oldData, ...data_json };
            await existing.update({ data_json: newData, notes: notes ?? existing.notes });

            const changes = {};
            for (const k of Object.keys(data_json)) {
                if (String(oldData[k] ?? '') !== String(newData[k] ?? ''))
                    changes[k] = { old: oldData[k] ?? null, new: newData[k] };
            }
            if (Object.keys(changes).length > 0) {
                await ProgramAuditLog.create({
                    record_id: existing.id, sub_program_id: sub.id, program_id: sub.program_id,
                    member_id: member.id, phase: 'post', action: 'updated',
                    changed_fields: changes, changed_by: req.user.id, changed_by_role: 'user',
                });
            }
            return res.json({ message: 'Post data updated', record: existing });
        }

        // Create new post record
        const record = await ProgramDataRecord.create({
            sub_program_id: sub.id, member_id: member.id, phase: 'post',
            data_json, notes, created_by: req.user.id,
        });
        await ProgramAuditLog.create({
            record_id: record.id, sub_program_id: sub.id, program_id: sub.program_id,
            member_id: member.id, phase: 'post', action: 'created',
            changed_fields: data_json, changed_by: req.user.id, changed_by_role: 'user',
        });
        res.status(201).json({ message: 'Post data submitted', record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /api/programs/user/records/:id — partial update of a specific post field
exports.updatePostRecord = async (req, res) => {
    const { data_json } = req.body;
    try {
        const record = await ProgramDataRecord.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        if (record.phase !== 'post')
            return res.status(400).json({ error: 'Only Post records can be edited' });
        if (record.verification_status === 'verified')
            return res.status(403).json({ error: 'This record has been verified and is locked' });

        // Verify this record belongs to this user
        const patchPhoneVariants = req.user.phoneNumber
            ? [...new Set([req.user.phoneNumber, normalizePhone(req.user.phoneNumber)])].filter(Boolean)
            : [];
        const member = await ProgramMember.findOne({
            where: { id: record.member_id, [Op.or]: [
                { user_id: req.user.id },
                ...(patchPhoneVariants.length ? [{ phone: { [Op.in]: patchPhoneVariants } }] : []),
            ]},
        });
        if (!member) return res.status(403).json({ error: 'Access denied' });

        const oldData = record.data_json || {};
        const newData = { ...oldData, ...data_json };
        await record.update({ data_json: newData });

        const changes = {};
        for (const k of Object.keys(data_json)) {
            if (String(oldData[k] ?? '') !== String(newData[k] ?? ''))
                changes[k] = { old: oldData[k] ?? null, new: newData[k] };
        }
        if (Object.keys(changes).length > 0) {
            const sub = await SubProgram.findByPk(record.sub_program_id, { attributes: ['program_id'] });
            await ProgramAuditLog.create({
                record_id: record.id, sub_program_id: record.sub_program_id, program_id: sub?.program_id,
                member_id: member.id, phase: 'post', action: 'updated',
                changed_fields: changes, changed_by: req.user.id, changed_by_role: 'user',
            });
        }
        res.json({ record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
