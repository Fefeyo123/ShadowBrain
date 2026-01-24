-- Create a table to store the single latest weather snapshot
-- This ensures we don't accumulate history, just query the "current" state.

CREATE TABLE IF NOT EXISTS weather_current (
    id INT PRIMARY KEY DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    location JSONB, -- Snapshot of Lat/Lon used
    data JSONB,     -- The full parsed weather object
    CONSTRAINT single_row_const CHECK (id = 1)
);

-- Initialize with empty row if not exists, so updates work immediately
INSERT INTO weather_current (id, updated_at, location, data)
VALUES (1, NOW(), '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Grant permissions (matching init_shadow_db.sql style)
ALTER TABLE weather_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert/update for anon/service_role" ON weather_current
    FOR ALL
    USING (true)
    WITH CHECK (true);
