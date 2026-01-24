const express = require('express');
const router = express.Router();
const vitalController = require('../controllers/vitalController');

// Helper to handle health ingest
router.post('/', vitalController.ingestMetrics);

module.exports = router;
