const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

// Initial setup (POST) and post-onboarding self-update (PUT) — same controller, same logic
router.post('/personal', onboardingController.savePersonalInfo);
router.put('/personal', onboardingController.savePersonalInfo);     // MB-02

router.post('/medical', onboardingController.saveMedicalInfo);
router.put('/medical', onboardingController.saveMedicalInfo);       // MB-02

router.post('/lifestyle', onboardingController.saveLifestyleInfo);
router.put('/lifestyle', onboardingController.saveLifestyleInfo);   // MB-02

module.exports = router;
