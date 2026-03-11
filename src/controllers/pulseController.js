const supabase = require('../config/supabase');
const SpotifyWebApi = require('spotify-web-api-node');
const pulseService = require('../services/pulseService');

/**
 * Pulse Controller
 * Manages Spotify rhythm data and AI-driven listening insights.
 */

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

/**
 * Helper: Refreshes and sets the Spotify access token
 */
async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.refreshAccessToken();
    spotifyApi.setAccessToken(data.body['access_token']);
  } catch (err) {
    console.error('[PULSE] Token refresh failed:', err.message);
    throw new Error('Spotify authentication failed');
  }
}

/**
 * GET /v1/pulse/status
 * Provides the currently playing track or the most recent track from history.
 */
exports.getStatus = async (req, res) => {
  try {
    await refreshSpotifyToken();
    const nowPlaying = await spotifyApi.getMyCurrentPlayingTrack();
    
    // 1. Handle Active Session
    if (nowPlaying.body?.item && nowPlaying.body.is_playing) {
      const track = nowPlaying.body.item;
      const trackName = track.name;

      // Look for existing AI analysis in the most recent events
      const { data: recentEvents } = await supabase
        .from('shadow_events')
        .select('data')
        .eq('source', 'spotify')
        .eq('event_type', 'track_played')
        .order('timestamp', { ascending: false })
        .limit(10);

      const analysisMatch = recentEvents?.find(e => e.data?.track === trackName);

      return res.json({
        success: true,
        is_playing: true,
        track: trackName,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        album_art: track.album.images[0]?.url || null,
        duration_ms: track.duration_ms,
        progress_ms: nowPlaying.body.progress_ms,
        ai_analysis: analysisMatch?.data?.ai_analysis || null,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Fallback: Get Last Played from Database
    const { data: lastTrack, error } = await supabase
      .from('shadow_events')
      .select('data, timestamp')
      .eq('source', 'spotify')
      .eq('event_type', 'track_played')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (lastTrack) {
      return res.json({
        success: true,
        is_playing: false,
        track: lastTrack.data.track,
        artist: lastTrack.data.artist,
        album: lastTrack.data.album,
        album_art: lastTrack.data.album_art || null,
        ai_analysis: lastTrack.data.ai_analysis || null,
        timestamp: lastTrack.timestamp
      });
    }

    res.json({ success: true, is_playing: false, track: null });

  } catch (err) {
    console.error('[PULSE] Status Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve pulse status' });
  }
};

/**
 * GET /v1/pulse/history
 * Retrieves a list of recent listening events.
 */
exports.getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const { data, error } = await supabase
      .from('shadow_events')
      .select('data, timestamp')
      .eq('source', 'spotify')
      .eq('event_type', 'track_played')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const history = data.map(item => ({
      track: item.data.track,
      artist: item.data.artist,
      album: item.data.album,
      genres: item.data.genres || [],
      ai_analysis: item.data.ai_analysis || null,
      timestamp: item.timestamp
    }));

    res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    console.error('[PULSE] History Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve history' });
  }
};

/**
 * GET /v1/pulse/stats
 * Aggregates listening data from the past 7 days.
 */
exports.getStats = async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: weeklyTracks, error } = await supabase
      .from('shadow_events')
      .select('data, timestamp')
      .eq('source', 'spotify')
      .eq('event_type', 'track_played')
      .gte('timestamp', weekAgo.toISOString());

    if (error) throw error;

    const today = new Date().setHours(0, 0, 0, 0);
    
    const stats = (weeklyTracks || []).reduce((acc, curr) => {
      const { data, timestamp } = curr;
      const ai = data.ai_analysis;
      const isToday = new Date(timestamp) >= today;

      if (isToday) acc.todayCount++;
      acc.totalDuration += data.duration_ms || 0;

      // Aggregate Artists
      const primaryArtist = data.artist?.split(', ')[0] || 'Unknown';
      acc.artists[primaryArtist] = (acc.artists[primaryArtist] || 0) + 1;

      // Aggregate AI Insights
      if (ai?.mood) {
        acc.moods[ai.mood] = (acc.moods[ai.mood] || 0) + 1;
        acc.genres[ai.genre] = (acc.genres[ai.genre] || 0) + 1;
        acc.energySum += ai.energy_level || 5;
        acc.analyzedCount++;
      } else {
        acc.missingAnalysis++;
      }

      return acc;
    }, { 
      todayCount: 0, totalDuration: 0, energySum: 0, analyzedCount: 0, 
      missingAnalysis: 0, artists: {}, moods: {}, genres: {} 
    });

    // Helper to sort and slice top maps
    const getTop = (map, limit = 5) => Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

    res.json({
      success: true,
      tracks_today: stats.todayCount,
      tracks_weekly: weeklyTracks.length,
      weekly_hours: parseFloat((stats.totalDuration / 3600000).toFixed(1)),
      avg_energy: stats.analyzedCount > 0 ? parseFloat((stats.energySum / stats.analyzedCount).toFixed(1)) : null,
      dominant_mood: getTop(stats.moods, 1)[0]?.name || null,
      top_moods: getTop(stats.moods),
      top_ai_genres: getTop(stats.genres),
      top_artists: getTop(stats.artists),
      missing_analysis: stats.missingAnalysis
    });

  } catch (err) {
    console.error('[PULSE] Stats Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate statistics' });
  }
};

/**
 * POST /v1/pulse/retry-ai
 * Manual trigger for the background AI analysis retry job.
 */
exports.triggerRetry = async (req, res) => {
  try {
    const result = await pulseService.retryMissingAnalyses();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[PULSE] Retry Trigger Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to start retry process' });
  }
};