const express = require('express');
const router = express.Router();
const passkeyController = require('../controllers/passkeyController');

router.post('/register', passkeyController.register);
router.post('/authenticate', passkeyController.authenticate);

module.exports = router;
