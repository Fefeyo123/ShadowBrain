const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: envPath });

console.log('[DEBUG] Loading .env from:', envPath);
console.log('[DEBUG] Loaded PORT:', process.env.PORT);
const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const { startPulseSensor } = require('./sensors/pulse');
const { startLimbicSensor } = require('./sensors/limbic');

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

const cors = require('cors'); // Enable CORS for Frontend access
const apiRoutes = require('./api/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));
app.use(bodyParser.json());

// API Routes
app.use('/api/gps', require('./sensors/compass'));
app.use('/api/vital', require('./sensors/vital'));
app.use('/api', apiRoutes);

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
