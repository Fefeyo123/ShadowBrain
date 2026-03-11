const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_KEY in environment variables.');
}

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_KEY || ''
);

module.exports = supabase;
