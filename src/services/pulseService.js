const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const SpotifyWebApi = require('spotify-web-api-node');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

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
  geminiModel = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" },
      safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
  });
  console.log("∿ [PULSE] Neural Analysis ENABLED (Gemini 2.0 Flash JSON Mode)");
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
async function fetchExistingAnalysis(trackName, artistName) {
    try {
        const { data } = await supabase
            .from('shadow_events')
            .select('data')
            .eq('source', 'spotify')
            .eq('event_type', 'track_played')
            .eq('data->>track', trackName)
            .eq('data->>artist', artistName)
            .limit(20);
            
        if (data) {
            const match = data.find(r => r.data && r.data.ai_analysis && r.data.ai_analysis.mood);
            if (match) return match.data.ai_analysis;
        }
    } catch (e) {
        console.warn(`[WARN] Could not fetch existing analysis: ${e.message}`);
    }
    return null;
}

async function analyzeTrack(track, artist, genres) {
    if (!geminiModel) return null;
    
    try {
        const genreHint = genres.length > 0 ? `Known genres: ${genres.join(', ')}. ` : '';
        
        const prompt = `You are an expert music data analyzer. Analyze the following song and provide its energy level, primary genre, and mood.
If you do not recognize the specific song, make your best highly educated guess based on the artist and genres. Always return a valid JSON object, do not apologize or explain.

Song: "${track}"
Artist: ${artist}
${genreHint}

Output ONLY valid JSON matching this exact structure:
{
  "energy_level": <integer from 1 to 10>,
  "genre": "<string, max 2 words>",
  "mood": "<string, exactly one descriptive word (e.g., Euphoric, Melancholic, Chill, Energetic, Dark, Funky, etc.)>"
}`;

        const result = await geminiModel.generateContent(prompt);
        const response = result.response.text();
        
        // Extra check because Gemini sometimes throws error directly as response rather than rejection
        let jsonStr = response.trim();
        
        // Fix for sometimes returning markdown blocks inside the parsed output
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        
        if (start !== -1 && end !== -1) {
            jsonStr = jsonStr.substring(start, end + 1);
        } else {
            console.warn(`   [WARN] AI returned non-JSON array: ${jsonStr.substring(0, 100)}...`);
            return null;
        }
        
        const analysis = JSON.parse(jsonStr);
        
        // Validate and clamp fields to ensure expected output shape
        analysis.energy_level = Math.max(1, Math.min(10, parseInt(analysis.energy_level) || 5));
        analysis.genre = typeof analysis.genre === 'string' && analysis.genre.trim() ? analysis.genre.trim() : "Unknown";
        analysis.mood = typeof analysis.mood === 'string' && analysis.mood.trim() ? analysis.mood.trim() : "Neutral";
        
        return analysis;
        
    } catch (err) {
        console.warn(`   [WARN] AI Analysis failed for "${track}": ${err.message}`);
        // Log more details if available
        if (err.status) console.warn(`   [WARN] Status: ${err.status}`);
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
            let analysis = await fetchExistingAnalysis(trackName, artistName);
            
            if (analysis) {
                console.log(`∿ [PULSE] Reused existing AI analysis for: ${trackName}`);
            } else {
                analysis = await analyzeTrack(trackName, artistName, genres);
            }
            
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

let isRetrying = false;

// 6. Retry System
async function retryMissingAnalyses() {
    if (isRetrying) {
        console.log("∿ [PULSE] Retry job already running. Skipping.");
        return { success: true, message: "Job already running", started: false };
    }
    
    if (!geminiModel) {
        console.warn("∿ [PULSE] Cannot retry: Gemini AI is disabled.");
        return { success: false, message: "Gemini AI is disabled" };
    }
    
    isRetrying = true;
    console.log("∿ [PULSE] Starting background retry for missing AI analyses...");
    
    // Run in background instead of blocking the request
    (async () => {
        try {
            // Fetch tracks from the last 7 days to match dashboard stats perfectly
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            const { data: rows, error } = await supabase
                .from('shadow_events')
                .select('id, data, timestamp')
                .eq('source', 'spotify')
                .eq('event_type', 'track_played')
                .gte('timestamp', weekAgo.toISOString())
                .order('timestamp', { ascending: false });

            if (error || !rows) {
                console.error('[PULSE] Retry fetch error:', error?.message);
                return;
            }

            const missing = rows.filter(r => !r.data.ai_analysis || !r.data.ai_analysis.mood);
            console.log(`∿ [PULSE] Found ${missing.length} tracks missing analysis.`);

            for (const row of missing) {
                const trackName = row.data.track;
                const artistName = row.data.artist;
                const genres = row.data.genres || [];
                
                let analysis = await fetchExistingAnalysis(trackName, artistName);
                let hitApi = false;
                
                if (analysis) {
                    console.log(`∿ [PULSE] Reusing existing analysis for: ${trackName}`);
                } else {
                    console.log(`∿ [PULSE] Retrying AI analysis from API for: ${trackName} // ${artistName}`);
                    analysis = await analyzeTrack(trackName, artistName, genres);
                    hitApi = true;
                }
                
                if (analysis) {
                    const updatedData = { ...row.data, ai_analysis: analysis };
                    await supabase
                        .from('shadow_events')
                        .update({ data: updatedData })
                        .eq('id', row.id);
                    console.log(`∿ [PULSE] Successfully updated analysis for: ${trackName}`);
                }
                
                // Sleep 4 seconds to respect rate limits ONLY if we hit the API
                if (hitApi) {
                    await new Promise(resolve => setTimeout(resolve, 4000));
                }
            }
            console.log("∿ [PULSE] Background retry job completed.");
        } catch (err) {
            console.error('[PULSE] Retry job error:', err.message);
        } finally {
            isRetrying = false;
        }
    })();
    
    return { success: true, message: "Retry job started", started: true };
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

module.exports = { startPulseSensor, retryMissingAnalyses };