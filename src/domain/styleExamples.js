// What the sender has already changed in this email by using a version card: the rewriter gets the last few, so that the other parts are
// changed in the same manner (see the "Apply to other parts" window).
import { plainText } from './text';

export const MAX_STYLE_EXAMPLES = 3;

// The list with the change of a used card added at the end: { dimension, value, before, after }. Nothing is added when the text
// reads the same as before or the change is incomplete.
export const recordStyleExample = (examples, change) => {
    const list = Array.isArray(examples) ? examples : [];
    const complete = change && ['dimension', 'value', 'before', 'after'].every(key => typeof change[key] === 'string' && change[key].trim());
    if (!complete || plainText(change.before) === plainText(change.after)) return list.slice(-MAX_STYLE_EXAMPLES);
    return [...list, { dimension: change.dimension, value: change.value, before: change.before, after: change.after }].slice(-MAX_STYLE_EXAMPLES);
};

const same = (a, b) => a.dimension === b.dimension && a.value === b.value && a.before === b.before && a.after === b.after;

// The list with the analysis of the preference model (which sentences the card added or removed) put on the example of that change
export const attachAnalysis = (examples, change, analysis) =>
    (Array.isArray(examples) ? examples : []).map(example => (same(example, change) ? { ...example, analysis } : example));

// The examples of one intent: what was changed for another intent says nothing about this one
export const examplesFor = (examples, dimension) =>
    (Array.isArray(examples) ? examples : []).filter(example => plainText(example.dimension) === plainText(dimension));

// Does a rewrite hold a sentence that a used card added to its own part? Then it was pasted in (greeting, reason, ...) and does not belong
// there. A short sentence is not looked for: it would match by chance.
const MIN_LENGTH = 20;
export const copiesNewContent = (text, examples) => {
    const haystack = plainText(text);
    return (Array.isArray(examples) ? examples : []).some(example => ((example.analysis && example.analysis.added) || [])
        .some(sentence => { const key = plainText(sentence); return key.length >= MIN_LENGTH && haystack.includes(key); }));
};
