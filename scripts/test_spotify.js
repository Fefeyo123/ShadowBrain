const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

console.log("Testing Spotify Token Refresh...");
console.log("Client ID:", process.env.SPOTIFY_CLIENT_ID ? "SET" : "MISSING");
console.log("Refresh Token:", process.env.SPOTIFY_REFRESH_TOKEN ? "SET" : "MISSING");

spotifyApi.refreshAccessToken().then(
  function(data) {
    console.log('The access token has been refreshed!');
    console.log('Access token is valid.');
    // console.log('Access token:', data.body['access_token']);
  },
  function(err) {
    console.error('Could not refresh access token', err);
  }
);
