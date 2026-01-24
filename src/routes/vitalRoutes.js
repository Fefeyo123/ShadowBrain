const express = require('express');
const router = express.Router();
const vitalController = require('../controllers/vitalController');

// New grouped endpoints
router.get('/overview', vitalController.getOverview); // Returns

// Legacy
router.get('/pulse', vitalController.getPulse);

module.exports = router;
