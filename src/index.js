const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: envPath });

console.log('[DEBUG] Loading .env from:', envPath);
console.log('[DEBUG] Loaded PORT:', process.env.PORT);

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Services
const { startPulseSensor } = require('./services/pulseService');
const { startSynapseSensor } = require('./services/synapseService');
const { startAetherSensor } = require('./services/aetherService');
const { startCortexSensor } = require('./services/screenTimeService');

// Routes
const mainRoutes = require('./routes'); // ./routes/index.js

// --- CONSOLE INTERCEPTION ---
global.logBuffer = [];
const originalLog = console.log;
console.log = function(...args) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    
    // Store in buffer (Max 50)
    global.logBuffer.unshift({ timestamp, message });
    if (global.logBuffer.length > 50) global.logBuffer.pop();

    // Call original
    originalLog.apply(console, args);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Security Middleware (Require SHADOW_KEY)
app.use('/api', require('./middleware/auth'));

// Ingest Routes (Vector & Vital & Cortex)
app.use('/api/vector', require('./routes/vectorRoutes'));
app.use('/api/vital', require('./routes/ingestRoutes'));
app.use('/api/cortex', require('./routes/cortexRoutes'));

// Main API
app.use('/api', mainRoutes);

// Catch-all 404
app.use((req, res, next) => {
    res.status(404).send('Not Found by ShadowBrain');
});

// --- IGNITION ---

app.listen(PORT, () => {
    console.log(`[SYSTEM] Brain Stem Listening on Port ${PORT}`);
    
    console.log("♡♡♡ SHADOW VITAL ONLINE ♡♡♡");
    console.log("⊙⊙⊙ SHADOW VECTOR ONLINE ⊙⊙⊙");
    console.log("⌁⌁⌁ SHADOW CORTEX ONLINE ⌁⌁⌁");

    startPulseSensor();
    startSynapseSensor();
    startAetherSensor();
    startCortexSensor();
});
