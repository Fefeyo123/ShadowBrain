const supabase = require('../config/supabase');
const { sumArray, avgArray } = require('../utils/mathUtils');

/**
 * GET /v1/kinetic/overview
 * Returns Activity group
 */
exports.getOverview = async (req, res) => {
    try {
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);

        // Fetch metrics
        const { data: metrics } = await supabase
            .from('view_health_metrics')
            .select('type, value, unit')
            .gte('timestamp', oneDayAgo.toISOString())
            .in('type', [
                'step_count', 'distance_walking_running', 'flights_climbed'
            ]);

        // Group metrics
        const grouped = {};
        for (const m of metrics || []) {
            if (!grouped[m.type]) grouped[m.type] = { values: [], unit: m.unit };
            grouped[m.type].values.push(m.value);
        }

        const activityGroup = {
            id: 'activity',
            label: 'Activity',
            icon: 'directions_walk',
            color: 'rose',
            metrics: [
                { key: 'steps', label: 'Steps', value: Math.round(sumArray(grouped.step_count?.values)), unit: '' },
                { key: 'distance', label: 'Distance', value: Math.round(sumArray(grouped.distance_walking_running?.values) * 100) / 100, unit: 'km' },
                { key: 'flights', label: 'Flights', value: Math.round(sumArray(grouped.flights_climbed?.values)), unit: 'floors' },
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
