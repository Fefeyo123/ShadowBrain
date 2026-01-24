const express = require('express');
const router = express.Router();
const compassController = require('../controllers/compassController');

// Helper to handle all methods for Traccar compatibility
router.all('/', compassController.ingestLocation);

module.exports = router;
