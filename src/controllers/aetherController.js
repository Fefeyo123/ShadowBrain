const supabase = require('../config/supabase');
const { pivotArrays } = require('../utils/dataUtils');

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

exports.getForecast = async (req, res) => {
    try {
        const { data: row, error } = await supabase
            .from('weather_current')
            .select('data, location, updated_at')
            .eq('id', 1)
            .single();

        if (error || !row) {
            console.warn('[AETHER] Geen weerdata gevonden in de DB.');
            return res.json({ 
                meta: {}, 
                current: null, 
                daily: [], 
                hourly: [] 
            });
        }

        const { data: raw, location, updated_at } = row;
        const now = new Date();
        const nowTime = now.getTime();

        const daily = pivotArrays(raw.daily || {});

        const oneHourAgo = new Date(nowTime - ONE_HOUR_MS);
        const twentyFourHoursFromNow = new Date(nowTime + TWENTY_FOUR_HOURS_MS);

        const hourly = pivotArrays(raw.hourly || []).filter(h => {
            const time = new Date(h.time);
            return time >= oneHourAgo && time <= twentyFourHoursFromNow;
        });

        const currentHourStr = now.toISOString().slice(0, 13); 
        const currentHourData = hourly.find(h => h.time.startsWith(currentHourStr)) || hourly[0];

        const current = { ...raw.current };

        if (currentHourData) {
            current.uv_index ??= currentHourData.uv_index;
            current.visibility ??= currentHourData.visibility;
            current.precipitation_probability ??= currentHourData.precipitation_probability;
            current.pressure_msl ??= (currentHourData.pressure_msl || current.surface_pressure);
        }

        // 5. Bouw en verstuur de response
        return res.json({
            meta: {
                ...(raw.meta || {}),
                lat: location?.lat,
                lon: location?.lon,
                updated_at
            },
            current,
            daily,
            hourly
        });

    } catch (err) {
        console.error('[AETHER] API Error:', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};