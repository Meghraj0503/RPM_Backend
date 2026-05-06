const express = require('express');
const qController = require('../controllers/questionnaireController');
const authMiddleware = require('../authMiddleware');
const router = express.Router();
router.use(authMiddleware);

router.get('/', qController.getQuestionnaires);
router.get('/summary', qController.getQuestionnaireSummary);          // MB-17
router.get('/completed', qController.getCompletedSubmissions);        // User completed list
router.post('/:id/submit', qController.submitQuestionnaire);
// router.get('/:id/result', qController.getQuestionnaireResult);        // MB-04
router.get('/:id/submission', qController.getSubmissionDetail);       // Full detail with answers

// Dynamic CMS Admin Routes
router.post('/admin/questions', qController.addQuestion);
router.put('/admin/questions/:id', qController.updateQuestion);
router.delete('/admin/questions/:id', qController.deleteQuestion);

module.exports = router;
