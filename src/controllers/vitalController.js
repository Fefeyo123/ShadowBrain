const supabase = require('../config/supabase');
const SHADOW_SECRET = process.env.SHADOW_SECRET;

/**
 * Vital Controller
 * Handles pulse and vital signs logic.
 */

exports.getPulse = (req, res) => {
    // In a real implementation, this might read from a cached state object 
    // updated by the startPulseSensor() loop.
    res.json({
        bpm: 72, // Placeholder
        focus_score: 85, // Placeholder
        valence: "Neutral",
        status: "Nominal"
    });
};

exports.ingestMetrics = async (req, res) => {
    try {
        const secret = req.headers['x-shadow-secret'];
        if (secret !== SHADOW_SECRET) {
            console.warn(`♡ [VITAL] ${new Date().toLocaleTimeString()} | !! Unauthorized Access Attempt`);
            return res.status(403).json({ error: 'Forbidden' });
        }

        const payload = req.body;
        const metrics = payload.data?.metrics || payload.metrics || [];
        
        if (metrics.length === 0) {
             return res.json({ status: 'ok', message: 'No metrics found' });
        }

        const eventsToInsert = [];
        const sleepUpdates = [];
        
        // --- 1. SEPARATE & PREPARE ---
        for (const metric of metrics) {
            const eventType = metric.name || 'unknown_metric';

            // SPECIAL LOGIC: SLEEP ANALYSIS (Timeline Merging)
            if (eventType === 'sleep_analysis' && metric.data && metric.data.length > 0) {
                
                // 1. Get the timestamps of the new batch to find its "center of gravity"
                // Raw sleep uses 'startDate', Summarized uses 'date'
                const newDates = metric.data.map(d => new Date(d.date || d.startDate).getTime());
                const newBatchStart = Math.min(...newDates);

                // 2. Find the most recent Sleep Session (Last 24h)
                const { data: recentSleeps } = await supabase
                    .from('shadow_events')
                    .select('id, data, timestamp')
                    .eq('event_type', 'sleep_analysis')
                    .order('timestamp', { ascending: false })
                    .limit(1);

                let matchId = null;
                let existingRow = null;

                if (recentSleeps && recentSleeps.length > 0) {
                    const row = recentSleeps[0];
                    const rowTime = new Date(row.timestamp).getTime();
                    
                    // HEURISTIC: If the last entry was updated less than 16 hours ago, 
                    // assume this new data belongs to the same "Sleep Night".
                    const hoursDiff = (new Date().getTime() - rowTime) / (1000 * 60 * 60);
                    
                    if (hoursDiff < 16) {
                        matchId = row.id;
                        existingRow = row;
                    }
                }

                if (matchId && existingRow) {
                    // UPDATE existing row (Merge Logic)
                    const oldDataPoints = existingRow.data.data || [];
                    const newDataPoints = metric.data || [];

                    // Keyed by segment occurrence date to deduplicate/update specific segments
                    const mergedMap = new Map();
                    
                    oldDataPoints.forEach(p => mergedMap.set(p.date || p.startDate, p));
                    newDataPoints.forEach(p => mergedMap.set(p.date || p.startDate, p));

                    const mergedData = Array.from(mergedMap.values());
                    
                    // Sort timeline by start date
                    mergedData.sort((a, b) => new Date(a.date || a.startDate) - new Date(b.date || b.startDate));

                    // Update the metric object with the FULL merged dataset
                    metric.data = mergedData;

                    console.log(`♡ [VITAL] Updating Sleep Timeline (ID: ${matchId}) - Merged ${newDataPoints.length} segments. Total: ${mergedData.length}.`);
                    
                    await supabase
                        .from('shadow_events')
                        .update({ 
                            data: metric, 
                            timestamp: new Date().toISOString() 
                        })
                        .eq('id', matchId);
                    continue; // Skip inserting this one
                }
            }
            
            // STANDARD INSERT
            eventsToInsert.push({
                source: 'health_auto_export',
                event_type: eventType,
                timestamp: new Date().toISOString(),
                data: metric 
            });
        }

        // --- 2. INSERT NEW RECORDS ---
        if (eventsToInsert.length > 0) {
            const { error } = await supabase
                .from('shadow_events')
                .insert(eventsToInsert);

            if (error) throw error;
        }

        // --- SUMMARY LOGGING ---
        const updates = metrics.map(m => {
            const dataPoints = m.data || [];
            if (dataPoints.length === 0) return null;

            // 1. Calculate Time Range (in Minutes)
            // Dates are in ISO or format "2026-01-23 09:00:00 +0100"
            const dates = dataPoints.map(d => new Date(d.date || d.startDate).getTime());
            const minTime = Math.min(...dates);
            const maxTime = Math.max(...dates);
            const rangeMin = Math.round((maxTime - minTime) / 60000); // ms -> min
            const timeLabel = rangeMin > 0 ? `last ${rangeMin}m` : 'now';

            // 2. Calculate Value (Sum or Avg)
            let val = 0;
            let label = '';
            
            // Heuristics
            const isSum = ['step_count', 'active_energy', 'basal_energy_burned', 'apple_stand_time'].includes(m.name);
            
            if (m.name === 'sleep_analysis') {
                 // Calculate Total Sleep
                 // Case A: Summarized (REM + Core + Deep)
                 if (dataPoints[0].rem !== undefined) {
                     val = dataPoints.reduce((acc, d) => {
                         return acc + (d.rem || 0) + (d.core || 0) + (d.deep || 0);
                     }, 0);
                 } 
                 // Case B: Raw/Unsummarized (Sum of qty)
                 else {
                     // In raw mode, 'qty' is usually the duration.
                     // Filter out 'InBed' or 'Awake' if possible, otherwise sum all.
                     // Health Auto Export raw often sends: { qty: 15, value: 'REM', ... }
                     val = dataPoints.reduce((acc, d) => {
                         const phase = String(d.value || '').toLowerCase();
                         if (phase.includes('awake') || phase.includes('inbed')) return acc;
                         return acc + (d.qty || 0);
                     }, 0);
                 }
                 label = 'Total Sleep';
            } else {
                // Extract numerical value (handle 'qty' or 'Avg')
                const values = dataPoints.map(d => d.qty || d.Avg || 0);

                if (isSum) {
                    val = values.reduce((a, b) => a + b, 0);
                    label = `Total ${m.name.replace(/_/g, ' ')}`;
                } else {
                    val = values.reduce((a, b) => a + b, 0) / values.length;
                    label = `Avg ${m.name.replace(/_/g, ' ')}`;
                }
            }

            // Formatting
            if (m.name === 'sleep_analysis') {
                 // Format Sleep nicely (always show X.XX hr if possible)
                 if (m.units === 'min' && val > 60) {
                     val = val / 60;
                     m.units = 'hr';
                 }
                 const cleanVal = val.toFixed(2);
                 return `${label} (${timeLabel}) = ${cleanVal}${m.units}`;
            }

            const cleanVal = val % 1 !== 0 ? val.toFixed(1) : val;
            return `${label} (${timeLabel}) = ${cleanVal}${m.units}`;
        }).filter(Boolean);

        if (updates.length > 0) {
            console.log(`♡ [VITAL] ${new Date().toLocaleTimeString()} | >> Received & Saved:`);
            updates.forEach(update => {
                console.log(`         • ${update}`);
            });
        }

        res.json({ status: 'ok', rows_inserted: eventsToInsert.length });

    } catch (err) {
        console.error('[ERROR] Health Sync Failed:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
