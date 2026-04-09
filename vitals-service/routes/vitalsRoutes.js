const express = require('express');
const router = express.Router();
const vitalsController = require('../controllers/vitalsController');
const deviceController = require('../controllers/deviceController');
const trendController = require('../controllers/trendController');
const authMiddleware = require('../authMiddleware');
const subscriptionMiddleware = require('../subscriptionMiddleware');

router.use(authMiddleware);

// Subscription paywall (Epic 8.8): Expired/Suspended users cannot write device data
router.post('/sync', subscriptionMiddleware, vitalsController.syncVitals);
router.post('/device', subscriptionMiddleware, deviceController.pairDevice);

// Read-only routes — always available regardless of subscription
router.get('/dashboard', vitalsController.getDashboard);
router.get('/device', deviceController.getConnectedDevices);
router.get('/trends', trendController.getVitalsTrends);
router.get('/export', trendController.exportHealthData);

module.exports = router;
