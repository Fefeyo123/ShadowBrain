const express = require('express');
const router = express.Router();
const nutritionController = require('../controllers/nutritionController');

router.get('/overview', nutritionController.getOverview);

module.exports = router;
