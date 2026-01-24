const express = require('express');
const router = express.Router();
const pulseController = require('../controllers/pulseController');

/**
 * Pulse Routes
 * The rhythm sensor - Spotify listening data
 */

// GET /v1/pulse/status - Current playing or last played track
router.get('/status', pulseController.getStatus);

// GET /v1/pulse/history - Recent track play events
router.get('/history', pulseController.getHistory);

// GET /v1/pulse/stats - Aggregated listening statistics
router.get('/stats', pulseController.getStats);

module.exports = router;
