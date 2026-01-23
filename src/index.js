const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: envPath });

console.log('[DEBUG] Loading .env from:', envPath);
console.log('[DEBUG] Loaded PORT:', process.env.PORT);

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Sensors
const { startPulseSensor } = require('./sensors/pulse');
const { startLimbicSensor } = require('./sensors/limbic');

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

// Sensor Inputs (Legacy/Direct)
app.use('/api/gps', require('./sensors/compass'));
app.use('/api/vital', require('./sensors/vital'));

// Main API
app.use('/api', mainRoutes);

// --- IGNITION ---

app.listen(PORT, () => {
    console.log(`[SYSTEM] Brain Stem Listening on Port ${PORT}`);
    
    console.log("♡♡♡ SHADOW VITAL ONLINE ♡♡♡");
    console.log("⊙⊙⊙ SHADOW COMPASS ONLINE ⊙⊙⊙");
    console.log("⌁⌁⌁ SHADOW CORTEX ONLINE ⌁⌁⌁");

    // Start Background Sensors
    startPulseSensor();
    startLimbicSensor();
});
