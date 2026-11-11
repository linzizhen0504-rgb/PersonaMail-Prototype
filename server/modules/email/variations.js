// The versions of a component, one per value of an intent, as the model returns them.
const { normalizeName } = require('./names');

// Write each label as the value was given (the model may change case or underscores)
function alignVariationValues(parsedData, intentSelected) {
    const variations = parsedData && parsedData.component_variations;
    if (!Array.isArray(variations) || !intentSelected) return parsedData;
    const expected = [intentSelected.current_value, ...(intentSelected.other_values || [])];
    const byName = new Map(expected.map(value => [normalizeName(value), value]));
    variations.forEach(variation => {
        variation.intent_value = byName.get(normalizeName(variation.intent_value)) || variation.intent_value;
    });
    return parsedData;
}

// The model has to label every version with exactly one of the intent values it was asked about. Small local models
// often copy the template's placeholder names instead; guessing the value from the position then attaches a version
// to the wrong value, so such replies are rejected. A version may be empty (a value that says to leave the sentence out has
// nothing to show); the caller drops such versions.
function variationsMatchValues(parsedData, expectedValues) {
    const variations = parsedData && parsedData.component_variations;
    if (!Array.isArray(variations) || variations.length !== expectedValues.length) return false;
    const wanted = new Set(expectedValues.map(normalizeName));
    const seen = new Set();
    return variations.every(variation => {
        if (!variation || typeof variation.content !== 'string') return false;
        const key = normalizeName(variation.intent_value);
        if (!wanted.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = { alignVariationValues, variationsMatchValues };
