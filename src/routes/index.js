const express = require('express');
const router = express.Router();

const systemRoutes = require('./systemRoutes');
const streamRoutes = require('./streamRoutes');
const vitalRoutes = require('./vitalRoutes');
const pulseRoutes = require('./pulseRoutes');
const authRoutes = require('./authRoutes');

// New App Routes
const sleepRoutes = require('./sleepRoutes');
const nutritionRoutes = require('./nutritionRoutes');
const fitnessRoutes = require('./fitnessRoutes');
const authController = require('../controllers/authController');

// Version 1 API
router.use('/v1/atmosphere', require('./atmosphereRoutes'));
router.use('/v1/limbic', require('./limbicRoutes'));
router.use('/v1/pulse', pulseRoutes); // Spotify listening data

router.use('/v1', systemRoutes);
router.use('/v1/stream', streamRoutes);
router.use('/v1/vital', vitalRoutes); // Heart/Report
router.use('/v1/somnus', sleepRoutes); // Sleep
router.use('/v1/biomass', nutritionRoutes); // Nutrition/Energy
router.use('/v1/kinetic', fitnessRoutes); // Fitness/Activity

router.use('/v1', vitalRoutes); // Legacy fallback (e.g. /pulse)
router.use('/v1/storage', authRoutes);
router.use('/auth/passkey', require('./passkeyRoutes'));
router.post('/auth/login', authController.login);

module.exports = router;
