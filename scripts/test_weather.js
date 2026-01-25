const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { updateWeather } = require('../src/services/aetherService');
const supabase = require('../src/config/supabase');

async function test() {
    console.log('[TEST] Starting Manual Weather Update...');
    await updateWeather();
    
    console.log('[TEST] Fetching result from DB...');
    const { data, error } = await supabase
        .from('weather_current')
        .select('*')
        .single();
        
    if (error) {
        console.error('[TEST] ❌ Failed to fetch from DB:', error);
    } else {
        console.log('[TEST] ✅ DB Row Content:', JSON.stringify(data, null, 2));
    }
    
    process.exit(0);
}

test();
