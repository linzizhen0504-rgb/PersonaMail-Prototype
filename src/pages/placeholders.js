// [Bracketed] information a draft asks the writer to fill in, e.g. [Your Name] or [Project Name / Course Code].
// A bracket that joins several items with " / " is split into one field per item, and a field that occurs in several
// places (also inside such a bracket) is one field, so the writer fills in each piece of information only once.
const PLACEHOLDER_PATTERN = /\[[^[\]\n]{1,60}\]/g;

const clean = (text) => text.replace(/\s+/g, ' ').trim();
const placeholderKey = (label) => clean(label).toLowerCase();

// Keys of the brackets that do not contain a slash: evidence that a slash without spaces, as in [Course Name/Section
// Number], separates two fields when one side is such a field. [Position/Role] stays one field.
export const knownPlaceholderKeys = (text) => {
    const keys = new Set();
    (text.match(PLACEHOLDER_PATTERN) || []).forEach(match => {
        const inner = match.slice(1, -1);
        if (!inner.includes('/')) keys.add(placeholderKey(inner));
    });
    return keys;
};

// The pieces of one bracket's text, names at even and separators at odd positions; null when it is a single field
const splitPlaceholder = (inner, known) => {
    const pieces = inner.split(/(\s*\/\s*)/);
    if (pieces.length < 3) return null;
    const names = pieces.filter((_, i) => i % 2 === 0).map(clean);
    if (names.some(name => !name)) return null;
    const spaced = pieces.filter((_, i) => i % 2 === 1).every(separator => /^\s+\/\s+$/.test(separator));
    return spaced || names.some(name => known.has(placeholderKey(name))) ? { pieces, names } : null;
};

// The fields of a draft in order of first appearance: [{ key, label }]
export const findPlaceholderFields = (text) => {
    const known = knownPlaceholderKeys(text);
    const fields = new Map();
    (text.match(PLACEHOLDER_PATTERN) || []).forEach(match => {
        const inner = match.slice(1, -1);
        const split = splitPlaceholder(inner, known);
        (split ? split.names : [clean(inner)]).forEach(name => {
            if (!fields.has(placeholderKey(name))) fields.set(placeholderKey(name), name);
        });
    });
    return [...fields].map(([key, label]) => ({ key, label }));
};

// Puts values (Map of field key -> value) into a text. A bracket with several fields keeps its separators; the fields
// that have no value yet stay in brackets of their own, e.g. "Apollo / [Course Code]".
export const fillPlaceholders = (text, values, known) => text.replace(PLACEHOLDER_PATTERN, (match) => {
    const inner = match.slice(1, -1);
    const split = splitPlaceholder(inner, known);
    if (!split) return values.get(placeholderKey(inner)) || match;
    let filled = 0;
    const out = split.pieces.map((piece, index) => {
        if (index % 2 === 1) return piece;
        const value = values.get(placeholderKey(piece));
        if (value) { filled += 1; return value; }
        return `[${clean(piece)}]`;
    }).join('');
    return filled > 0 ? out : match;
});
