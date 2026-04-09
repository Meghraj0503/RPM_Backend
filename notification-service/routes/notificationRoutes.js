const express = require('express');
const router = express.Router();
const notifController = require('../controllers/notificationController');
const authMiddleware = require('../authMiddleware');

router.post('/trigger', notifController.triggerNotification);

router.use(authMiddleware);
router.get('/inbox', notifController.getUserInbox);

router.post('/admin/templates', notifController.upsertTemplate);
router.delete('/admin/templates/:code', notifController.deleteTemplate);

module.exports = router;
