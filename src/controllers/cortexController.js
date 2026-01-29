const { getCortexData } = require('../services/screenTimeService');

/**
 * GET /api/cortex
 * Returns consolidated Screen Time data
 */
exports.getCortexData = (req, res) => {
    try {
        const data = getCortexData();
        
        res.json({
            type: 'screen_time',
            source: 'combined', 
            data: data // Contains { totalScreenTime (iphone), mac, pc }
        });
    } catch (err) {
        console.error('[CORTEX ERROR]', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
