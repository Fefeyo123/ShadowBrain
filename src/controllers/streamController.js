/**
 * Stream Controller
 * Handles fetching event streams from Supabase.
 */
const supabase = require('../config/supabase');

exports.getStream = async (req, res) => {
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
};
