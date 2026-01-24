/**
 * Helper to sum an array of numbers
 */
exports.sumArray = (arr) => {
    if (!arr || !Array.isArray(arr)) return 0;
    return arr.reduce((a, b) => a + (b || 0), 0);
};

/**
 * Helper to average an array of numbers
 */
exports.avgArray = (arr) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return 0;
    return exports.sumArray(arr) / arr.length;
};
