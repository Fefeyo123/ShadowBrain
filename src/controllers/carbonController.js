const supabase = require('../config/supabase');
const { sumArray, avgArray } = require('../utils/mathUtils');

/**
 * GET /v1/carbon/overview
 * Returns Energy and Body groups
 */
exports.getOverview = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: metrics, error } = await supabase
            .from('view_health_metrics')
            .select('type, value, timestamp')
            .gte('timestamp', startOfDay.toISOString())
            .in('type', [
                'active_energy', 'basal_energy_burned', 
                'body_mass', 'body_mass_index', 'body_fat_percentage'
            ]);

        if (error) throw error;

        const grouped = (metrics || []).reduce((acc, { type, value, timestamp }) => {
            if (!acc[type]) {
                acc[type] = { values: [], seen: new Set() };
            }
            if (!acc[type].seen.has(timestamp)) {
                acc[type].seen.add(timestamp);
                acc[type].values.push(value);
            }
            return acc;
        }, {});

        const getValues = (type) => grouped[type]?.values || [];
        const getSum = (type) => Math.round(sumArray(getValues(type)));
        const getAvg = (type) => Math.round(avgArray(getValues(type)) * 10) / 10;

        const activeKcal = getSum('active_energy');
        const basalKcal = getSum('basal_energy_burned');

        const energyGroup = {
            id: 'energy',
            label: 'Energy',
            icon: 'local_fire_department',
            color: 'orange',
            metrics: [
                { key: 'active', label: 'Active', value: activeKcal, unit: 'kcal' },
                { key: 'basal', label: 'Basal', value: basalKcal, unit: 'kcal' },
                { key: 'total', label: 'Total', value: activeKcal + basalKcal, unit: 'kcal' },
            ]
        };

        const bodyGroup = {
            id: 'body',
            label: 'Body',
            icon: 'accessibility_new',
            color: 'cyan',
            metrics: [
                { key: 'weight', label: 'Weight', value: getAvg('body_mass'), unit: 'kg' },
                { key: 'bmi', label: 'BMI', value: getAvg('body_mass_index'), unit: '' },
                { key: 'body_fat', label: 'Body Fat', value: getAvg('body_fat_percentage'), unit: '%' },
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