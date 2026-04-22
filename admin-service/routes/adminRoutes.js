const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminController = require('../controllers/adminController');
const adminMiddleware = require('../adminMiddleware');

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max length (support for videos)
});

// 8.1 Login (legacy phone-based)
router.post('/login', adminController.login);

router.use(adminMiddleware);

// Upload Endpoint
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// 8.2 Dashboard
router.get('/dashboard', adminController.getCohortDashboard);

// 8.3 Educational Content Management
router.get('/articles', adminController.getArticles);
router.get('/articles/:id', adminController.getArticle);
router.post('/articles', adminController.createArticle);
router.put('/articles/:id', adminController.updateArticle);
router.delete('/articles/:id', adminController.deleteArticle);
router.put('/articles/:id/publish', adminController.publishArticle);
router.put('/articles/:id/unpublish', adminController.unpublishArticle);

// 8.4 User Management (search + filters: activity_status, q_status, enrolled_after/before)
router.get('/users', adminController.getUsers);

// 8.6 At Risk
router.get('/at-risk', adminController.getAtRiskUsers);

// 8.5 Detail View (?days=7 or ?days=30)
router.get('/users/:id', adminController.getUserDetail);

// 8.7 Data Export
router.post('/export', adminController.exportDataset);
router.get('/export/history', adminController.getExportHistory);


// 8.8 Subscription Management
router.post('/users/:id/subscription', adminController.assignSubscription);
router.put('/users/:id/subscription/change', adminController.changeProgram);
router.put('/users/:id/subscription/suspend', adminController.suspendSubscription);
router.put('/users/:id/subscription/reactivate', adminController.reactivateSubscription);
router.get('/users/:id/enrollment-history', adminController.getEnrollmentHistory);

// 8.9 Dashboard Config
router.get('/dashboard/config', adminController.getDashboardConfig);
router.put('/dashboard/config', adminController.saveDashboardConfig);

// 8.10 User Profile Management
router.post('/users', adminController.createUserProfile);
router.put('/users/:id', adminController.updateUserProfile);
router.put('/users/:id/status', adminController.changeUserStatus);
router.put('/users/:id/medical-profile', adminController.updateUserMedicalProfile);
router.put('/users/:id/lifestyle', adminController.updateUserLifestyle);
router.get('/users/:id/audit', adminController.getUserAuditTrail);
// Device Management
router.get('/users/:id/devices', adminController.getUserDevices);
router.post('/users/:id/devices', adminController.assignDevice);
router.delete('/users/:id/devices/:deviceId', adminController.removeDevice);

// ==================== QUESTIONNAIRE BUILDER ====================
router.get('/questionnaires', adminController.getQuestionnaires);
router.post('/questionnaires', adminController.createQuestionnaire);
router.get('/questionnaires/:id', adminController.getQuestionnaireDetail);
router.put('/questionnaires/:id', adminController.updateQuestionnaire);
router.delete('/questionnaires/:id', adminController.deleteQuestionnaire);

router.get('/questionnaires/:id/target-users', adminController.getQuestionnaireTargetUsers);
router.post('/questionnaires/:id/assign', adminController.assignQuestionnaire);

module.exports = router;

