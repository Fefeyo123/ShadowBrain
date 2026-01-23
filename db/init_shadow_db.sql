-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create the Event Bus Table
CREATE TABLE IF NOT EXISTS shadow_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(50) NOT NULL,    -- 'spotify', 'github', 'health'
    event_type VARCHAR(50) NOT NULL, -- 'track_played', 'commit_pushed'
    data JSONB NOT NULL
);

-- 2. Performance Indexes (The Brain's Lookup Paths)
CREATE INDEX IF NOT EXISTS idx_shadow_events_time ON shadow_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_events_source ON shadow_events(source, event_type);

-- 3. Security (Allow Scripts to Write)
ALTER TABLE shadow_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow Anon/ServiceRole to INSERT data
CREATE POLICY "Enable insert for everyone" ON shadow_events
    FOR INSERT 
    WITH CHECK (true);

-- Policy: Allow Everyone to READ (for now, simplify debugging)
CREATE POLICY "Enable select for everyone" ON shadow_events
    FOR SELECT
    USING (true);
