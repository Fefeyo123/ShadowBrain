const express = require('express');
const router = express.Router();
const cortexController = require('../controllers/cortexController');

router.post('/', cortexController.handleWebhook);

module.exports = router;
