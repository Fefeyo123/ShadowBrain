const { getCortexData } = require('../services/screenTimeService');

/**
 * GET /api/cortex
 * Returns consolidated Screen Time data across all tracked devices.
 */
exports.getCortexData = (req, res) => {
    try {
        const data = getCortexData();

        // Check if data exists (service might still be initializing)
        if (!data) {
            return res.status(404).json({
                success: false,
                error: 'No screen time data available'
            });
        }

        return res.status(200).json({
            success: true,
            type: 'screen_time',
            source: 'combined',
            data // Contains { totalScreenTime (iphone), mac, pc }
        });

    } catch (err) {
        console.error('[CORTEX ERROR] Failed to fetch cortex data:', err.message);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal Server Error' 
        });
    }
};