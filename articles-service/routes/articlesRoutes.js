const express = require('express');
const router = express.Router();
const articlesController = require('../controllers/articlesController');
const bookmarkController = require('../controllers/bookmarkController');
const authMiddleware = require('../authMiddleware');

router.use(authMiddleware);

router.get('/', articlesController.getArticles);         // 6.1 Browse (with ?page=, sorted by newest)
router.get('/search', articlesController.searchArticles); // 6.4 Keyword search
router.get('/bookmarks', bookmarkController.getBookmarks);
router.post('/:id/bookmark', bookmarkController.toggleBookmark);

module.exports = router;
