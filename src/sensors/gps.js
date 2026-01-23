const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// TRACCAR / OSMAND PROTOCOL
// Endpoint: POST /api/gps
// Traccar Client sends: ?id=deviceid&lat=50.0&lon=4.0&timestamp=17000000&speed=0...
// Or via Body in JSON mode. We support Query Parameters (OsmAnd standard).

router.all('/', async (req, res) => {
    try {
        // 1. Data Extraction (Query or Body)
        const data = Object.keys(req.query).length > 0 ? req.query : req.body;
        
        // 2. Validation
        if (!data.lat || !data.lon) {
            console.warn(`[GPS] Invalid Payload. Data received:`, JSON.stringify(data));
            return res.status(400).send('Missing lat/lon');
        }

        // 3. Security Check (Optional: Traccar ID)
        // Ideally Traccar Client supports Headers, but often it doesn't.
        // We rely on the obscure URL + Device ID whitelist if needed.
        // For now: Log everything.

        const deviceId = data.id || 'unknown_device';
        const timestamp = data.timestamp ? new Date(parseInt(data.timestamp) * 1000).toISOString() : new Date().toISOString();

        const locationEvent = {
            source: `traccar_${deviceId}`,
            event_type: 'location',
            timestamp: timestamp,
            data: {
                lat: parseFloat(data.lat),
                lon: parseFloat(data.lon),
                speed: parseFloat(data.speed || 0),
                altitude: parseFloat(data.altitude || 0),
                battery: parseFloat(data.batt || 0),
                accuracy: parseFloat(data.accuracy || 0)
            }
        };

        const { error } = await supabase
            .from('shadow_events')
            .insert(locationEvent);

        if (error) throw error;

        console.log(`[GPS] Location stored: ${data.lat}, ${data.lon} (Dev: ${deviceId})`);
        res.status(200).send('OK');

    } catch (err) {
        console.error('[GPT ERROR]', err.message);
        res.status(500).send('Error');
    }
});

module.exports = router;
