const express = require('express');
const router = express.Router();
const atmosphereController = require('../controllers/atmosphereController');

// GET /api/atmosphere
router.get('/', atmosphereController.getForecast);

module.exports = router;
