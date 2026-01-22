require('dotenv').config();
const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
});

async function identify() {
    try {
        // 1. Refresh Token to ensure we are live
        const data = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(data.body['access_token']);

        // 2. Ask Spotify: "Who is this token for?"
        const me = await spotifyApi.getMe();
        
        console.log("\n=== IDENTITY VERIFIED ===");
        console.log(`User:   ${me.body.display_name}`);
        console.log(`Email:  ${me.body.email}`); // <--- THIS IS THE KEY
        console.log(`Status: ${me.body.product}`); // Free vs Premium
        console.log(`ID:     ${me.body.id}`);
        console.log("=======================\n");

        if (me.body.product !== 'premium') {
            console.log("⚠️ WARNING: You are on a FREE account. The API often restricts playback data for free users.");
        }

    } catch (err) {
        console.log("\n=== IDENTITY CHECK FAILED ===");
        console.log("The Shadow cannot see you at all.");
        console.log("Error:", err.statusCode, err.message);
        
        if (err.statusCode === 403) {
            console.log("\n>>> SOLUTION: The email you added to the Dashboard does NOT match the account generating the token.");
            console.log("Check the email you used to login just now.");
        }
    }
}

identify();