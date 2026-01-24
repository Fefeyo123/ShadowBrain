/**
 * Limbic Controller
 * Handles fetching gaming status, history, stats, and achievements.
 */
const supabase = require('../config/supabase');
const limbicService = require('../services/limbicService');

// Get current gaming status (or last played)
exports.getStatus = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('view_game_history')
            .select('*')
            .limit(1);

        if (error) throw error;

        // If no data, return clean empty state
        if (!data || data.length === 0) {
            return res.json({
                success: true,
                is_playing: false,
                game: null,
                last_seen: null
            });
        }

        const latest = data[0];
        const isPlaying = latest.status === 'playing';

        res.json({
            success: true,
            is_playing: isPlaying,
            game: latest.game,
            steam_id: latest.steam_id,
            last_seen: latest.timestamp,
        });

    } catch (err) {
        console.error('[API] Limbic Status Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get gaming history (timeline)
exports.getHistory = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('view_game_history')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;

        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error('[API] Limbic History Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get comprehensive stats (playtime, top games, library)
exports.getStats = async (req, res) => {
    try {
        const stats = await limbicService.getStats();
        res.json({ success: true, ...stats });
    } catch (err) {
        console.error('[API] Limbic Stats Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get recent achievements
exports.getAchievements = async (req, res) => {
    try {
        const achievements = await limbicService.getRecentAchievements();
        res.json({ 
            success: true, 
            count: achievements.length, 
            achievements 
        });
    } catch (err) {
        console.error('[API] Limbic Achievements Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
