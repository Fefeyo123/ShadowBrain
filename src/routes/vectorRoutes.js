const express = require('express');
const router = express.Router();
const vectorController = require('../controllers/vectorController');

// Helper to handle all methods for Traccar compatibility
router.get('/latest', vectorController.getLatestLocation);
router.get('/history', vectorController.getLocationHistory);
router.all('/', vectorController.ingestLocation);

module.exports = router;
