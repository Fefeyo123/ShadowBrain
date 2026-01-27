const axios = require('axios');
const supabase = require('../config/supabase');

const API_KEY = process.env.CORTEX_API_KEY;
const BASE_URL = process.env.CORTEX_BASE_URL;
const HANDLE = process.env.CORTEX_HANDLE;

// In-memory cache for latest data
let latestScreenTimeData = {
    totalScreenTime: 0,
    lastSeen: null,
    dayOfWeek: null,
    timestamp: null
};

/**
 * Fetch today's screen time from API
 */
async function fetchScreenTimeToday() {
    try {
        const url = `${BASE_URL}/getScreenTimeToday`;
        const response = await axios.get(url, {
            params: { handle: HANDLE },
            headers: { 'x-api-key': API_KEY }
        });

        if (response.data && response.data.success) {
            const data = response.data.data;
            latestScreenTimeData = {
                totalScreenTime: data.totalScreenTime, // minutes
                lastSeen: data.lastSeen, // unix timestamp
                dayOfWeek: data.dayOfWeek,
                timestamp: new Date().toISOString()
            };
            console.log(`[CORTEX] Screen Time Updated: ${latestScreenTimeData.totalScreenTime} mins`);
            
            // Optional: Save snapshot to DB if needed, but for now we keep it light.
            // If we wanted history, we'd insert into shadow_events here.
        } else {
            console.warn('[CORTEX] API Warning:', response.data);
        }
    } catch (error) {
        console.error('[CORTEX] Failed to fetch screen time:', error.message);
    }
}

/**
 * Start the Cortex/ScreenTime sensor loop
 */
function startCortexSensor() {
    console.log('[SYSTEM] Starting Cortex (ScreenTime) Sensor...');
    
    // Initial fetch
    fetchScreenTimeToday();

    // Loop every 15 minutes (900000 ms)
    setInterval(fetchScreenTimeToday, 900000);
}

/**
 * Get the latest cached data
 */
function getCortexData() {
    return latestScreenTimeData;
}

module.exports = {
    startCortexSensor,
    getCortexData
};
