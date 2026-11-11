// Text the page works on, as pure functions (no React, no Slate): how a unit is found in the email, how two texts are compared.

// Plain form of a text for comparing: lower case, no punctuation, single spaces
export const plainText = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// Where a unit's text is in a paragraph: { start, end } or null. Quotes of either kind and any spacing count as the same.
export const locateUnitText = (text, content) => {
    if (!content) return null;
    const exact = text.indexOf(content);
    if (exact !== -1) return { start: exact, end: exact + content.length };
    const escaped = content.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/[‘’']/g, "['‘’]")
        .replace(/[“”"]/g, '["“”]')
        .replace(/\s+/g, '\\s+');
    try {
        const match = new RegExp(escaped).exec(text);
        return match ? { start: match.index, end: match.index + match[0].length } : null;
    } catch (error) {
        return null;
    }
};

// Where a unit sits in the editor paragraphs: inside one paragraph, or over several (a sign-off such as "With all my love," and the name
// below it). Returns { first, last, start, end }: the first and last paragraph and the offsets in them; null when it is not there.
export const locateUnitRange = (paragraphs, content) => {
    for (let i = 0; i < paragraphs.length; i++) {
        const span = locateUnitText(paragraphs[i], content);
        if (span) return { first: i, last: i, start: span.start, end: span.end };
    }
    const joined = paragraphs.join('\n\n');
    const span = locateUnitText(joined, content);
    if (!span) return null;
    let offset = 0;
    const range = { first: -1, last: -1, start: 0, end: 0 };
    paragraphs.forEach((text, i) => {
        const from = offset;
        const to = offset + text.length;
        if (range.first === -1 && span.start <= to) { range.first = i; range.start = Math.max(span.start - from, 0); }
        if (range.last === -1 && span.end <= to) { range.last = i; range.end = Math.max(span.end - from, 0); }
        offset = to + 2;
    });
    return range.first !== -1 && range.last !== -1 ? range : null;
};

// The text of a version split in the order it is read, each piece with whether its sentence is new: not in any of the old texts.
// A line break also ends a sentence, so a greeting or a sign-off without a full stop is compared on its own.
export const changedSentenceParts = (oldTexts, newText) => {
    const split = (text) => String(text || '').split(/(?<=[.!?。！？])(\s+)|(\s*\n\s*)/).filter(part => part !== undefined);
    const known = new Set();
    oldTexts.forEach(text => split(text).forEach(part => { const key = plainText(part); if (key) known.add(key); }));
    return split(newText).map(part => ({ text: part, changed: Boolean(part.trim()) && !known.has(plainText(part)) }));
};

// Character-level Levenshtein edit distance
export const levenshtein = (a, b) => {
    const s = a || '';
    const t = b || '';
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
    for (let i = 1; i <= s.length; i++) {
        const curr = [i];
        for (let j = 1; j <= t.length; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[t.length];
};

// The items in a random order (the list that was given is not changed); `random` is where the randomness comes from
export const shuffle = (items, random = Math.random) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};
