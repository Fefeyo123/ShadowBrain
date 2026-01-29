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
                ...latestScreenTimeData,
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
 * Fetch generic ActivityWatch stats from Supabase
 */
async function fetchActivityWatchStats() {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Query view_activity_log for today's records
        // We want all records where timestamp >= today 00:00:00 UTC
        const { data, error } = await supabase
            .from('view_activity_log')
            .select('*')
            .gte('timestamp', `${today}T00:00:00+00:00`)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        // Process Data
        const stats = {
            mac: { totalSeconds: 0, lastSeen: null, online: false, apps: {}, lastApp: null },
            pc: { totalSeconds: 0, lastSeen: null, online: false, apps: {}, lastApp: null }
        };

        const NOW = new Date();
        const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

        data.forEach(row => {
            let deviceKey = null;
            if (row.device_id === 'FeyeMacBookPro') deviceKey = 'mac';
            if (row.device_id === 'FeyeGamingPC') deviceKey = 'pc';

            if (deviceKey) {
                // Sum duration
                const duration = row.duration_seconds || 0;
                stats[deviceKey].totalSeconds += duration;

                // Track App Usage
                const app = row.app_name || 'Unknown';
                if (!stats[deviceKey].apps[app]) stats[deviceKey].apps[app] = 0;
                stats[deviceKey].apps[app] += duration;

                // Check last seen (first record is latest due to sort)
                if (!stats[deviceKey].lastSeen) {
                    stats[deviceKey].lastSeen = row.timestamp;
                    stats[deviceKey].lastApp = app; // Capture latest app
                    
                    const lastSeenDate = new Date(row.timestamp);
                    const diff = NOW - lastSeenDate;
                    if (diff < ONLINE_THRESHOLD_MS) {
                        stats[deviceKey].online = true;
                    }
                }
            }
        });

        // Helper to find top apps (Top 5)
        const getTopApps = (appMap) => {
            return Object.entries(appMap)
                .map(([name, duration]) => ({ name, duration }))
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 5);
        };

        // Update Cache (Merge with existing)
        latestScreenTimeData.mac = {
            totalMinutes: Math.floor(stats.mac.totalSeconds / 60),
            lastSeen: stats.mac.lastSeen,
            isOnline: stats.mac.online,
            topApps: getTopApps(stats.mac.apps),
            lastApp: stats.mac.lastApp
        };

        latestScreenTimeData.pc = {
            totalMinutes: Math.floor(stats.pc.totalSeconds / 60),
            lastSeen: stats.pc.lastSeen,
            isOnline: stats.pc.online,
            topApps: getTopApps(stats.pc.apps),
            lastApp: stats.pc.lastApp
        };
        
        console.log(`[CORTEX] Mac: ${latestScreenTimeData.mac.totalMinutes}m (Top: ${latestScreenTimeData.mac.topApp}), PC: ${latestScreenTimeData.pc.totalMinutes}m`);

    } catch (err) {
        console.error('[CORTEX] Failed to fetch ActivityWatch stats:', err.message);
    }
}

/**
 * Start the Cortex/ScreenTime sensor loop
 */
function startCortexSensor() {
    console.log('[SYSTEM] Starting Cortex (ScreenTime) Sensor...');
    
    // Initial fetch
    fetchScreenTimeToday();
    fetchActivityWatchStats();

    // Loop every 15 minutes (900000 ms)
    setInterval(() => {
        fetchScreenTimeToday();
        fetchActivityWatchStats();
    }, 900000);
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
