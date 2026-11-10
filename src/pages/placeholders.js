// [Bracketed] information a draft asks the writer to fill in, e.g. [Your Name] or [Project Name / Course Code].
// A bracket that joins several items with " / " is split into one field per item, and a field that occurs in several
// places (also inside such a bracket) is one field, so the writer fills in each piece of information only once.
// A bracket with an example, [Proposed Date, e.g., Friday 5 PM], is the field "Proposed Date": the example is not part of its name.
// A bracket that asks for a reason or a next step is not a field at all (see isNarrativePlaceholder).
const PLACEHOLDER_PATTERN = /\[[^[\]\n]{1,60}\]/g;

const clean = (text) => text.replace(/\s+/g, ' ').trim();
export const placeholderKey = (label) => clean(label).toLowerCase();

// The label of a bracket is the text before "e.g." (also "eg.", "for example", "such as")
const EXAMPLE_MARKER = /\s*[,:;(]?\s*\b(?:e\.?\s?g\.?|for example|such as)(?![A-Za-z])[\s,:.)]*/i;
const bracketLabel = (inner) => {
    const match = EXAMPLE_MARKER.exec(inner);
    if (!match || match.index === 0) return clean(inner);
    return clean(inner.slice(0, match.index)).replace(/[\s,:;(]+$/, '') || clean(inner);
};

// Brackets that ask for a reason or for a next step / progress ([briefly state your reason, e.g., … / … / …], [mention progress, …])
// are not information to fill in: the writer changes such text with the version cards. A bracket is one of them when its label
// starts with an explaining verb, names a reason, or names progress or a next step, or when it lists options that are each a
// phrase of three words or more.
const NARRATIVE_START = /^(?:(?:briefly|please|optionally)\s+)*(?:mention|state|describe|explain|outline|summari[sz]e|select|choose|list)\b/i;
const REASON_WORDS = /\b(?:reasons?|circumstances?|illness|emergency|unforeseen|unexpected|medical|obligations?)\b/i;
const PROGRESS_WORDS = /\b(?:progress|next steps?|follow[- ]?up|plan to|will do|completed|accomplished|what you['’]ve done|action items?)\b/i;
export const isNarrativePlaceholder = (inner) => {
    const label = bracketLabel(inner);
    if (NARRATIVE_START.test(label) || REASON_WORDS.test(label) || PROGRESS_WORDS.test(label)) return true;
    const options = clean(inner).split(/\s+\/\s+/);
    return options.length >= 2 && options.every(option => option.split(/\s+/).length >= 3);
};

// Keys of the brackets that do not contain a slash: evidence that a slash without spaces, as in [Course Name/Section
// Number], separates two fields when one side is such a field. [Position/Role] stays one field.
export const knownPlaceholderKeys = (text) => {
    const keys = new Set();
    (text.match(PLACEHOLDER_PATTERN) || []).forEach(match => {
        const inner = match.slice(1, -1);
        if (isNarrativePlaceholder(inner)) return;
        const label = bracketLabel(inner);
        if (!label.includes('/')) keys.add(placeholderKey(label));
    });
    return keys;
};

// The pieces of one bracket's label, names at even and separators at odd positions; null when it is a single field
const splitPlaceholder = (label, known) => {
    const pieces = label.split(/(\s*\/\s*)/);
    if (pieces.length < 3) return null;
    const names = pieces.filter((_, i) => i % 2 === 0).map(clean);
    if (names.some(name => !name)) return null;
    const spaced = pieces.filter((_, i) => i % 2 === 1).every(separator => /^\s+\/\s+$/.test(separator));
    return spaced || names.some(name => known.has(placeholderKey(name))) ? { pieces, names } : null;
};

// What one bracket is: null when it is not information to fill in, else { label, split }
const parseBracket = (match, known) => {
    const inner = match.slice(1, -1);
    if (isNarrativePlaceholder(inner)) return null;
    const label = bracketLabel(inner);
    return { label, split: splitPlaceholder(label, known) };
};

// The fields of a draft in order of first appearance: [{ key, label }]. extraKnown are keys that were single-field
// brackets earlier (once such a bracket is filled in, its evidence for splitting [A/B] is gone from the text).
export const findPlaceholderFields = (text, extraKnown) => {
    const known = new Set([...knownPlaceholderKeys(text), ...(extraKnown || [])]);
    const fields = new Map();
    const add = (label) => {
        const key = placeholderKey(label);
        if (!fields.has(key)) fields.set(key, { key, label });
    };
    (text.match(PLACEHOLDER_PATTERN) || []).forEach(match => {
        const parsed = parseBracket(match, known);
        if (!parsed) return;
        if (parsed.split) parsed.split.names.forEach(add);
        else add(parsed.label);
    });
    return [...fields.values()];
};

// Puts values (Map of field key -> value) into a text. A bracket with several fields keeps its separators; the fields
// that have no value yet stay in brackets of their own, e.g. "Apollo / [Course Code]".
export const fillPlaceholders = (text, values, known) => text.replace(PLACEHOLDER_PATTERN, (match) => {
    const parsed = parseBracket(match, known);
    if (!parsed) return match;
    if (!parsed.split) return values.get(placeholderKey(parsed.label)) || match;
    let filled = 0;
    const out = parsed.split.pieces.map((piece, index) => {
        if (index % 2 === 1) return piece;
        const value = values.get(placeholderKey(piece));
        if (value) { filled += 1; return value; }
        return `[${clean(piece)}]`;
    }).join('');
    return filled > 0 ? out : match;
});

export const containsPlaceholder = (text) => new RegExp(PLACEHOLDER_PATTERN.source).test(String(text || ''));

// The pieces of a text with the values filled in: [{ text, field? }]. A piece that was filled in carries its field
// ({ key, label, raw }, raw being the bracket it replaced, to put it back); everything else (also the brackets that
// stay) has no field. Same rules as fillPlaceholders.
export const segmentFill = (text, values, known) => {
    const out = [];
    const push = (piece, field) => {
        if (!piece) return;
        const previous = out[out.length - 1];
        if (previous && !previous.field && !field) previous.text += piece;
        else out.push(field ? { text: piece, field } : { text: piece });
    };
    let last = 0;
    text.replace(PLACEHOLDER_PATTERN, (match, offset) => {
        push(text.slice(last, offset));
        last = offset + match.length;
        const parsed = parseBracket(match, known);
        if (!parsed) { push(match); return match; }
        if (!parsed.split) {
            const key = placeholderKey(parsed.label);
            const value = values.get(key);
            if (value) push(value, { key, label: parsed.label, raw: match });
            else push(match);
            return match;
        }
        let filled = 0;
        const parts = parsed.split.pieces.map((piece, index) => {
            if (index % 2 === 1) return { text: piece };
            const value = values.get(placeholderKey(piece));
            if (value) { filled += 1; return { text: value, field: { key: placeholderKey(piece), label: clean(piece), raw: `[${clean(piece)}]` } }; }
            return { text: `[${clean(piece)}]` };
        });
        if (filled > 0) parts.forEach(part => push(part.text, part.field));
        else push(match);
        return match;
    });
    push(text.slice(last));
    return out;
};

// The fields of an editor document (Slate nodes) in order of appearance: the brackets still in the text, and the fields that
// were filled in (their text carries placeholderKey / placeholderLabel)
export const collectPlaceholderFields = (nodes, extraKnown) => {
    const leaves = [];
    const walk = (list) => (list || []).forEach(node => {
        if (node && typeof node.text === 'string') leaves.push(node);
        else if (node && Array.isArray(node.children)) walk(node.children);
    });
    walk(nodes);
    const known = new Set([...knownPlaceholderKeys(leaves.map(leaf => leaf.text).join('\n')), ...(extraKnown || [])]);
    leaves.forEach(leaf => { if (leaf.placeholderKey && leaf.text) known.add(leaf.placeholderKey); });
    const fields = new Map();
    const add = (field) => { if (!fields.has(field.key)) fields.set(field.key, field); };
    leaves.forEach(leaf => {
        if (leaf.placeholderKey) {
            // a marked leaf the writer deleted the text of stays in the document as an empty leaf: not a field any more
            if (leaf.text) add({ key: leaf.placeholderKey, label: leaf.placeholderLabel || leaf.placeholderKey });
            return;
        }
        findPlaceholderFields(leaf.text, known).forEach(add);
    });
    return [...fields.values()];
};

// A text without the bracket(s) of one field: [Name] goes, and so does the space that would be left on one side of it. A field
// inside a bracket with several fields ([A / B]) goes with one separator, and the other fields stay in their bracket.
export const removePlaceholder = (text, key, known) => {
    const cuts = [];
    text.replace(PLACEHOLDER_PATTERN, (match, offset) => {
        const parsed = parseBracket(match, known);
        if (!parsed) return match;
        if (!parsed.split) {
            if (placeholderKey(parsed.label) === key) cuts.push({ start: offset, end: offset + match.length, replacement: '' });
            return match;
        }
        const names = parsed.split.names.map(placeholderKey);
        const position = names.indexOf(key);
        if (position === -1) return match;
        const pieces = [...parsed.split.pieces];
        const at = position * 2;
        pieces.splice(position === 0 ? at : at - 1, 2); // the field and the separator before it (after it for the first field)
        cuts.push({ start: offset, end: offset + match.length, replacement: `[${clean(pieces.join(''))}]` });
        return match;
    });
    let result = text;
    cuts.reverse().forEach(({ start, end, replacement }) => {
        let from = start;
        let to = end;
        if (!replacement) {
            const before = result[from - 1];
            const after = result[to];
            if (before === ' ' && (after === undefined || after === ' ' || /[,.;:!?)\]]/.test(after))) from -= 1;
            else if (before === undefined && after === ' ') to += 1;
        }
        result = result.slice(0, from) + replacement + result.slice(to);
    });
    return result;
};
