const express = require('express');
const router = express.Router();
const compassController = require('../controllers/compassController');

// Helper to handle all methods for Traccar compatibility
router.get('/latest', compassController.getLatestLocation);
router.get('/history', compassController.getLocationHistory);
router.all('/', compassController.ingestLocation);

module.exports = router;
