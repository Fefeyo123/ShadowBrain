const express = require('express');
const router = express.Router();
const fitnessController = require('../controllers/fitnessController');

router.get('/overview', fitnessController.getOverview);

module.exports = router;
