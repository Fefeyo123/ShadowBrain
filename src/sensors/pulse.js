const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const SpotifyWebApi = require('spotify-web-api-node');
const { createClient } = require('@supabase/supabase-js');

// --- THE PULSE SENSOR ---
// Listens to Spotify and logs raw events to The Memory (Supabase).

// 1. Config
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Auth Loop
async function keepAlive() {
    try {
        const data = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(data.body['access_token']);
        // console.log(`[SYSTEM] Token Refreshed.`);
        setTimeout(keepAlive, 55 * 60 * 1000); 
    } catch (err) {
        console.error('[SYSTEM] FATAL: Could not refresh token!', err);
    }
}

// Global state to prevent duplicate logging
let lastTrackId = null;

// 3. The Monitor
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

        // C. Log Event
        const eventData = {
            track: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            genres: genres,
            duration_ms: track.duration_ms,
            popularity: track.popularity,
            is_playing: data.body.is_playing,
            context_uri: track.context ? track.context.uri : null
        };

        console.log(`[PULSE] ${new Date().toLocaleTimeString()} | 🎵 ${eventData.track} - ${eventData.artist}`);

        const { error } = await supabase
            .from('shadow_events')
            .insert({
                source: 'spotify',
                event_type: 'track_played',
                data: eventData
            });

        if (error) {
            console.error('[DB ERROR]', error.message);
        }

    } catch (err) {
        if (err.statusCode === 401) console.error('[ERROR] Token Expired');
        else if (err.code === 'ECONNREFUSED') console.error('[ERROR] No Internet');
        else console.error(`[ERROR]`, err.message);
    }
}

// 4. Start
console.log("--- SHADOW PULSE ONLINE ---");
console.log("Listening for raw audio events (5s interval)...");

keepAlive().then(() => {
    checkPulse();
    setInterval(checkPulse, 5000); 
});