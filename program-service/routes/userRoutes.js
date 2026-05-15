const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const uCtrl  = require('../controllers/userProgramController');

router.use(authMiddleware);

/* ──────────────── Dashboard ─────────────── */
router.get ('/dashboard',                      uCtrl.getMyDashboard);

/* ──────────────── Programs ──────────────── */
router.get ('/programs',                       uCtrl.getMyPrograms);
router.get ('/programs/:id/report',            uCtrl.getProgramReport);
router.get ('/programs/:id',                   uCtrl.getProgramDetail);

/* ──────────────── Opt-Out ───────────────── */
router.post('/sub-programs/:id/opt-out',       uCtrl.optOut);

/* ──────────────── Data ──────────────────── */
router.get ('/sub-programs/:id/data',          uCtrl.getSubProgramData);
router.post('/sub-programs/:id/data',          uCtrl.submitPostData);
router.patch('/records/:id',                   uCtrl.updatePostRecord);

module.exports = router;
