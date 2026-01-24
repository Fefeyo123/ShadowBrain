const express = require('express');
const router = express.Router();
const sleepController = require('../controllers/sleepController');

router.get('/overview', sleepController.getOverview);
router.get('/history', sleepController.getHistory);

module.exports = router;
