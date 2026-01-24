const express = require('express');
const router = express.Router();
const limbicController = require('../controllers/limbicController');

router.get('/status', limbicController.getStatus);
router.get('/history', limbicController.getHistory);
router.get('/stats', limbicController.getStats);
router.get('/achievements', limbicController.getAchievements);

module.exports = router;
