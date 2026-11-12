// What the sender already changed in this email (a card they used), as a section of the rewriter's prompt, so that the other parts
// are changed in the same manner and to the same degree. Nothing when there is nothing to show.
const MAX_EXAMPLES = 3;
const MAX_TEXT = 600;
const MAX_SENTENCE = 300;
const MAX_LISTED = 5;

const cut = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text);
const complete = (example) => example && ['dimension', 'value', 'before', 'after'].every(key => typeof example[key] === 'string' && example[key].trim());

// What the analysis of the preference model says a used card changed, as one line; '' when it has nothing to say. The sentences are
// cut and counted so that a bad analysis cannot flood the prompt.
function changeLine(analysis) {
    if (!analysis || !Array.isArray(analysis.added) || !Array.isArray(analysis.removed)) return '';
    const quote = (list) => list.filter(item => typeof item === 'string' && item.trim()).slice(0, MAX_LISTED)
        .map(item => `"${item.length > MAX_SENTENCE ? `${item.slice(0, MAX_SENTENCE)}…` : item}"`).join(' | ');
    const added = quote(analysis.added);
    const removed = quote(analysis.removed);
    const reworded = Number.isInteger(analysis.reworded) ? analysis.reworded : 0;
    const parts = [];
    if (added) parts.push(`New sentences: ${added}`);
    if (removed) parts.push(`Removed sentences: ${removed}`);
    if (reworded > 0) parts.push(`${reworded} sentence${reworded > 1 ? 's were' : ' was'} only reworded`);
    return parts.length > 0 ? `   What changed: ${parts.join('; ')}.` : '';
}

function styleExamplesSection(examples) {
    const usable = (Array.isArray(examples) ? examples : []).filter(complete).slice(-MAX_EXAMPLES);
    if (usable.length === 0) return '';
    const lines = usable.map((example, index) => [
        `${index + 1}. Intent "${example.dimension}" was changed to "${example.value}":`,
        `   Before: ${cut(example.before.trim())}`,
        `   After: ${cut(example.after.trim())}`,
        changeLine(example.analysis)
    ].filter(Boolean).join('\n'));
    const analysed = usable.some(example => changeLine(example.analysis));
    return '\n\n**What the sender has already changed in this email** (they chose these versions themselves). Change the current component in the same manner and to the same degree as they did, where it applies to this component. Do not copy the wording or the content of these examples, and do not bring in anything about other parts of the email.\n'
        + lines.join('\n')
        + (analysed ? '\nThe new and removed sentences only show what kind of change the sender made, for example that they added a reason or dropped an apology. Never copy them or a sentence like them into the component, and do not add a greeting, a pleasantry, a closing or anything else that is not the component\'s own job.' : '');
}

module.exports = { styleExamplesSection, MAX_EXAMPLES };
