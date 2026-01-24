const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const axios = require('axios');

async function testApi() {
    console.log('[TEST] Shadow Key loaded:', process.env.SHADOW_KEY ? 'YES' : 'NO');
    const headers = { 'x-shadow-key': process.env.SHADOW_KEY };

    // 1. Sanity Check
    try {
        console.log('[TEST] Checking /test...');
        const r1 = await axios.get('http://127.0.0.1:3001/test');
        console.log('[TEST] /test Result:', r1.data);
    } catch (e) {
        console.error('[TEST] /test Failed:', e.message);
    }

    // 2. Status Check
    try {
        console.log('[TEST] Checking /api/v1/status...');
        const r2 = await axios.get('http://127.0.0.1:3001/api/v1/status', { headers });
        console.log('[TEST] /api/v1/status Result:', r2.status);
    } catch (e) {
        console.error('[TEST] /api/v1/status Failed:', e.message);
    }
    
    // 3. Atmosphere Check
    try {
        console.log('[TEST] Calling Atmosphere API...');
        const res = await axios.get('http://127.0.0.1:3001/api/v1/atmosphere', { headers });
        console.log('[TEST] Status:', res.status);
        console.log('[TEST] Meta:', res.data.meta);
        console.log('[TEST] Daily Items:', res.data.daily ? res.data.daily.length : 0);
    } catch (err) {
        console.error('[TEST] Atmosphere API Failed:', err.message);
    }
}

testApi();
