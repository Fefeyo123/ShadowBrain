const axios = require('axios');

async function testGPS() {
    console.log("--- SIMULATING TRACCAR CLIENT ---");
    
    // OsmAnd Protocol
    // http://demo.traccar.org:5055/?id=123456&lat={0}&lon={1}&timestamp={2}&hdop={3}&altitude={4}&speed={5}
    
    const BASE_URL = 'http://localhost:3000/api/gps';
    
    const params = {
        id: 'test_iphone_local',
        lat: 51.2194,  // Antwerp Example
        lon: 4.4025,
        speed: 15.5,   // km/h
        batt: 88.0,
        timestamp: Math.floor(Date.now() / 1000) // Traccar sends Unix Timestamp (seconds)
    };

    try {
        console.log(`Sending GET request to ${BASE_URL}...`);
        console.log("Data:", params);

        const response = await axios.get(BASE_URL, { params });
        
        console.log("\n✅ Success! Server responsed:", response.status, response.data);
    } catch (err) {
        console.error("\n❌ Failed:", err.message);
        if (err.response) {
             console.error("Server says:", err.response.data);
        }
    }
}

testGPS();
