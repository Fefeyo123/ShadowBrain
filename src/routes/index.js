const express = require('express');
const router = express.Router();

const systemRoutes = require('./systemRoutes');
const streamRoutes = require('./streamRoutes');
const vitalRoutes = require('./vitalRoutes');
const authRoutes = require('./authRoutes');
const authController = require('../controllers/authController');

// Version 1 API
router.use('/v1', systemRoutes); // /status, /console
router.use('/v1/stream', streamRoutes);
router.use('/v1/pulse', vitalRoutes); // Note: The original was /v1/pulse directly. 
// Wait, the original routes.js had router.get('/v1/pulse', ...).
// So if I mount vitalRoutes at /v1/pulse, and vitalRoutes has router.get('/', ...), that matches.
// But vitalRoutes.js above had router.get('/pulse', ...). 
// Let's fix vitalRoutes.js to be cleaner or adjust mounting.

// Let's adjust mounting to match original API structure exactly for compatibility.
// Original:
// /v1/status
// /v1/console
// /v1/stream
// /v1/pulse
// /v1/storage/credentials...

// System Routes handles /status and /console. 
// We can mount systemRoutes at /v1 or mount individual paths.
// Let's mount at /v1.

// Stream Routes handles /v1/stream.
// Mount at /v1/stream.

// Vital Routes handles /v1/pulse.
// Mount at /v1.

// Auth Routes handles /v1/storage/credentials.
// Mount at /v1/storage.

router.use('/v1', systemRoutes);
router.use('/v1/stream', streamRoutes);
router.use('/v1', vitalRoutes); // vitalRoutes has /pulse
router.use('/v1/storage', authRoutes);
router.use('/auth/passkey', require('./passkeyRoutes'));
router.post('/auth/login', authController.login);

module.exports = router;
