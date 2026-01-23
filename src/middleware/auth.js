/**
 * Middleware to protect API routes with a simple API Key.
 * Clients must send 'x-shadow-key' header matching 'SHADOW_KEY' env var.
 */
module.exports = (req, res, next) => {
    const apiKey = req.headers['x-shadow-key'];
    const validKey = process.env.SHADOW_KEY;

    // Exempt specific routes from Auth
    // We check req.originalUrl because this middleware is mounted at '/api', so req.path might be relative.
    if (req.originalUrl.startsWith('/api/gps') || req.originalUrl.startsWith('/api/vital')) {
        return next();
    }

    // Fail safe: If no key is configured on server, block everything to prevent accidental exposure
    if (!validKey) {
        console.error('[SECURITY] SHADOW_KEY not set in environment variables! Blocking request.');
        return res.status(500).json({ error: "Server security misconfiguration." });
    }

    if (!apiKey || apiKey !== validKey) {
        console.warn(`[SECURITY] Unauthorized access attempt from ${req.ip}`);
        console.warn(`[DEBUG] Received Key: '${apiKey ? '***' + apiKey.slice(-3) : 'MISSING'}' | Expected Key: '${validKey ? '***' + validKey.slice(-3) : 'MISSING'}'`);
        return res.status(401).json({ error: "Unauthorized: Invalid Shadow Key" });
    }

    next();
};
