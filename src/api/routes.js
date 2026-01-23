const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- ENDPOINTS ---

/**
 * GET /v1/status
 * Returns system health.
 */
router.get('/v1/status', (req, res) => {
    res.json({
        system: "ShadowBrain",
        status: "ONLINE",
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /v1/console
 * Returns the last 50 intercepted console logs.
 */
router.get('/v1/console', (req, res) => {
    res.json({
        success: true,
        logs: global.logBuffer || []
    });
});

/**
 * GET /v1/stream
 * Fetches the last 50 events from shadow_events.
 */
router.get('/v1/stream', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('shadow_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error('[API] Stream Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /v1/pulse
 * Returns the latest computed vitals (Mocked for now, or fetch from DB if you have a table)
 * Ideally, this should fetch from a 'shadow_state' or similar table/view.
 * For now, we'll return a mock of what the Pulse sensor might be outputting.
 */
router.get('/v1/pulse', (req, res) => {
    // In a real implementation, this might read from a cached state object 
    // updated by the startPulseSensor() loop.
    res.json({
        bpm: 72, // Placeholder
        focus_score: 85, // Placeholder
        valence: "Neutral",
        status: "Nominal"
    });
});

module.exports = router;
