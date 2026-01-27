const express = require('express');
const router = express.Router();
const cortexController = require('../controllers/cortexController');

router.get('/', cortexController.getCortexData);

module.exports = router;
