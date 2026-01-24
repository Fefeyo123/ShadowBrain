const { createClient } = require('@supabase/supabase-js'); 
require('dotenv').config({ path: '.env' }); 
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY); 

function avgArray(arr) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + (b || 0), 0) / arr.length;
}

(async () => { 
    console.log('--- DEBUG VITAL CONTROLLER LOGIC ---');
    
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    // 1. Fetch Metrics (Mimic getGroups)
    const { data: metrics } = await supabase
        .from('view_health_metrics')
        .select('type, value, unit, timestamp')
        .gte('timestamp', oneDayAgo.toISOString());
        
    console.log(`Fetched ${metrics.length} metric rows.`);

    // 2. Fetch Sleep Data
    const { data: sleepData } = await supabase
        .from('view_sleep_timeline')
        .select('*')
        .gte('start_time', oneDayAgo.toISOString());

    // 3. Calc Sleep Window
    let sleepStart = null, sleepEnd = null;
    if (sleepData && sleepData.length > 0) {
         const timestamps = sleepData.map(s => [new Date(s.start_time).getTime(), new Date(s.end_time).getTime()]).flat();
         sleepStart = Math.min(...timestamps);
         sleepEnd = Math.max(...timestamps);
    }
    console.log('Sleep Window:', new Date(sleepStart).toISOString(), 'to', new Date(sleepEnd).toISOString());

    // 4. Test getAvgInWindow for Temperature
    const relaxedWindow = true;
    const searchStart = relaxedWindow ? sleepStart - (6 * 60 * 60 * 1000) : sleepStart;
    console.log('Search Start (Relaxed):', new Date(searchStart).toISOString());
    
    const metricType = 'apple_sleeping_wrist_temperature';
    const fallbackType = 'body_temperature';
    
    const relevantMetrics = metrics
        .filter(m => (m.type === metricType || m.type === fallbackType));
        
    console.log(`Found ${relevantMetrics.length} temp metrics in last 24h.`);
    if (relevantMetrics.length > 0) {
        console.log('Sample metrics:', relevantMetrics.slice(0, 3));
    }
    
    const inWindow = relevantMetrics
        .filter(m => {
            const t = new Date(m.timestamp).getTime();
            // console.log(`Checking ${m.timestamp} (${t}) >= ${searchStart} && <= ${sleepEnd}`);
            return t >= searchStart && t <= sleepEnd;
        });
        
    console.log(`Metrics in Relaxed Window: ${inWindow.length}`);
    if (inWindow.length > 0) console.log('In Window:', inWindow);

    const val = Math.round(avgArray(inWindow.map(m => m.value)) * 10) / 10;
    console.log('Calculated Average:', val);

})();
