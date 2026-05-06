const express = require('express');
const router  = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const pCtrl  = require('../controllers/adminProgramController');
const dCtrl  = require('../controllers/adminDataController');

router.use(adminMiddleware);

/* ──────────────── Programs ──────────────── */
router.get   ('/programs',          pCtrl.getPrograms);
router.post  ('/programs',          pCtrl.createProgram);
router.get   ('/programs/:id',      pCtrl.getProgramDetail);
router.put   ('/programs/:id',      pCtrl.updateProgram);
router.delete('/programs/:id',      pCtrl.deleteProgram);

/* ──────────────── Sub-Programs ──────────── */
router.get   ('/programs/:id/sub-programs',     pCtrl.getSubPrograms);
router.post  ('/programs/:id/sub-programs',     pCtrl.createSubProgram);
router.get   ('/sub-programs/:id',              pCtrl.getSubProgramDetail);
router.put   ('/sub-programs/:id',              pCtrl.updateSubProgram);
router.delete('/sub-programs/:id',              pCtrl.deleteSubProgram);

/* ──────────────── Field Definitions ─────── */
router.get   ('/sub-programs/:id/fields',       pCtrl.getFields);
router.post  ('/sub-programs/:id/fields',       pCtrl.addField);
router.put   ('/sub-programs/:id/fields',       pCtrl.saveFields);   // bulk replace
router.put   ('/sub-programs/:id/fields/:fieldId', pCtrl.updateField);
router.delete('/sub-programs/:id/fields/:fieldId', pCtrl.deleteField);

/* ──────────────── Members ───────────────── */
router.get   ('/programs/:id/members',          dCtrl.getMembers);
router.post  ('/programs/:id/members',          dCtrl.addMember);
router.post  ('/programs/:id/members/link',     dCtrl.linkMembers);       // link by phone→user_id
router.put   ('/members/:memberId',             dCtrl.updateMember);
router.delete('/programs/:id/members/:memberId', dCtrl.removeMember);

/* ──────────────── Member Data ───────────── */
router.get   ('/members/:memberId',             dCtrl.getMemberDetail);
router.get   ('/members/:memberId/data',        dCtrl.getMemberData);

/* ──────────────── Sub-program all-members view ── */
router.get   ('/sub-programs/:subId/all-data',  dCtrl.getSubProgramAllMembersData);

/* ──────────────── Records ───────────────── */
router.get   ('/records',                       dCtrl.getRecords);
router.post  ('/records',                       dCtrl.createRecord);
router.put   ('/records/:id',                   dCtrl.updateRecord);
router.put   ('/records/:id/verify',            dCtrl.verifyRecord);
router.delete('/records/:id',                   dCtrl.deleteRecord);

/* ──────────────── User-level lookups (for admin user detail page) ── */
router.get   ('/users/:userId/programs',        dCtrl.getUserPrograms);
router.get   ('/users/:userId/program-audit',   dCtrl.getUserProgramAudit);

/* ──────────────── Audit ─────────────────── */
router.get   ('/audit',                         dCtrl.getAuditLogs);

/* ──────────────── Bulk Import ───────────── */
router.post  ('/import/members',                dCtrl.importMembers);
router.post  ('/import/records',                dCtrl.importRecords);

module.exports = router;
