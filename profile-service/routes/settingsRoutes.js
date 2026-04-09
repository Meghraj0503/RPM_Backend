const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);

router.post('/consent', settingsController.provideConsent);
router.post('/delete-account', settingsController.requestDeletion);

router.get('/full', settingsController.getFullProfile);

module.exports = router;
