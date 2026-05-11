const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const adminController = require('../controllers/adminController');
const adminMiddleware = require('../adminMiddleware');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: uploadDir,
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
router.delete('/users/:id', adminController.deleteUserProfile);          // MA-01
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
router.get('/questionnaires/:id/submissions', adminController.getQuestionnaireSubmissions);
router.get('/questionnaires/submissions/:submissionId', adminController.getSubmissionDetail);

// ==================== CONTENT MANAGEMENT (Quotes, Tasks, Announcements, Education) ====================
const contentController = require('../controllers/contentController');

// MA-05: Quotes
router.get('/quotes', contentController.getQuotes);
router.post('/quotes', contentController.createQuote);
router.put('/quotes/:id', contentController.updateQuote);
router.delete('/quotes/:id', contentController.deleteQuote);

// MA-04: Wellness Tasks
router.get('/tasks', contentController.getTasks);
router.post('/tasks', contentController.createTask);
router.put('/tasks/:id', contentController.updateTask);
router.delete('/tasks/:id', contentController.deleteTask);

// MA-03: Announcements
router.get('/announcements', contentController.getAnnouncements);
router.post('/announcements', contentController.createAnnouncement);
router.put('/announcements/:id', contentController.updateAnnouncement);
router.delete('/announcements/:id', contentController.deleteAnnouncement);

// MB-18/MB-19: Multi-media Education Content
router.get('/education-contents', contentController.getEducationContents);
router.post('/education-contents', contentController.createEducationContent);
router.put('/education-contents/:id', contentController.updateEducationContent);
router.delete('/education-contents/:id', contentController.deleteEducationContent);
router.put('/education-contents/:id/publish', contentController.publishEducationContent);
router.put('/education-contents/:id/unpublish', contentController.unpublishEducationContent);

// MB-22: Data deletion management
router.get('/data-deletion-requests', contentController.getPendingDeletionRequests);
router.post('/data-deletion-requests/:user_id/execute', contentController.executeDataDeletion);

// ==================== TRAINING MODULE BUILDER ====================
const trainingController = require('../controllers/trainingController');

router.get('/training/categories', trainingController.getCategories);
router.post('/training/categories', trainingController.createCategory);
router.get('/training/modules', trainingController.getModules);
router.post('/training/modules', trainingController.createModule);
router.get('/training/modules/:id', trainingController.getModuleById);
router.put('/training/modules/:id', trainingController.updateModule);
router.put('/training/modules/:id/publish', trainingController.togglePublish);
router.delete('/training/modules/:id', trainingController.deleteModule);
router.get('/training/users/:userId/progress', trainingController.getUserTrainingProgress);
router.get('/training/modules/:id/users-progress', trainingController.getModuleUsersProgress);

module.exports = router;

