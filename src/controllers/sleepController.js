const supabase = require('../config/supabase');
const { sumArray, avgArray } = require('../utils/mathUtils');

/**
 * GET /v1/somnus/overview
 * Returns sleep overview data (card metrics + timeline)
 */
exports.getOverview = async (req, res) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Concurrent Data Fetching
        // Fetching all necessary data in parallel to reduce latency.
        const [sleepDataResponse, metricsResponse, heartRateResponse] = await Promise.all([
            supabase.from('view_sleep_timeline').select('*').gte('start_time', oneDayAgo).order('start_time', { ascending: true }),
            supabase.from('view_health_metrics').select('type, value, unit, timestamp').gte('timestamp', oneDayAgo)
                .in('type', ['respiratory_rate', 'blood_oxygen_saturation', 'blood_oxygen', 'apple_sleeping_wrist_temperature', 'body_temperature']),
            supabase.from('view_heart_rate').select('bpm, timestamp').gte('timestamp', oneDayAgo)
        ]);

        const sleepData = sleepDataResponse.data || [];
        const metrics = metricsResponse.data || [];
        const heartRates = heartRateResponse.data || [];

        // 2. Phase Summarization
        // Use reduce to aggregate hours per sleep phase.
        const phases = sleepData.reduce((acc, s) => {
            const phase = (s.phase || '').toLowerCase();
            const duration = s.duration_hours || 0;
            if (phase.includes('deep')) acc.deep += duration;
            else if (phase.includes('rem')) acc.rem += duration;
            else if (phase.includes('core')) acc.core += duration;
            else if (phase.includes('awake')) acc.awake += duration;
            return acc;
        }, { deep: 0, rem: 0, core: 0, awake: 0 });

        const sleepTotal = phases.deep + phases.rem + phases.core;

        // 3. Sleep Window Detection
        // Identifies the start and end of the entire sleep session.
        let sleepStart = null, sleepEnd = null;
        if (sleepData.length > 0) {
            const times = sleepData.flatMap(s => [new Date(s.start_time).getTime(), new Date(s.end_time).getTime()]);
            sleepStart = Math.min(...times);
            sleepEnd = Math.max(...times);
        }

        // 4. Metric Aggregation Helper
        // Filters metrics that fall within the specific sleep window.
        const getWindowedAvg = (types, isRelaxed = false) => {
            if (!sleepStart || !sleepEnd) return 0;
            const searchStart = isRelaxed ? sleepStart - (6 * 60 * 60 * 1000) : sleepStart;
            
            const values = metrics
                .filter(m => types.includes(m.type))
                .filter(m => {
                    const t = new Date(m.timestamp).getTime();
                    return t >= searchStart && t <= sleepEnd;
                })
                .map(m => m.value);
            return avgArray(values);
        };

        const sleepHrValues = heartRates
            .filter(h => {
                const t = new Date(h.timestamp).getTime();
                return sleepStart && sleepEnd && t >= sleepStart && t <= sleepEnd;
            })
            .map(h => h.bpm);

        // 5. Build Response Object
        // Matches the frontend expectation for the 'sleep' group structure.
        const group = {
            id: 'sleep',
            label: 'Sleep',
            icon: 'bedtime',
            color: 'violet',
            metrics: [
                { key: 'total', label: 'Total', value: Number(sleepTotal.toFixed(2)), unit: 'hrs' },
                { key: 'deep', label: 'Deep', value: Number(phases.deep.toFixed(2)), unit: 'hrs' },
                { key: 'rem', label: 'REM', value: Number(phases.rem.toFixed(2)), unit: 'hrs' },
                { key: 'core', label: 'Core', value: Number(phases.core.toFixed(2)), unit: 'hrs' },
            ],
            related: [
                { key: 'sleep_hr', label: 'Sleep HR', value: Math.round(avgArray(sleepHrValues)), unit: 'bpm' },
                { key: 'respiratory', label: 'Respiratory', value: Number(getWindowedAvg(['respiratory_rate']).toFixed(1)), unit: '/min' },
                { key: 'oxygen', label: 'O₂ Sat', value: Number(getWindowedAvg(['blood_oxygen_saturation', 'blood_oxygen']).toFixed(2)), unit: '%' },
                { key: 'wrist_temp', label: 'Wrist Temp', value: Number(getWindowedAvg(['apple_sleeping_wrist_temperature', 'body_temperature'], true).toFixed(1)), unit: '°C' },
            ]
        };

        // 6. Quality Scoring
        // Determines quality based on efficiency and restorative sleep percentages.
        const totalInBed = sleepTotal + phases.awake;
        let quality = 'No Data';
        if (sleepTotal > 0) {
            const efficiency = totalInBed > 0 ? (sleepTotal / totalInBed) : 0;
            const restorative = ((phases.deep + phases.rem) / sleepTotal);
            
            if (efficiency < 0.85) {
                quality = restorative >= 0.35 ? 'Fair' : 'Poor';
            } else {
                if (restorative >= 0.40) quality = 'Excellent';
                else if (restorative >= 0.25) quality = 'Good';
                else quality = 'Fair';
            }
        }

        res.json({
            group,
            timeline: sleepData,
            quality,
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[ERROR] Sleep Overview:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /v1/somnus/history
 * Short sleep history for charts
 */
exports.getHistory = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('view_sleep_daily')
            .select('sleep_date, total_hours, rem_hours, deep_hours, core_hours')
            .order('sleep_date', { ascending: false })
            .limit(14);

        if (error) throw error;
        res.json({ history: data || [] });
    } catch (err) {
        console.error('[ERROR] Sleep History:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};