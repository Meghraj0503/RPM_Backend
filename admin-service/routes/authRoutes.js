const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../adminMiddleware');

// Public - no JWT required
router.post('/login', authController.adminLogin);

// Protected - super_admin only
router.post('/register', authMiddleware, authController.adminRegister);
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
