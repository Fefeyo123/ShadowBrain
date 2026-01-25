const express = require('express');
const router = express.Router();
const synapseController = require('../controllers/synapseController');

router.get('/status', synapseController.getStatus);
router.get('/history', synapseController.getHistory);
router.get('/stats', synapseController.getStats);
router.get('/achievements', synapseController.getAchievements);

module.exports = router;
