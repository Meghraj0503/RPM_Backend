const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/extendedProfileController');
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

// MB-11: Extended demographic fields
router.put('/extended', ctrl.updateExtendedProfile);

// MB-12: Body composition
router.get('/body-composition', ctrl.getBodyComposition);
router.put('/body-composition', ctrl.upsertBodyComposition);

// MB-13: Blood tests
router.get('/blood-tests', ctrl.getBloodTests);
router.post('/blood-tests', ctrl.addBloodTest);

// MB-14: Daily quote
router.get('/daily-quote', ctrl.getDailyQuote);

// MB-15: Wellness tasks
router.get('/tasks', ctrl.getDailyTasks);
router.post('/tasks/complete', ctrl.completeTask);
router.post('/tasks/uncomplete', ctrl.uncompleteTask);

// MB-16: Announcements
router.get('/announcements', ctrl.getAnnouncements);
router.get('/announcements/:id', ctrl.getAnnouncementDetail);

module.exports = router;
