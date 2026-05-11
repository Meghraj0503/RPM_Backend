const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const trainingController = require('../controllers/trainingController');

router.use(authMiddleware);

router.get('/home',                               trainingController.getHome);
router.get('/categories',                         trainingController.getCategories);
router.get('/modules',                            trainingController.getModules);
router.get('/modules/:id',                        trainingController.getModuleById);
router.get('/modules/:id/progress',               trainingController.getModuleProgress);
router.get('/progress',                           trainingController.getProgress);
router.post('/sessions/:sessionId/progress',      trainingController.updateSessionProgress);
router.post('/sessions/:sessionId/complete',      trainingController.markSessionComplete);  // backward compat

module.exports = router;
