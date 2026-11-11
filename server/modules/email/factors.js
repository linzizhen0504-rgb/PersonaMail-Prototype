// The factor choices of a task and the model's pick of factors for a request.

// The choices as simple id -> value pairs (the first option of each factor)
function filterFactorChoices(factorChoices) {
    const filtered = {};
    for (const [factorId, factorData] of Object.entries(factorChoices)) {
        if (factorData.options && factorData.options.length > 0) filtered[factorId] = factorData.options[0].value;
    }
    return filtered;
}

// Keep what is a real factor with a real option; a single factor keeps one value
function cleanFactorSelection(raw, catalog) {
    const selectedFactors = {};
    const selectedValues = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { selectedFactors, selectedValues };
    for (const factor of catalog) {
        if (!(factor.id in raw)) continue;
        const allowed = factor.options.map(option => option.value);
        const given = Array.isArray(raw[factor.id]) ? raw[factor.id] : [raw[factor.id]];
        const values = [...new Set(given.filter(value => allowed.includes(value)))];
        if (values.length === 0) continue;
        selectedFactors[factor.id] = true;
        selectedValues[factor.id] = factor.select_type === 'single' ? values[0] : values;
    }
    return { selectedFactors, selectedValues };
}

module.exports = { filterFactorChoices, cleanFactorSelection };
