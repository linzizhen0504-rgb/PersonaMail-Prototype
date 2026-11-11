// Reading json out of what a model said, and asking again when it cannot be used. Knows nothing about a provider.

// Parse JSON from a model reply that may be wrapped in code fences, surrounded by prose,
// or markdown-escaped (e.g. `\[` and `current\_value`)
function parseModelJson(text) {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const unescaped = cleaned.replace(/\\([[\]_*])/g, '$1');
    const candidates = [];
    for (const candidate of [cleaned, unescaped]) {
        candidates.push(candidate);
        const start = candidate.search(/[[{]/);
        const end = Math.max(candidate.lastIndexOf(']'), candidate.lastIndexOf('}'));
        if (start !== -1 && end > start) candidates.push(candidate.slice(start, end + 1));
    }
    let lastError;
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

// Ask the model and parse its reply as JSON, asking again when the reply is not usable.
// validate(parsed) -> boolean says whether the shape is what the caller needs.
const createJsonRequester = (llm) => async (prompt, options, validate, attempts = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const responseText = await llm.generateText(prompt, options);
            if (!responseText) throw new Error('AI response is empty');
            const parsed = parseModelJson(responseText);
            if (validate && !validate(parsed)) throw new Error('AI response has an unexpected shape');
            return parsed;
        } catch (error) {
            lastError = error;
            console.error(`Model JSON request failed (attempt ${attempt}/${attempts}):`, error.message);
        }
    }
    throw lastError;
};

module.exports = { parseModelJson, createJsonRequester };
