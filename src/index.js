require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const { startPulseSensor } = require('./sensors/pulse');

const app = express();
const PORT = process.env.PORT || 3000;
const SHADOW_SECRET = process.env.SHADOW_SECRET;

// Setup Database
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(bodyParser.json({ limit: '50mb' }));

// --- DEBUG LOGGER ---
app.use((req, res, next) => {
    // Don't log the root health check to avoid spam
    if (req.path !== '/') {
        console.log(`[REQUEST] ${req.method} ${req.path}`);
    }
    next();
});

const vitalRouter = require('./sensors/vital');
const gpsRouter = require('./sensors/gps');

// --- ROUTES ---

// 1. Health Check (Render needs this to pass)
app.get('/', (req, res) => {
    res.send('Shadow Brain Stem: ONLINE');
});

// 2. Health Sensor Webhook (Vitals)
app.use('/api/health', vitalRouter);

// 3. GPS Sensor (Traccar)
app.use('/api/gps', gpsRouter);

// --- IGNITION ---

app.listen(PORT, () => {
    console.log(`[SYSTEM] Brain Stem Listening on Port ${PORT}`);
    
    console.log("--- SHADOW VITAL ONLINE ---");

    // Start Background Sensors
    startPulseSensor();
});
