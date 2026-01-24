const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const SpotifyWebApi = require('spotify-web-api-node');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- THE PULSE SENSOR ---
// Listens to Spotify, logs events, and analyzes tracks with AI.

// 1. Config
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Gemini AI (optional - graceful fallback if no key)
let genAI = null;
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  console.log("∿ [PULSE] Neural Analysis ENABLED (Gemini 2.0 Flash)");
} else {
  console.warn("∿ [PULSE] Neural Analysis DISABLED (No GEMINI_API_KEY)");
}

// 2. Auth Loop
async function keepAlive() {
    try {
        const data = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(data.body['access_token']);
        setTimeout(keepAlive, 55 * 60 * 1000); 
    } catch (err) {
        console.error('[SYSTEM] FATAL: Could not refresh token!', err.body || err.message);
        throw err;
    }
}

// Global state to prevent duplicate logging
let lastTrackId = null;

// 3. Neural Analysis (Gemini)
async function analyzeTrack(track, artist, genres) {
    if (!geminiModel) return null;
    
    try {
        const genreHint = genres.length > 0 ? `Known genres: ${genres.join(', ')}. ` : '';
        
        const prompt = `Analyze this song for a music dashboard. Song: "${track}" by ${artist}. ${genreHint}
Return ONLY valid JSON with no markdown: {"energy_level": <number 1-10>, "genre": "<one primary genre>", "mood": "<one descriptive word like Euphoric, Melancholic, Aggressive, Chill, Dreamy, Intense, Peaceful, Dark, etc>"}`;

        const result = await geminiModel.generateContent(prompt);
        const response = result.response.text();
        
        // Parse JSON from response (handle potential markdown wrapping)
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }
        
        const analysis = JSON.parse(jsonStr);
        
        // Validate and clamp energy_level
        analysis.energy_level = Math.max(1, Math.min(10, parseInt(analysis.energy_level) || 5));
        return analysis;
        
    } catch (err) {
        console.warn(`   [WARN] AI Analysis failed: ${err.message}`);
        return null;
    }
}

// 4. The Monitor
async function checkPulse() {
    try {
        // A. Get Track
        const data = await spotifyApi.getMyCurrentPlayingTrack();
        
        // Silent return if nothing playing
        if (!data.body || !data.body.item || data.body.item.type !== 'track' || !data.body.is_playing) return;

        const track = data.body.item;
        
        // DEDUPLICATION: Only log if track changed
        if (track.id === lastTrackId) return;
        lastTrackId = track.id;

        // B. Context (Artist Genres)
        let genres = [];
        try {
            const artistId = track.artists[0].id;
            const artistData = await spotifyApi.getArtist(artistId);
            genres = artistData.body.genres || [];
        } catch (e) {
            console.warn(`[WARN] Could not fetch artist genres: ${e.message}`);
        }

        // C. Build Event Data
        const trackName = track.name;
        const artistName = track.artists.map(a => a.name).join(', ');
        
        const eventData = {
            track: trackName,
            artist: artistName,
            album: track.album.name,
            album_art: track.album.images[0]?.url || null,
            genres: genres,
            duration_ms: track.duration_ms,
            popularity: track.popularity,
            is_playing: data.body.is_playing,
            context_uri: track.context ? track.context.uri : null,
            // AI fields (will be updated async)
            ai_analysis: null
        };

        console.log(`∿ [PULSE] ${new Date().toLocaleTimeString()} | >> ${eventData.track} // ${eventData.artist}`);

        // D. Insert to Database
        const { error } = await supabase
            .from('shadow_events')
            .insert({
                source: 'spotify',
                event_type: 'track_played',
                data: eventData
            });

        if (error) {
            console.error('[DB ERROR]', error.message);
            return;
        }

        // E. AI Analysis (async, updates same row)
        if (geminiModel) {
            const analysis = await analyzeTrack(trackName, artistName, genres);
            
            if (analysis) {
                // First, find the row we just inserted
                const { data: rows, error: selectError } = await supabase
                    .from('shadow_events')
                    .select('id, data')
                    .eq('source', 'spotify')
                    .eq('event_type', 'track_played')
                    .order('timestamp', { ascending: false })
                    .limit(1);
                
                if (selectError || !rows || rows.length === 0) {
                    console.error('[DB SELECT ERROR]', selectError?.message || 'No rows found');
                    return;
                }
                
                const rowId = rows[0].id;
                const existingData = rows[0].data || {};
                
                // Merge AI analysis into existing data
                const updatedData = { ...existingData, ai_analysis: analysis };
                
                // Update the row by ID
                const { data: updateResult, error: updateError } = await supabase
                    .from('shadow_events')
                    .update({ data: updatedData })
                    .eq('id', rowId)
                    .select();
            }
        }

    } catch (err) {
        if (err.statusCode === 401) { 
            console.error('[ERROR] Token Expired - Attempting immediate refresh...');
            keepAlive().catch(e => console.error("Immediate refresh failed", e));
        }
        else if (err.code === 'ECONNREFUSED') console.error('[ERROR] No Internet');
        else console.error(`[ERROR]`, err.message);
    }
}

// 5. Start Function
function startPulseSensor() {
    console.log("∿∿∿ SHADOW PULSE ONLINE ∿∿∿");

    keepAlive().then(() => {
        checkPulse();
        setInterval(checkPulse, 5000); 
    }).catch(err => {
        console.error("[SYSTEM] Pulse Sensor failed to start due to Auth Error.");
    });
}

module.exports = { startPulseSensor };