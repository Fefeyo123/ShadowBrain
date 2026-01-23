const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/credentials/:userId', authController.getCredentials);
router.post('/credentials', authController.saveCredential);
router.patch('/credentials/:credentialId', authController.updateCredentialCounter);

module.exports = router;
