const supabase = require('../config/supabase');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { sumArray, avgArray } = require('../utils/mathUtils');
const SHADOW_SECRET = process.env.SHADOW_SECRET;

// Gemini AI removed from Vital
const genAI = null;
const geminiModel = null;

/**
 * GET /v1/vital/pulse (legacy)
 */
exports.getPulse = (req, res) => {
    res.json({
        bpm: 72,
        focus_score: 85,
        valence: "Neutral",
        status: "Nominal"
    });
};

/**
 * GET /v1/vital/overview
 * Returns Cardiac group
 */
exports.getOverview = async (req, res) => {
    try {
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);

        // Fetch metrics needed for Cardiac (Resting HR, HRV)
        const { data: metrics } = await supabase
            .from('view_health_metrics')
            .select('type, value, unit')
            .gte('timestamp', oneDayAgo.toISOString())
            .in('type', ['resting_heart_rate', 'heart_rate_variability']);

        // Fetch heart rate
        const { data: heartRates } = await supabase
            .from('view_heart_rate')
            .select('bpm, timestamp')
            .gte('timestamp', oneDayAgo.toISOString());

        // Group metrics
        const grouped = {};
        for (const m of metrics || []) {
            if (!grouped[m.type]) grouped[m.type] = { values: [], unit: m.unit };
            grouped[m.type].values.push(m.value);
        }

        const hrs = (heartRates || []).map(h => h.bpm).filter(Boolean);
        const cardiacGroup = {
            id: 'cardiac',
            label: 'Cardiac',
            icon: 'favorite',
            color: 'red',
            metrics: [
                { key: 'current', label: 'Current', value: hrs[0] || null, unit: 'bpm' },
                { key: 'avg', label: 'Average', value: hrs.length > 0 ? Math.round(sumArray(hrs) / hrs.length) : null, unit: 'bpm' },
                { key: 'resting', label: 'Resting', value: Math.round(avgArray(grouped.resting_heart_rate?.values)), unit: 'bpm' },
                { key: 'hrv', label: 'HRV', value: Math.round(avgArray(grouped.heart_rate_variability?.values)), unit: 'ms' },
            ]
        };

        res.json({
            group: cardiacGroup,
            updated_at: heartRates?.[0]?.timestamp || new Date().toISOString()
        });
    } catch (err) {
        console.error('[ERROR] Get Vital Overview:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};



// Health ingest endpoint (unchanged)
exports.ingestMetrics = async (req, res) => {
    try {
        const secret = req.headers['x-shadow-secret'];
        if (secret !== SHADOW_SECRET) {
            console.warn(`♡ [VITAL] ${new Date().toLocaleTimeString()} | !! Unauthorized Access Attempt`);
            return res.status(403).json({ error: 'Forbidden' });
        }

        const payload = req.body;
        const metrics = payload.data?.metrics || payload.metrics || [];
        
        if (metrics.length === 0) {
            return res.json({ status: 'ok', message: 'No metrics found' });
        }

        const eventsToInsert = [];

        for (const metric of metrics) {
            const eventType = metric.name || 'unknown_metric';

            if (eventType === 'sleep_analysis' && metric.data && metric.data.length > 0) {
                const { data: recentSleeps } = await supabase
                    .from('shadow_events')
                    .select('id, data, timestamp')
                    .eq('event_type', 'sleep_analysis')
                    .order('timestamp', { ascending: false })
                    .limit(1);

                let matchId = null;
                let existingRow = null;

                if (recentSleeps && recentSleeps.length > 0) {
                    const row = recentSleeps[0];
                    const rowTime = new Date(row.timestamp).getTime();
                    const hoursDiff = (new Date().getTime() - rowTime) / (1000 * 60 * 60);
                    
                    if (hoursDiff < 16) {
                        matchId = row.id;
                        existingRow = row;
                    }
                }

                if (matchId && existingRow) {
                    const oldDataPoints = existingRow.data.data || [];
                    const newDataPoints = metric.data || [];
                    const mergedMap = new Map();
                    
                    oldDataPoints.forEach(p => mergedMap.set(p.date || p.startDate, p));
                    newDataPoints.forEach(p => mergedMap.set(p.date || p.startDate, p));

                    const mergedData = Array.from(mergedMap.values());
                    mergedData.sort((a, b) => new Date(a.date || a.startDate) - new Date(b.date || b.startDate));
                    metric.data = mergedData;

                    console.log(`♡ [VITAL] Updating Sleep Timeline (ID: ${matchId}) - Merged ${newDataPoints.length} segments.`);
                    
                    await supabase
                        .from('shadow_events')
                        .update({ data: metric, timestamp: new Date().toISOString() })
                        .eq('id', matchId);
                    continue;
                }
            }
            
            eventsToInsert.push({
                source: 'health_auto_export',
                event_type: eventType,
                timestamp: new Date().toISOString(),
                data: metric 
            });
        }

        if (eventsToInsert.length > 0) {
            const { error } = await supabase.from('shadow_events').insert(eventsToInsert);
            if (error) throw error;
        }

        console.log(`♡ [VITAL] ${new Date().toLocaleTimeString()} | Saved ${eventsToInsert.length} events`);
        res.json({ status: 'ok', rows_inserted: eventsToInsert.length });

    } catch (err) {
        console.error('[ERROR] Health Sync Failed:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
