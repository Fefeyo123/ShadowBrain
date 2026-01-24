const supabase = require('../config/supabase'); // Adjust path to your supabase client
// We use dynamic import for 'openmeteo' because it is likely an ESM-only package
// or the user code snippet implies it. 
// However, since we are in CommonJS land, we'll try to use dynamic import() inside the function.

let fetchWeatherApi;

const POLL_INTERVAL = 15 * 60 * 1000; // 15 Minutes

// --- SERVICE LOGIC ---

async function updateWeather() {
    try {
        console.log('[ATMOSPHERE] Polling Atmosphere...');

        // 0. Load dependency if needed
        if (!fetchWeatherApi) {
            const mod = await import('openmeteo');
            fetchWeatherApi = mod.fetchWeatherApi;
        }

        // 1. Get Latest Location
        // We defer to view_location_history. 
        // We order by timestamp DESC limit 1.
        const { data: locationData, error: locError } = await supabase
            .from('view_location_history')
            .select('lat, lon')
            .limit(1)
            .single(); // .single() returns object or null

        if (locError || !locationData) {
            console.warn('[ATMOSPHERE] No location found in history. Skipping update.');
            return;
        }

        const { lat, lon } = locationData;
        console.log(`[ATMOSPHERE] Scanning sector: ${lat}, ${lon}`);

        // 2. Fetch Weather (User's Code Snippet Adapted)
        const params = {
            latitude: lat,
            longitude: lon,
            daily: ["sunrise", "sunset", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max", "apparent_temperature_min", "weather_code"],
            hourly: ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature", "precipitation_probability", "precipitation", "rain", "showers", "snowfall", "snow_depth", "cloud_cover", "visibility", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "uv_index", "pressure_msl"],
            current: ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day", "precipitation", "rain", "showers", "snowfall", "weather_code", "cloud_cover", "pressure_msl", "surface_pressure", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"],
            timezone: "auto",
        };
        const url = "https://api.open-meteo.com/v1/forecast";
        
        // Call API
        const responses = await fetchWeatherApi(url, params);
        
        // Process first location
        const response = responses[0];
        
        // Attributes
        const utcOffsetSeconds = response.utcOffsetSeconds();
        const timezone = response.timezone();
        const timezoneAbbreviation = response.timezoneAbbreviation();
        const latitude = response.latitude();
        const longitude = response.longitude();

        const current = response.current();
        const hourly = response.hourly();
        const daily = response.daily();

        const sunrise = daily.variables(0);
        const sunset = daily.variables(1);

        // Construct Data Object
        const weatherData = {
            meta: {
                latitude,
                longitude,
                timezone,
                timezoneAbbreviation,
                utcOffsetSeconds
            },
            current: {
                time: new Date((Number(current.time()) + utcOffsetSeconds) * 1000).toISOString(),
                temperature_2m: current.variables(0).value(),
                relative_humidity_2m: current.variables(1).value(),
                apparent_temperature: current.variables(2).value(),
                is_day: current.variables(3).value(),
                precipitation: current.variables(4).value(),
                rain: current.variables(5).value(),
                showers: current.variables(6).value(),
                snowfall: current.variables(7).value(),
                weather_code: current.variables(8).value(),
                cloud_cover: current.variables(9).value(),
                pressure_msl: current.variables(10).value(),
                surface_pressure: current.variables(11).value(),
                wind_speed_10m: current.variables(12).value(),
                wind_direction_10m: current.variables(13).value(),
                wind_gusts_10m: current.variables(14).value(),
            },
            hourly: {
                time: Array.from(
                    { length: (Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval() }, 
                    (_, i) => new Date((Number(hourly.time()) + i * hourly.interval() + utcOffsetSeconds) * 1000).toISOString()
                ),
                temperature_2m: Array.from(hourly.variables(0).valuesArray()),
                relative_humidity_2m: Array.from(hourly.variables(1).valuesArray()),
                dew_point_2m: Array.from(hourly.variables(2).valuesArray()),
                apparent_temperature: Array.from(hourly.variables(3).valuesArray()),
                precipitation_probability: Array.from(hourly.variables(4).valuesArray()),
                precipitation: Array.from(hourly.variables(5).valuesArray()),
                rain: Array.from(hourly.variables(6).valuesArray()),
                showers: Array.from(hourly.variables(7).valuesArray()),
                snowfall: Array.from(hourly.variables(8).valuesArray()),
                snow_depth: Array.from(hourly.variables(9).valuesArray()),
                cloud_cover: Array.from(hourly.variables(10).valuesArray()),
                visibility: Array.from(hourly.variables(11).valuesArray()),
                wind_speed_10m: Array.from(hourly.variables(12).valuesArray()),
                wind_direction_10m: Array.from(hourly.variables(13).valuesArray()),
                wind_gusts_10m: Array.from(hourly.variables(14).valuesArray()),
                uv_index: Array.from(hourly.variables(15).valuesArray()),
                pressure_msl: Array.from(hourly.variables(16).valuesArray()),
            },
            daily: {
                time: Array.from(
                    { length: (Number(daily.timeEnd()) - Number(daily.time())) / daily.interval() }, 
                    (_, i) => new Date((Number(daily.time()) + i * daily.interval() + utcOffsetSeconds) * 1000).toISOString()
                ),
                sunrise: [...Array(sunrise.valuesInt64Length())].map(
                    (_, i) => new Date((Number(sunrise.valuesInt64(i)) + utcOffsetSeconds) * 1000).toISOString()
                ),
                sunset: [...Array(sunset.valuesInt64Length())].map(
                    (_, i) => new Date((Number(sunset.valuesInt64(i)) + utcOffsetSeconds) * 1000).toISOString()
                ),
                temperature_2m_max: Array.from(daily.variables(2).valuesArray()),
                temperature_2m_min: Array.from(daily.variables(3).valuesArray()),
                apparent_temperature_max: Array.from(daily.variables(4).valuesArray()),
                apparent_temperature_min: Array.from(daily.variables(5).valuesArray()),
                weather_code: Array.from(daily.variables(6).valuesArray()),
            },
        };

        // 3. Store in Database
        const { error: dbError } = await supabase
            .from('weather_current')
            .upsert({
                id: 1,
                updated_at: new Date().toISOString(),
                location: { lat, lon },
                data: weatherData
            });

        if (dbError) throw dbError;

        console.log(`[ATMOSPHERE] Atmosphere data acquired for sector ${lat}, ${lon}`);

    } catch (err) {
        console.error('[ATMOSPHERE] Sensor Malfunction:', err.message);
        if (err.cause) console.error(err.cause);
    }
}

function startAtmosphereSensor() {
    console.log("☇☇☇ SHADOW ATMOSPHERE ONLINE ☇☇☇");
    
    // Initial run after 5 seconds to let server start up
    setTimeout(updateWeather, 5000);

    // Poll interval
    setInterval(updateWeather, POLL_INTERVAL);
}

module.exports = { startAtmosphereSensor, updateWeather };
