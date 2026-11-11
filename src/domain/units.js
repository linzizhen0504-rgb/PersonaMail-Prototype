// The units of an email (its parts: salutation, call to action, valediction...) as the editor holds them: pure functions on the json of
// the editor. A unit lies in one paragraph or covers several (a sign-off and the name below it).
import { locateUnitRange } from './text';
import { getNodeText } from './nodes';

// The opening salutation and the valediction are changed on their own: a change of one does not reach the other units, and a change
// of another unit does not reach them. Matched on the id and the title, because the model names them differently from time to time
// ("valediction", "Valediction and Sign-off").
const INDEPENDENT = /salutation|valediction/i;
export const isIndependentUnit = (unit) => Boolean(unit) && INDEPENDENT.test(`${unit.id || ''} ${unit.title || ''}`);

// The units a change of an intent could reach: the ones that share the intent and do not have its new value yet; never the unit the
// change came from, and none at all when that unit changes on its own
export const propagationTargets = (units, sourceId, intentSelected) => {
    const source = units.find(unit => unit.id === sourceId);
    if (isIndependentUnit(source)) return [];
    return units.filter(unit => unit.id !== sourceId && !isIndependentUnit(unit)
        && (unit.linkedIntents || []).some(intent => intent.dimension === intentSelected.dimension && intent.current_value !== intentSelected.current_value));
};

const paragraphTexts = (value) => value.map(node => getNodeText(null, node));

// The leaves of a paragraph with the part from..to (offsets in the paragraph) changed by `change(leaf)`; a leaf is split at the edges.
// A leaf for which `skip(leaf)` is true is kept as it is.
const changeRange = (node, from, to, change, skip = () => false) => {
    let offset = 0;
    const children = [];
    node.children.forEach(child => {
        const text = child.text || '';
        const start = offset;
        const end = offset + text.length;
        offset = end;
        const a = Math.max(from, start) - start;
        const b = Math.min(to, end) - start;
        if (b <= a || skip(child)) { children.push(child); return; }
        if (a > 0) children.push({ ...child, text: text.slice(0, a) });
        children.push(change({ ...child, text: text.slice(a, b) }));
        if (b < text.length) children.push({ ...child, text: text.slice(b) });
    });
    return { ...node, children };
};

// Applies `change` to every leaf of the unit, paragraph by paragraph (the first from its start offset, the last up to its end offset)
const changeUnit = (value, range, change, skip) => value.map((node, index) => {
    if (index < range.first || index > range.last) return node;
    const length = getNodeText(null, node).length;
    return changeRange(node, index === range.first ? range.start : 0, index === range.last ? range.end : length, change, skip);
});

// The text of the unit marked as a unit (every leaf that holds its text gets its id); leaves of another unit stay as they are
export const markUnit = (value, content, componentId) => {
    const range = locateUnitRange(paragraphTexts(value), content);
    if (!range) return value;
    return changeUnit(value, range, leaf => ({ ...leaf, componentId }), leaf => Boolean(leaf.componentId));
};

const withoutHighlight = (value) => value.map(node => ({
    ...node,
    children: (node.children || []).map(child => {
        if (!child || typeof child !== 'object' || !('highlight' in child)) return child;
        const { highlight, ...rest } = child;
        return rest;
    })
}));

// The unit shown as selected: only its leaves are highlighted. When its text is not found nothing is highlighted.
export const highlightUnit = (value, content, componentId) => {
    const clean = withoutHighlight(value);
    const range = locateUnitRange(paragraphTexts(clean), content);
    if (!range) return clean;
    return changeUnit(clean, range, leaf => ({ ...leaf, componentId, highlight: true }));
};

// The leaves of a paragraph from..to (offsets), each cut to that part
const sliceLeaves = (node, from, to) => {
    let offset = 0;
    const out = [];
    node.children.forEach(child => {
        const text = child.text || '';
        const start = offset;
        const end = offset + text.length;
        offset = end;
        const a = Math.max(from, start) - start;
        const b = Math.min(to, end) - start;
        if (b > a) out.push({ ...child, text: text.slice(a, b) });
    });
    return out;
};

// The unit with another text. A unit over several paragraphs is replaced by the paragraphs of the new text (a blank line ends one);
// the text before and after it in its first and last paragraph stays. Gives { value, range, paragraphs } (where it was, and the
// paragraphs it covers now) or null when its old text is not in the editor.
export const replaceUnit = (value, oldContent, newContent, componentId, { highlight } = {}) => {
    const range = locateUnitRange(paragraphTexts(value), oldContent);
    if (!range) return null;
    // the new text is highlighted as the unit was, unless `highlight` says otherwise
    const highlighted = highlight !== undefined ? highlight
        : value.slice(range.first, range.last + 1).some(node => (node.children || []).some(child => child.highlight));
    const parts = String(newContent).split(/\n\s*\n/).map(part => part.replace(/^\s+|\s+$/g, ''));
    const unitLeaf = (text) => ({ text, componentId, ...(highlighted ? { highlight: true } : {}) });
    const firstNode = value[range.first];
    const lastNode = value[range.last];
    const lastLength = getNodeText(null, lastNode).length;
    // what stays of the first paragraph before the unit, and of the last after it
    const keepBefore = sliceLeaves(firstNode, 0, range.start);
    const keepAfter = sliceLeaves(lastNode, range.end, lastLength);
    const rebuilt = parts.map((text, index) => {
        const children = [];
        if (index === 0) children.push(...keepBefore);
        children.push(unitLeaf(text));
        if (index === parts.length - 1) children.push(...keepAfter);
        return { ...firstNode, children };
    });
    return {
        value: [...value.slice(0, range.first), ...rebuilt, ...value.slice(range.last + 1)],
        range,
        paragraphs: { first: range.first, last: range.first + parts.length - 1 }
    };
};

// The text of a unit as it is in the editor: its paragraphs, joined with a blank line
export const unitText = (value, componentId) => value.map(node => (node.children || [])
    .filter(child => child && child.componentId === componentId).map(child => child.text || '').join(''))
    .filter(Boolean).join('\n\n');

// A new text for a unit, in the shape the unit has: over several paragraphs it keeps its blank lines, in one paragraph it is one line
export const shapeUnitText = (text, coversSeveralParagraphs) => {
    if (!coversSeveralParagraphs) return String(text).replace(/\s*\n+\s*/g, ' ').trim();
    return String(text).split(/\n\s*\n/).map(part => part.replace(/^\s+|\s+$/g, '')).filter(Boolean).join('\n\n');
};
