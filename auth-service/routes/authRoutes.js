const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/verify-otp', authController.verifyOtp);              // 1.1 OTP Login
router.post('/refresh', authController.refreshToken);              // GQ-05 Refresh access token
router.post('/logout', authController.logout);                     // GQ-05 Revoke refresh token
router.post('/biometric/enable', authController.enableBiometric);  // 1.2 Enable biometric
router.post('/biometric/verify', authController.verifyBiometric);  // 1.2 Verify biometric token

module.exports = router;
