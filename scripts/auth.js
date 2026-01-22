const SpotifyWebApi = require('spotify-web-api-node');
const http = require('http');
require('dotenv').config();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://127.0.0.1:8888/callback'
});

// THE FULL SUITE
const scopes = [
    'user-read-private',            // READS YOUR ACCOUNT STATUS (Premium/Free)
    'user-read-email',              // READS YOUR EMAIL (Verifies you in Dev Mode)
    'user-read-currently-playing',  // READS THE MUSIC
    'user-read-playback-state'      // READS THE VIBE
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  
  if (code) {
    try {
      const data = await spotifyApi.authorizationCodeGrant(code);
      const refreshToken = data.body['refresh_token'];

      console.log('\n==================================================');
      console.log('>>> OMNI-KEY ACQUIRED <<<');
      console.log(`SPOTIFY_REFRESH_TOKEN=${refreshToken}`);
      console.log('==================================================\n');
      
      res.end('Success! You can close this tab.');
      server.close(() => process.exit(0));
    } catch (err) {
      console.error('Error:', err);
      res.end('Error upgrading token.');
    }
  }
});

server.listen(8888, () => {
  // force_dialog: true ensures it asks for the NEW permissions
  const authUrl = spotifyApi.createAuthorizeURL(scopes, 'omni-key', true); 
  console.log('--- FINAL SECURITY UPGRADE ---');
  console.log(`1. Click here: ${authUrl}`);
});