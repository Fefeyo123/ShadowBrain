const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

// --- THE LIMBIC SENSOR ---
// Polls Valve's API (Steam) to see if you are playing games.
// "Limbic" because gaming stimulates the reward system (Dopamine).

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

let lastGame = null;

async function checkLimbic() {
    const STEAM_KEY = process.env.STEAM_API_KEY;
    const STEAM_ID = process.env.STEAM_ID;

    if (!STEAM_KEY || !STEAM_ID) {
        console.warn('[LIMBIC] Missing API Key or Steam ID in .env');
        return;
    }

    try {
        const url = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_KEY}&steamids=${STEAM_ID}`;
        const response = await axios.get(url);
        
        const players = response.data?.response?.players;
        if (!players || players.length === 0) return;

        const player = players[0];
        const currentGame = player.gameextrainfo || null; // "Counter-Strike 2" or null

        // Deduplication Logic
        if (currentGame === lastGame) return;

        // STATUS CHANGED
        const timestamp = new Date().toISOString();
        let eventType = 'game_activity';
        let status = '';
        let gameName = '';

        if (currentGame) {
            // STARTED PLAYING
            status = 'playing';
            gameName = currentGame;
            console.log(`▵ [LIMBIC] ${new Date().toLocaleTimeString()} | >> Started Playing: ${gameName}`);
        } else {
            // STOPPED PLAYING
            status = 'stopped';
            gameName = lastGame; // The game that just finished
            console.log(`▵ [LIMBIC] ${new Date().toLocaleTimeString()} | >> Stopped Playing: ${gameName}`);
        }

        lastGame = currentGame;

        // Log to DB
        const { error } = await supabase
            .from('shadow_events')
            .insert({
                source: 'steam', // Provider is still Steam
                event_type: eventType,
                timestamp: timestamp,
                data: {
                    status: status,
                    game: gameName,
                    steam_id: STEAM_ID
                }
            });

        if (error) console.error('[LIMBIC] DB Error:', error.message);

    } catch (err) {
        console.error('[LIMBIC] API Error:', err.message);
    }
}

function startLimbicSensor() {
    console.log("▵▵▵ SHADOW LIMBIC ONLINE ▵▵▵");
    checkLimbic();
    // Poll every 60 seconds
    setInterval(checkLimbic, 60000);
}

module.exports = { startLimbicSensor };
