const express = require('express');
const router = express.Router();
const carbonController = require('../controllers/carbonController');

router.get('/overview', carbonController.getOverview);

module.exports = router;
