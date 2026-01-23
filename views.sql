-- ==========================================
-- SHADOW PULSE VIEWS
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. HEART RATE (Exploded)
-- Turns the batched JSON arrays into a simple Timeline Table
-- Output: | timestamp | bpm | source |
CREATE OR REPLACE VIEW view_heart_rate AS
SELECT 
    COALESCE(
        (reading->>'date')::timestamptz,
        (reading->>'startDate')::timestamptz
    ) as timestamp,
    -- Check 'qty' (Raw) OR 'Avg' (Summarized) OR 'value' (Generic)
    COALESCE(
        (reading->>'qty')::numeric, 
        (reading->>'Avg')::numeric,
        (reading->>'value')::numeric
    ) as bpm,
    parent.source
FROM shadow_events parent,
LATERAL jsonb_array_elements(parent.data->'data') reading
WHERE parent.event_type = 'heart_rate'
ORDER BY timestamp DESC;

-- 2. PULSE (Music History)
-- Simple extraction of the track data
-- Output: | timestamp | track | artist | album | popularity |
CREATE OR REPLACE VIEW view_pulse_history AS
SELECT 
    timestamp,
    data->>'track' as track,
    data->>'artist' as artist,
    data->>'album' as album,
    (data->>'popularity')::int as popularity,
    (data->>'duration_ms')::int as duration_ms,
    source
FROM shadow_events
WHERE event_type = 'track_played'
ORDER BY timestamp DESC;

-- 3. SLEEP TIMELINE (Detailed)
-- Explodes the sleep segments so you can graph them like a Gantt chart
-- Output: | start_time | end_time | phase | duration_hours |
CREATE OR REPLACE VIEW view_sleep_timeline AS
SELECT 
    (reading->>'startDate')::timestamptz as start_time,
    (reading->>'endDate')::timestamptz as end_time,
    reading->>'value' as phase, -- 'REM', 'Core', 'Deep', 'Awake'
    (reading->>'qty')::numeric as duration_hours,
    parent.source
FROM shadow_events parent,
LATERAL jsonb_array_elements(parent.data->'data') reading
WHERE parent.event_type = 'sleep_analysis'
ORDER BY start_time DESC;

-- 4. DAILY SLEEP SUMMARY
-- Aggregates the raw segments into a Daily Total (Logic matches vital.js)
-- Output: | date | total_hours | rem_hours | deep_hours |
CREATE OR REPLACE VIEW view_sleep_daily AS
SELECT 
    parent.timestamp::date as sleep_date,
    SUM((reading->>'qty')::numeric) FILTER (WHERE reading->>'value' NOT IN ('Awake', 'InBed')) as total_hours,
    SUM((reading->>'qty')::numeric) FILTER (WHERE reading->>'value' = 'REM') as rem_hours,
    SUM((reading->>'qty')::numeric) FILTER (WHERE reading->>'value' = 'Deep') as deep_hours,
    SUM((reading->>'qty')::numeric) FILTER (WHERE reading->>'value' = 'Core') as core_hours
FROM shadow_events parent,
LATERAL jsonb_array_elements(parent.data->'data') reading
WHERE parent.event_type = 'sleep_analysis'
GROUP BY parent.timestamp::date;

-- 5. UNIVERSAL HEALTH METRICS (The "Everything" Table)
-- Good for: Steps, Calories, Distance, Oxygen, etc.
-- Output: | timestamp | type | value | unit | source |
CREATE OR REPLACE VIEW view_health_metrics AS
SELECT 
    COALESCE(
        (reading->>'date')::timestamptz,
        (reading->>'startDate')::timestamptz
    ) as timestamp,
    parent.event_type as type,
    COALESCE(
        (reading->>'qty')::numeric, 
        (reading->>'Avg')::numeric,
        (reading->>'value')::numeric
    ) as value,
    parent.data->>'units' as unit,
    parent.source
FROM shadow_events parent,
LATERAL jsonb_array_elements(parent.data->'data') reading
WHERE parent.event_type NOT IN ('sleep_analysis', 'track_played') -- Exclude complex types
ORDER BY timestamp DESC;

-- 6. HOURLY SUMMARY (Frontend Friend)
-- Aggregates the 64,000 raw points into clean hourly chunks.
-- Output: | hour | type | avg_value | total_value | unit |
CREATE OR REPLACE VIEW view_health_hourly AS
SELECT 
    date_trunc('hour', timestamp) as hour,
    type,
    AVG(value)::numeric(10,2) as avg_value,   -- Useful for Heart Rate
    SUM(value)::numeric(10,2) as total_value, -- Useful for Steps/Calories
    MAX(unit) as unit
FROM view_health_metrics
GROUP BY 1, 2

-- 7. LOCATION HISTORY (Traccar)
-- Output: | timestamp | lat | lon | speed | battery | device |
CREATE OR REPLACE VIEW view_location_history AS
SELECT 
    timestamp,
    (data->>'lat')::numeric as lat,
    (data->>'lon')::numeric as lon,
    (data->>'speed')::numeric as speed_kph,
    (data->>'battery')::numeric as battery_level,
    source as device_id
FROM shadow_events
WHERE event_type = 'location'
ORDER BY timestamp DESC;
