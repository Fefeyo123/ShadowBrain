const supabase = require('../config/supabase');
const { sumArray } = require('../utils/mathUtils');

/**
 * GET /v1/kinetic/overview
 * Returns Activity group
 */
exports.getOverview = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Fetch metrics
        const { data: metrics, error } = await supabase
            .from('view_health_metrics')
            .select('type, value, unit, timestamp')
            .gte('timestamp', startOfDay.toISOString())
            .in('type', [
                'step_count', 'distance_walking_running', 'flights_climbed'
            ]);

        if (error) throw error;

        // Group & deduplicate metrics using reduce
        const groupedMetrics = (metrics || []).reduce((acc, metric) => {
            const { type, value, timestamp } = metric;
            
            if (!acc[type]) {
                acc[type] = { values: [], seen: new Set() };
            }

            // Deduplicate: same timestamp = same reading from a duplicate batch
            if (!acc[type].seen.has(timestamp)) {
                acc[type].seen.add(timestamp);
                acc[type].values.push(value);
            }
            
            return acc;
        }, {});

        // Helper function to sum and cleanly round values
        const getSum = (type, decimals = 0) => {
            const total = sumArray(groupedMetrics[type]?.values || []);
            const multiplier = Math.pow(10, decimals);
            return Math.round(total * multiplier) / multiplier;
        };

        const activityGroup = {
            id: 'activity',
            label: 'Activity',
            icon: 'directions_walk',
            color: 'rose',
            metrics: [
                { key: 'steps', label: 'Steps', value: getSum('step_count'), unit: '' },
                { key: 'distance', label: 'Distance', value: getSum('distance_walking_running', 2), unit: 'km' },
                { key: 'flights', label: 'Flights', value: getSum('flights_climbed'), unit: 'floors' },
            ]
        };

        res.json({
            group: activityGroup,
            updated_at: new Date().toISOString()
        });

    } catch (err) {
        console.error('[ERROR] Get Kinetic Overview:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};