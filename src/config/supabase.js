const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_KEY in environment variables.');
    // We don't exit here to allow the app to start even if DB is misconfigured (for partial functionality),
    // but in a strict environment, we might want to process.exit(1).
}

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || ''
);

module.exports = supabase;
