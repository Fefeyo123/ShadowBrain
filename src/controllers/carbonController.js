const supabase = require('../config/supabase');
const { sumArray, avgArray } = require('../utils/mathUtils');

/**
 * GET /v1/carbon/overview
 * Returns Energy and Body groups
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
                'active_energy', 'basal_energy_burned', 
                'body_mass', 'body_mass_index', 'body_fat_percentage'
            ]);

        // Group metrics
        const grouped = {};
        for (const m of metrics || []) {
            if (!grouped[m.type]) grouped[m.type] = { values: [], unit: m.unit };
            grouped[m.type].values.push(m.value);
        }

        const energyGroup = {
            id: 'energy',
            label: 'Energy',
            icon: 'local_fire_department',
            color: 'orange',
            metrics: [
                { key: 'active', label: 'Active', value: Math.round(sumArray(grouped.active_energy?.values)), unit: 'kcal' },
                { key: 'basal', label: 'Basal', value: Math.round(sumArray(grouped.basal_energy_burned?.values)), unit: 'kcal' },
                { key: 'total', label: 'Total', value: Math.round(sumArray(grouped.active_energy?.values) + sumArray(grouped.basal_energy_burned?.values)), unit: 'kcal' },
            ]
        };

        const bodyGroup = {
            id: 'body',
            label: 'Body',
            icon: 'accessibility_new',
            color: 'cyan',
            metrics: [
                { key: 'weight', label: 'Weight', value: Math.round(avgArray(grouped.body_mass?.values) * 10) / 10, unit: 'kg' },
                { key: 'bmi', label: 'BMI', value: Math.round(avgArray(grouped.body_mass_index?.values) * 10) / 10, unit: '' },
                { key: 'body_fat', label: 'Body Fat', value: Math.round(avgArray(grouped.body_fat_percentage?.values) * 10) / 10, unit: '%' },
            ]
        };

        res.json({
            groups: [energyGroup, bodyGroup],
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[ERROR] Get Carbon Overview:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
