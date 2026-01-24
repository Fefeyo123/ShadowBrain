const { createClient } = require('@supabase/supabase-js'); 
require('dotenv').config({ path: '.env' }); 
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY); 

(async () => { 
    console.log('--- DIAGNOSTIC START ---');
    
    // 1. Get latest sleep range (aggregated from segments for the last night)
    // We need to mimic the logic in the controller: find the min/max of the last batch of segments
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const { data: sleepRows } = await supabase
        .from('view_sleep_timeline')
        .select('start_time, end_time')
        .gte('start_time', oneDayAgo.toISOString());

    if(!sleepRows || sleepRows.length === 0) { console.log('No sleep data in last 24h'); return; }

    // Logic from controller
    const timestamps = sleepRows.map(s => [new Date(s.start_time).getTime(), new Date(s.end_time).getTime()]).flat();
    const sleepStart = Math.min(...timestamps);
    const sleepEnd = Math.max(...timestamps);

    console.log('Calculated Sleep Window:', new Date(sleepStart).toISOString(), 'to', new Date(sleepEnd).toISOString());

    // 2. Check Respiratory Rate
    const { data: resp } = await supabase.from('view_health_metrics')
        .select('*')
        .eq('type', 'respiratory_rate')
        .order('timestamp', {ascending: false})
        .limit(5);
    console.log('Recent Respiratory Data (Latest 5 globally):');
    console.log(resp);

    // 3. Check Wrist Temp
    const { data: temp } = await supabase.from('view_health_metrics')
        .select('*')
        .in('type', ['apple_sleeping_wrist_temperature', 'body_temperature', 'wrist_temperature'])
        .order('timestamp', {ascending: false})
        .limit(5);
    console.log('Recent Temp Data (Latest 5 globally):');
    console.log(temp);
    
    // 4. Check if any fall in window
    if (resp) {
        const inWindow = resp.filter(r => {
            const t = new Date(r.timestamp).getTime();
            return t >= sleepStart && t <= sleepEnd;
        });
        console.log(`Respiratory records in window: ${inWindow.length}`);
    }
})();
