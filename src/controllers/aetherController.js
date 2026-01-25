const supabase = require('../config/supabase');
const { pivotArrays } = require('../utils/dataUtils');

exports.getForecast = async (req, res) => {
    try {
        const { data: row, error } = await supabase
            .from('weather_current')
            .select('data, location, updated_at')
            .eq('id', 1)
            .single();

        if (error || !row) {
            console.warn('[AETHER] ⚠️ No weather data found in DB.');
            // Return empty structure rather than 404 to prevent frontend crashes
            return res.json({ 
                meta: {}, 
                current: null, 
                daily: [], 
                hourly: [] 
            });
        }

        const raw = row.data; // The JSONB payload

        const now = new Date();

        // 1. Transform Daily
        // OpenMeteo usually gives 7 days. We just pivot it.
        const daily = pivotArrays(raw.daily);

        // 2. Transform Hourly & Filter for Next 24h
        // OpenMeteo OneCall (or standard) often gives 7 days hourly (168 hours).
        // We only want [Now -> Now + 24h]
        let hourly = pivotArrays(raw.hourly);
        
        // Filter: Keep items where time is future (or very recent past) and within 24h
        // We accept items from "1 hour ago" to ensure the graph allows starts nicely connected
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        hourly = hourly.filter(h => {
            const t = new Date(h.time);
            return t >= oneHourAgo && t <= twentyFourHoursFromNow;
        });

        // Enrichment: Add missing fields to 'current' from the closest 'hourly' data point
        // match by closest hour
        const currentHourStr = now.toISOString().slice(0, 13); // "2023-10-27T10"
        const currentHourData = hourly.find(h => h.time.startsWith(currentHourStr)) || hourly[0];

        if (currentHourData) {
            if (raw.current.uv_index === undefined) raw.current.uv_index = currentHourData.uv_index;
            if (raw.current.visibility === undefined) raw.current.visibility = currentHourData.visibility;
            if (raw.current.precipitation_probability === undefined) raw.current.precipitation_probability = currentHourData.precipitation_probability;
            // Ensure pressure is available if not already
            if (raw.current.pressure_msl === undefined) raw.current.pressure_msl = currentHourData.pressure_msl || raw.current.surface_pressure;
        }

        // Response Assembly
        const response = {
            meta: {
                ...raw.meta,
                lat: row.location?.lat,
                lon: row.location?.lon,
                updated_at: row.updated_at
            },
            current: raw.current,
            daily: daily,
            hourly: hourly
        };

        res.json(response);

    } catch (err) {
        console.error('[AETHER] ❌ API Error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
