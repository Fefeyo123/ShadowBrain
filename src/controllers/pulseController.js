const supabase = require('../config/supabase');
const SpotifyWebApi = require('spotify-web-api-node');
const pulseService = require('../services/pulseService');

/**
 * Pulse Controller
 * Handles Spotify listening data - the rhythm of the system.
 */

// Spotify API instance (shares config with pulseService)
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

// Helper: Ensure fresh token
async function ensureToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body['access_token']);
  } catch (err) {
    console.error('[PULSE] Token refresh failed:', err.message);
    throw err;
  }
}

/**
 * GET /v1/pulse/status
 * Returns current playing track or last played from DB
 */
exports.getStatus = async (req, res) => {
  try {
    await ensureToken();
    
    // Try to get currently playing
    const nowPlaying = await spotifyApi.getMyCurrentPlayingTrack();
    
    if (nowPlaying.body && nowPlaying.body.item && nowPlaying.body.is_playing) {
      const track = nowPlaying.body.item;
      const trackName = track.name;
      const artistName = track.artists.map(a => a.name).join(', ');
      
      // Try to get AI analysis from DB for this specific track
      // Search in the JSONB data field for matching track name
      const { data: dbTrack } = await supabase
        .from('shadow_events')
        .select('data')
        .eq('source', 'spotify')
        .eq('event_type', 'track_played')
        .order('timestamp', { ascending: false })
        .limit(5);
      
      // Find matching track in recent entries
      let aiAnalysis = null;
      if (dbTrack && dbTrack.length > 0) {
        const match = dbTrack.find(t => t.data?.track === trackName);
        aiAnalysis = match?.data?.ai_analysis || null;
      }
      
      return res.json({
        is_playing: true,
        track: trackName,
        artist: artistName,
        album: track.album.name,
        album_art: track.album.images[0]?.url || null,
        duration_ms: track.duration_ms,
        progress_ms: nowPlaying.body.progress_ms,
        ai_analysis: aiAnalysis,
        timestamp: new Date().toISOString()
      });
    }

    // Fallback: Get last played from database
    const { data: lastTrack } = await supabase
      .from('shadow_events')
      .select('data, timestamp')
      .eq('source', 'spotify')
      .eq('event_type', 'track_played')
      .order('timestamp', { ascending: false })
      .limit(1);

    if (lastTrack && lastTrack.length > 0) {
      const event = lastTrack[0];
      return res.json({
        is_playing: false,
        track: event.data.track,
        artist: event.data.artist,
        album: event.data.album,
        album_art: event.data.album_art || null,
        duration_ms: event.data.duration_ms,
        progress_ms: null,
        ai_analysis: event.data.ai_analysis || null,
        timestamp: event.timestamp
      });
    }

    // No data at all
    res.json({
      is_playing: false,
      track: null,
      artist: null,
      album: null,
      ai_analysis: null,
      timestamp: null
    });

  } catch (err) {
    console.error('[PULSE] Status Error:', err.message);
    res.status(500).json({ error: 'Failed to get pulse status' });
  }
};

/**
 * GET /v1/pulse/history
 * Returns recent track play events with AI analysis
 */
exports.getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const { data: tracks, error } = await supabase
      .from('shadow_events')
      .select('data, timestamp')
      .eq('source', 'spotify')
      .eq('event_type', 'track_played')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const history = (tracks || []).map(t => ({
      track: t.data.track,
      artist: t.data.artist,
      album: t.data.album,
      genres: t.data.genres || [],
      duration_ms: t.data.duration_ms,
      ai_analysis: t.data.ai_analysis || null,
      timestamp: t.timestamp
    }));

    res.json({ data: history });

  } catch (err) {
    console.error('[PULSE] History Error:', err.message);
    res.status(500).json({ error: 'Failed to get pulse history' });
  }
};

/**
 * GET /v1/pulse/stats
 * Returns aggregated listening statistics with AI insights
 */
exports.getStats = async (req, res) => {
  try {
    // Get all tracks from last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: weeklyTracks, error } = await supabase
      .from('shadow_events')
      .select('data, timestamp')
      .eq('source', 'spotify')
      .eq('event_type', 'track_played')
      .gte('timestamp', weekAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (error) throw error;

    const tracks = weeklyTracks || [];
    
    // Today's tracks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTracks = tracks.filter(t => new Date(t.timestamp) >= today);

    // Aggregations
    const moodCounts = {};
    const aiGenreCounts = {};
    const artistCounts = {};
    let totalEnergy = 0;
    let tracksWithAnalysis = 0;
    let missingAnalysis = 0;
    let totalDuration = 0;

    tracks.forEach(t => {
      const data = t.data;
      const ai = data.ai_analysis;
      
      // AI Analysis aggregation
      if (ai && ai.mood) {
        tracksWithAnalysis++;
        totalEnergy += ai.energy_level || 5;
        
        // Mood counts
        if (ai.mood) {
          moodCounts[ai.mood] = (moodCounts[ai.mood] || 0) + 1;
        }
        
        // AI Genre counts
        if (ai.genre) {
          aiGenreCounts[ai.genre] = (aiGenreCounts[ai.genre] || 0) + 1;
        }
      } else {
        missingAnalysis++;
      }
      
      // Artists
      const artist = data.artist?.split(', ')[0] || 'Unknown';
      artistCounts[artist] = (artistCounts[artist] || 0) + 1;
      
      // Duration
      totalDuration += data.duration_ms || 0;
    });

    // Sort and get top moods
    const topMoods = Object.entries(moodCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Sort and get top AI genres
    const topAiGenres = Object.entries(aiGenreCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Sort and get top 5 artists
    const topArtists = Object.entries(artistCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Average energy
    const avgEnergy = tracksWithAnalysis > 0 
      ? (totalEnergy / tracksWithAnalysis).toFixed(1) 
      : null;

    // Total listening time
    const totalMinutes = Math.round(totalDuration / 60000);
    const weeklyHours = (totalMinutes / 60).toFixed(1);

    res.json({
      tracks_today: todayTracks.length,
      tracks_weekly: tracks.length,
      weekly_hours: parseFloat(weeklyHours),
      avg_energy: avgEnergy ? parseFloat(avgEnergy) : null,
      dominant_mood: topMoods[0]?.name || null,
      top_moods: topMoods,
      top_ai_genres: topAiGenres,
      top_artists: topArtists,
      missing_analysis: missingAnalysis
    });

  } catch (err) {
    console.error('[PULSE] Stats Error:', err.message);
    res.status(500).json({ error: 'Failed to get pulse stats' });
  }
};

/**
 * POST /v1/pulse/retry-ai
 * Triggers background process to retry missing AI analysis
 */
exports.triggerRetry = async (req, res) => {
  try {
    const result = await pulseService.retryMissingAnalyses();
    res.json(result);
  } catch (err) {
    console.error('[PULSE] Trigger Retry Error:', err.message);
    res.status(500).json({ error: 'Failed to trigger retry' });
  }
};
