const express = require('express');
const router = express.Router();
const vitalController = require('../controllers/vitalController');
// Import legacy sensor routes if needed, or refactor them.
// The original index.js mounted './sensors/vital' at '/api/vital'.
// We should check what src/sensors/vital.js exports. 
// Assuming it's a router, we might want to keep it or wrap it.
// For now, let's just use the controller for the specific /pulse endpoint validation found in routes.js
// AND mount the sensor specific routes if they are complex.

const vitalSensorRoutes = require('../sensors/vital');

router.get('/pulse', vitalController.getPulse);

// Mount the legacy sensor routes under / (so /api/vital/something becomes /api/v1/vital/something if we version it, 
// OR just keep it simple.
// The original app used: app.use('/api/vital', require('./sensors/vital'));
// So we should probably re-export that here or mount it in the main index.

module.exports = router;
