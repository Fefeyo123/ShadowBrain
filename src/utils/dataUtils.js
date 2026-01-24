/**
 * Pivot "Struct of Arrays" to "Array of Structs"
 * Commonly used for OpenMeteo responses.
 */
exports.pivotArrays = (sourceObj) => {
    if (!sourceObj || !sourceObj.time || !Array.isArray(sourceObj.time)) {
        return [];
    }
    
    const keys = Object.keys(sourceObj);
    const length = sourceObj.time.length;
    const result = [];

    for (let i = 0; i < length; i++) {
        const item = {};
        keys.forEach(key => {
            if (Array.isArray(sourceObj[key])) {
                item[key] = sourceObj[key][i];
            }
        });
        result.push(item);
    }
    return result;
};
