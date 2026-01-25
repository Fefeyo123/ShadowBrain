const express = require('express');
const router = express.Router();

const systemRoutes = require('./systemRoutes');
const streamRoutes = require('./streamRoutes');
const vitalRoutes = require('./vitalRoutes');
const pulseRoutes = require('./pulseRoutes');
const authRoutes = require('./authRoutes');

// New App Routes
const sleepRoutes = require('./sleepRoutes');
const carbonRoutes = require('./carbonRoutes');
const fitnessRoutes = require('./fitnessRoutes');
const authController = require('../controllers/authController');

// Version 1 API
router.use('/v1/aether', require('./aetherRoutes'));
router.use('/v1/synapse', require('./synapseRoutes'));
router.use('/v1/pulse', pulseRoutes); // Spotify listening data

router.use('/v1', systemRoutes);
router.use('/v1/stream', streamRoutes);
router.use('/v1/vital', vitalRoutes); // Heart/Report
router.use('/v1/somnus', sleepRoutes); // Sleep
router.use('/v1/carbon', carbonRoutes); // Nutrition/Energy
router.use('/v1/kinetic', fitnessRoutes); // Fitness/Activity

router.use('/v1', vitalRoutes); // Legacy fallback (e.g. /pulse)
router.use('/v1/storage', authRoutes);
router.use('/auth/passkey', require('./passkeyRoutes'));
router.post('/auth/login', authController.login);

module.exports = router;
