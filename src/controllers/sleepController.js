const supabase = require('../config/supabase');
const { sumArray, avgArray } = require('../utils/mathUtils');

/**
 * GET /v1/somnus/overview
 * Returns sleep overview data (card metrics + timeline)
 */
exports.getOverview = async (req, res) => {
    try {
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);

        // Fetch sleep data
        const { data: sleepData } = await supabase
            .from('view_sleep_timeline')
            .select('*')
            .gte('start_time', oneDayAgo.toISOString())
            .order('start_time', { ascending: true }); // Ordered for timeline

        // Fetch related metrics for Sleep Window calculations
        // We need: heart_rate, respiratory_rate, blood_oxygen, wrist_temp
        // Optimization: Fetch all needed metrics in one go if possible, or parallel
        const { data: metrics } = await supabase
            .from('view_health_metrics')
            .select('type, value, unit, timestamp')
            .gte('timestamp', oneDayAgo.toISOString())
            .in('type', ['respiratory_rate', 'blood_oxygen_saturation', 'blood_oxygen', 'apple_sleeping_wrist_temperature', 'body_temperature']);

        const { data: heartRates } = await supabase
            .from('view_heart_rate')
            .select('bpm, timestamp')
            .gte('timestamp', oneDayAgo.toISOString());

        // --- Calculate Sleep Metrics ---
        let sleepTotal = 0, deep = 0, rem = 0, core = 0, awake = 0;
        for (const s of sleepData || []) {
            const phase = (s.phase || '').toLowerCase();
            const hrs = s.duration_hours || 0;
            if (phase.includes('deep')) deep += hrs;
            else if (phase.includes('rem')) rem += hrs;
            else if (phase.includes('core')) core += hrs;
            else if (phase.includes('awake')) awake += hrs;
        }
        sleepTotal = deep + rem + core;

        // Detect Sleep Window (last main sleep session)
        let sleepStart = null, sleepEnd = null;
        if (sleepData && sleepData.length > 0) {
             const timestamps = sleepData.map(s => [new Date(s.start_time).getTime(), new Date(s.end_time).getTime()]).flat();
             sleepStart = Math.min(...timestamps);
             sleepEnd = Math.max(...timestamps);
        }

        // Helper for windowed average
        const getAvgInWindow = (metricType, fallbackType, relaxedWindow = false) => {
             if (!sleepStart || !sleepEnd) return 0;
             const searchStart = relaxedWindow ? sleepStart - (6 * 60 * 60 * 1000) : sleepStart;
             
             const values = (metrics || [])
                .filter(m => (m.type === metricType || m.type === fallbackType))
                .filter(m => {
                    const t = new Date(m.timestamp).getTime();
                    return t >= searchStart && t <= sleepEnd;
                })
                .map(m => m.value);
             return avgArray(values);
        };

        const sleepHr = (heartRates || [])
            .filter(h => {
                const t = new Date(h.timestamp).getTime();
                return sleepStart && sleepEnd && t >= sleepStart && t <= sleepEnd;
            })
            .map(h => h.bpm);

        const group = {
            id: 'sleep',
            label: 'Sleep',
            icon: 'bedtime',
            color: 'violet',
            metrics: [
                { key: 'total', label: 'Total', value: Math.round(sleepTotal * 100) / 100, unit: 'hrs' },
                { key: 'deep', label: 'Deep', value: Math.round(deep * 100) / 100, unit: 'hrs' },
                { key: 'rem', label: 'REM', value: Math.round(rem * 100) / 100, unit: 'hrs' },
                { key: 'core', label: 'Core', value: Math.round(core * 100) / 100, unit: 'hrs' },
            ],
            related: [
                { key: 'sleep_hr', label: 'Sleep HR', value: Math.round(avgArray(sleepHr)), unit: 'bpm' },
                { key: 'respiratory', label: 'Respiratory', value: Math.round(getAvgInWindow('respiratory_rate') * 10) / 10, unit: '/min' },
                { key: 'oxygen', label: 'O₂ Sat', value: Math.round(getAvgInWindow('blood_oxygen_saturation', 'blood_oxygen') * 100) / 100, unit: '%' },
                { key: 'wrist_temp', label: 'Wrist Temp', value: Math.round(getAvgInWindow('apple_sleeping_wrist_temperature', 'body_temperature', true) * 10) / 10, unit: '°C' },
            ]
        };

        // Determine Quality
        const totalDuration = sleepTotal + awake;
        let quality = 'No Data';
        if (sleepTotal > 0) {
            const efficiency = totalDuration > 0 ? (sleepTotal / totalDuration) : 0;
            const restorativePercent = ((deep + rem) / sleepTotal) * 100;
            
            if (efficiency < 0.85) {
                if (restorativePercent >= 35) quality = 'Fair';
                else quality = 'Poor';
            } else {
                if (restorativePercent >= 40) quality = 'Excellent';
                else if (restorativePercent >= 25) quality = 'Good';
                else quality = 'Fair';
            }
        }

        res.json({
            group,
            timeline: sleepData || [],
            quality,
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[ERROR] Get Somnus Overview:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /v1/somnus/history
 * Short sleep history for charts
 */
exports.getHistory = async (req, res) => {
    try {
        const { data: sleepData } = await supabase
            .from('view_sleep_daily')
            .select('sleep_date, total_hours, rem_hours, deep_hours, core_hours')
            .order('sleep_date', { ascending: false })
            .limit(14); // 2 weeks

        res.json({ history: sleepData || [] });
    } catch (err) {
        console.error('[ERROR] Get Somnus History:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
