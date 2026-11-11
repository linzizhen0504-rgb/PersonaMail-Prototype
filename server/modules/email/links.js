// Links between the components of an email and the intents that shape them.
const { normalizeName } = require('./names');

// Keep only links that point at a real component and a real intent, with exact ids and names
function cleanLinks(links, componentList, intents) {
    if (!Array.isArray(links)) return [];
    const componentIds = new Map();
    componentList.forEach(component => {
        componentIds.set(normalizeName(component.id), component.id);
        if (component.title) componentIds.set(normalizeName(component.title), component.id);
    });
    const dimensions = new Map(intents.map(intent => [normalizeName(intent.dimension), intent.dimension]));
    const seen = new Set();
    const cleaned = [];
    links.forEach(link => {
        if (!link || !link.component_id || !link.intent_dimension) return;
        const componentId = componentIds.get(normalizeName(link.component_id));
        const dimension = dimensions.get(normalizeName(link.intent_dimension));
        if (!componentId || !dimension || seen.has(`${componentId}|${dimension}`)) return;
        seen.add(`${componentId}|${dimension}`);
        cleaned.push({ intent_dimension: dimension, component_id: componentId });
    });
    return cleaned;
}

// Make sure every component has at least one intent: ask the model again for the components it left out,
// then fall back to the most widely used intent for any that are still missing
const ensureEveryComponentLinked = (requestJson) => async (links, componentList, intents) => {
    if (intents.length === 0) return links;
    const missing = () => componentList.filter(component => !links.some(link => link.component_id === component.id));

    if (missing().length > 0) {
        const prompt = `You are an AI assistant specializing in email communication strategy.

Each email component below must be linked to the writing intents that most influence how it is written.

Components:
${JSON.stringify(missing(), null, 2)}

Intents:
${JSON.stringify(intents.map(intent => ({ dimension: intent.dimension, current_value: intent.current_value })), null, 2)}

For EVERY component, choose the 1 or 2 intents whose strategy most affects that component's wording. Every component must appear at least once. Use the exact "id" of the component and the exact "dimension" of the intent.

Return ONLY a JSON array, with no commentary:
[{"intent_dimension": "...", "component_id": "..."}]`;
        try {
            const extra = await requestJson(prompt, {}, Array.isArray, 2);
            links = cleanLinks([...links, ...extra], componentList, intents);
        } catch (error) {
            console.error('Could not link the remaining components:', error.message);
        }
    }

    const stillMissing = missing();
    if (stillMissing.length > 0) {
        const counts = new Map(intents.map(intent => [intent.dimension, 0]));
        links.forEach(link => counts.set(link.intent_dimension, (counts.get(link.intent_dimension) || 0) + 1));
        const fallback = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        stillMissing.forEach(component => links.push({ intent_dimension: fallback, component_id: component.id }));
    }
    return links;
};

module.exports = { cleanLinks, ensureEveryComponentLinked };
