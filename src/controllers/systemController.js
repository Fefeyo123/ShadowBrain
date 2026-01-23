/**
 * System Controller
 * Handles system status and internal logs.
 */

exports.getStatus = (req, res) => {
    res.json({
        system: "ShadowBrain",
        status: "ONLINE",
        timestamp: new Date().toISOString()
    });
};

exports.getConsoleLogs = (req, res) => {
    res.json({
        success: true,
        logs: global.logBuffer || []
    });
};
