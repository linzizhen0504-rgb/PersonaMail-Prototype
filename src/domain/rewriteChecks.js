// Does a rewritten text break the email? Pure checks on texts; the editor decides what to do with the answer.
import { plainText, locateUnitText } from './text';

// How often each longer sentence occurs in the given paragraphs
export const sentenceCounts = (texts) => {
    const counts = new Map();
    texts.forEach(text => {
        String(text || '').split(/(?<=[.!?。！？])\s*/).forEach(sentence => {
            const key = plainText(sentence);
            if (key.length >= 20) counts.set(key, (counts.get(key) || 0) + 1);
        });
    });
    return counts;
};

// Does a rewritten unit text break the email? It must not contain another unit's text, and putting it into the
// paragraphs must not make any sentence appear more than once. Returns a reason, or null when it is fine.
// `paragraphs` are the editor paragraph texts, `index` the paragraph that holds the unit's old text.
export const rewriteProblem = ({ unit, oldContent, newContent, otherUnits, paragraphs, index }) => {
    const plainNew = plainText(newContent);
    if (plainNew.length > plainText(oldContent).length * 3 + 60) return 'is much longer than the part it replaces';
    const leaked = otherUnits.find(other => {
        const plainOther = plainText(other.content);
        return plainOther.length >= 12 && plainNew.includes(plainOther);
    });
    if (leaked) return `includes the text of another part (${leaked.title || leaked.id})`;
    const span = locateUnitText(paragraphs[index], oldContent);
    if (!span) return 'text not found in the editor';
    const after = paragraphs.slice();
    after[index] = paragraphs[index].slice(0, span.start) + newContent + paragraphs[index].slice(span.end);
    const before = sentenceCounts(paragraphs);
    for (const [key, count] of sentenceCounts(after)) {
        if (count > 1 && count > (before.get(key) || 0)) return 'repeats text that is already in the email';
    }
    return null;
};
