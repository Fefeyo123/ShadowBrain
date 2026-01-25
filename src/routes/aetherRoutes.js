const express = require('express');
const router = express.Router();
const aetherController = require('../controllers/aetherController');

// GET /api/aether
router.get('/', aetherController.getForecast);

module.exports = router;
