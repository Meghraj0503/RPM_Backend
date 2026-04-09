const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/verify-otp', authController.verifyOtp);          // 1.1 OTP Login
router.post('/biometric/enable', authController.enableBiometric); // 1.2 Enable biometric for returning user
router.post('/biometric/verify', authController.verifyBiometric); // 1.2 Verify biometric token from device

module.exports = router;
