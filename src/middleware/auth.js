const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const apiKey = req.headers['x-shadow-key'];
    const validKey = process.env.SHADOW_KEY;

    // 1. Exempt specific ingest routes
    if (req.originalUrl.startsWith('/api/gps') || req.originalUrl.startsWith('/api/vital') || req.originalUrl.startsWith('/api/vector')) {
        return next();
    }

    // 2. API Key Check (Machine-to-Machine security)
    if (!validKey) {
        console.error('[SECURITY] SHADOW_KEY not set! Blocking request.');
        return res.status(500).json({ error: "Server security misconfiguration." });
    }

    if (!apiKey || apiKey !== validKey) {
        return res.status(401).json({ error: "Unauthorized: Invalid Shadow Key" });
    }

    // 3. JWT User Session Check (For WebAuthn/Dashboard actions)
    // Extract token from cookies (requires cookie-parser middleware in index.js)
    const token = req.cookies?.auth_token; 
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded; // Attaches { id: 'admin' } to the request
        } catch (err) {
            console.warn('[SECURITY] Invalid JWT token provided');
            // We don't immediately fail here; some routes might only need the API key
        }
    } else {
        // Fallback for single-user system: if they have the right API key, treat as admin
        req.user = { id: 'admin' };
    }

    next();
};