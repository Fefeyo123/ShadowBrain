const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

// --- THE LIMBIC SENSOR ---
// Polls Valve's API (Steam) to see if you are playing games.
// "Limbic" because gaming stimulates the reward system (Dopamine).

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const STEAM_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

let lastGame = null;

// ============================================
// STEAM API FETCH FUNCTIONS
// ============================================

/**
 * Fetch player's owned games with playtime data
 */
async function fetchOwnedGames() {
    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_KEY}&steamid=${STEAM_ID}&include_appinfo=true&format=json`;
    const response = await axios.get(url);
    return response.data?.response || { game_count: 0, games: [] };
}

/**
 * Fetch recently played games (last 2 weeks)
 */
async function fetchRecentlyPlayedGames() {
    const url = `http://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_KEY}&steamid=${STEAM_ID}&format=json`;
    const response = await axios.get(url);
    return response.data?.response || { total_count: 0, games: [] };
}

/**
 * Fetch player achievements for a specific game
 */
async function fetchPlayerAchievements(appId) {
    try {
        const url = `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_KEY}&steamid=${STEAM_ID}`;
        const response = await axios.get(url);
        return response.data?.playerstats || null;
    } catch (err) {
        // Many games don't support achievements, silently return null
        return null;
    }
}

/**
 * Fetch player's current status (currently playing)
 */
async function fetchPlayerSummary() {
    const url = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_KEY}&steamids=${STEAM_ID}`;
    const response = await axios.get(url);
    const players = response.data?.response?.players;
    return players?.[0] || null;
}

// ============================================
// AGGREGATED DATA FUNCTIONS
// ============================================

/**
 * Get comprehensive stats (library, playtime, top games)
 */
async function getStats() {
    const [owned, recent, player] = await Promise.all([
        fetchOwnedGames(),
        fetchRecentlyPlayedGames(),
        fetchPlayerSummary()
    ]);

    // Calculate total playtime (in hours)
    const totalMinutes = owned.games?.reduce((sum, g) => sum + (g.playtime_forever || 0), 0) || 0;
    const totalHours = Math.round(totalMinutes / 60);

    // Calculate 2 week playtime (in hours)
    const weeklyMinutes = recent.games?.reduce((sum, g) => sum + (g.playtime_2weeks || 0), 0) || 0;
    const weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10; // 1 decimal

    // Top 5 games by all-time playtime
    const topGames = (owned.games || [])
        .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
        .slice(0, 5)
        .map(g => ({
            appid: g.appid,
            name: g.name,
            hours: Math.round(g.playtime_forever / 60),
            icon_url: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
            logo_url: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_logo_url}.jpg`
        }));

    // Recent games with 2-week playtime
    const recentGames = (recent.games || []).map(g => ({
        appid: g.appid,
        name: g.name,
        hours_2weeks: Math.round((g.playtime_2weeks / 60) * 10) / 10,
        hours_total: Math.round(g.playtime_forever / 60),
        icon_url: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
    }));

    // Current status
    const isPlaying = !!player?.gameextrainfo;
    const currentGame = player?.gameextrainfo || null;

    return {
        library_size: owned.game_count || 0,
        total_hours: totalHours,
        weekly_hours: weeklyHours,
        games_played_2weeks: recent.total_count || 0,
        top_games: topGames,
        recent_games: recentGames,
        is_playing: isPlaying,
        current_game: currentGame,
        steam_id: STEAM_ID
    };
}

/**
 * Get achievements from recently played games
 */
async function getRecentAchievements() {
    const recent = await fetchRecentlyPlayedGames();
    const games = recent.games || [];

    const achievements = [];

    // Fetch achievements for top 3 recently played games (to limit API calls)
    for (const game of games.slice(0, 3)) {
        const data = await fetchPlayerAchievements(game.appid);
        if (data?.achievements) {
            // Get recently unlocked achievements (achieved = 1) sorted by unlock time
            const unlocked = data.achievements
                .filter(a => a.achieved === 1 && a.unlocktime > 0)
                .sort((a, b) => b.unlocktime - a.unlocktime)
                .slice(0, 5)
                .map(a => ({
                    name: a.apiname,
                    unlocked_at: new Date(a.unlocktime * 1000).toISOString(),
                    game: game.name,
                    game_appid: game.appid
                }));
            achievements.push(...unlocked);
        }
    }

    // Sort all achievements by unlock time and take top 10
    return achievements
        .sort((a, b) => new Date(b.unlocked_at).getTime() - new Date(a.unlocked_at).getTime())
        .slice(0, 10);
}

// ============================================
// POLLING FUNCTION (for live status logging)
// ============================================

async function checkLimbic() {
    if (!STEAM_KEY || !STEAM_ID) {
        console.warn('[LIMBIC] Missing API Key or Steam ID in .env');
        return;
    }

    try {
        const player = await fetchPlayerSummary();
        if (!player) return;

        const currentGame = player.gameextrainfo || null;

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
                source: 'steam',
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

module.exports = { 
    startLimbicSensor,
    getStats,
    getRecentAchievements,
    fetchOwnedGames,
    fetchRecentlyPlayedGames,
    fetchPlayerAchievements
};
