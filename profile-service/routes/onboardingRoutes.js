const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

router.post('/personal', onboardingController.savePersonalInfo);
router.post('/medical', onboardingController.saveMedicalInfo);
router.post('/lifestyle', onboardingController.saveLifestyleInfo);

module.exports = router;
