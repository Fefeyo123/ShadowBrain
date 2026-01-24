const supabase = require('../config/supabase');

exports.ingestLocation = async (req, res) => {
    try {
        // 1. Data Extraction (Query or Body)
        let data = Object.keys(req.query).length > 0 ? req.query : req.body;
        
        // SUPPORT: Nested JSON format (Traccar Client specific?)
        // Payload: { location: { coords: { latitude, longitude, ... }, batteryLevel: 0.95, extras: {} }, ... }
        if (data.location && data.location.coords) {
            const coords = data.location.coords;
            // Traccar iOS often puts 'batteryLevel' (0.0-1.0) in the root of 'location' object, not 'coords'
            const rawBatt = data.location.batteryLevel 
                         || data.batteryLevel 
                         || (data.location.extras ? data.location.extras.batteryLevel : 0);

            data = {
                lat: coords.latitude,
                lon: coords.longitude,
                speed: coords.speed,
                altitude: coords.altitude,
                accuracy: coords.accuracy,
                batt: (rawBatt * 100) || 0, // Convert 0.55 -> 55% if needed, or keep as is? specialized Traccar is usually 0-100.
                // Wait, iOS native API is 0.0-1.0. Traccar usually sends 0-100?
                // Let's assume if < 1 it's a decimal.
                id: data.id || 'iPhone_Manual_Sync' 
            };
            
            // Auto-fix decimal battery
            if (data.batt > 0 && data.batt <= 1) data.batt = data.batt * 100;
        }

        // 2. Validation
        if (!data.lat || !data.lon) {
            console.warn(`[COMPASS] Invalid Payload. Data received:`, JSON.stringify(req.body));
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

        console.log(`⊙ [COMPASS] Location stored: ${data.lat}, ${data.lon} (Dev: ${deviceId})`);
        res.status(200).send('OK');

    } catch (err) {
        console.error('[COMPASS ERROR]', err.message);
        res.status(500).send('Error');
    }
};
