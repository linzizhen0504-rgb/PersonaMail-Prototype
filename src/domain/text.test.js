import { plainText, locateUnitText, locateUnitRange, changedSentenceParts, levenshtein, shuffle } from './text';

describe('plainText', () => {
    it('lowers the case, drops punctuation and makes the spaces single', () => {
        expect(plainText('  Hello,   WORLD!  ')).toBe('hello world');
    });

    it('keeps letters and digits of any language', () => {
        expect(plainText('你好，世界 2026!')).toBe('你好世界 2026');
    });

    it('gives an empty text for nothing', () => {
        expect(plainText(null)).toBe('');
        expect(plainText(undefined)).toBe('');
    });
});

describe('locateUnitText', () => {
    it('finds the text exactly', () => {
        expect(locateUnitText('Hi there. How are you?', 'How are you?')).toEqual({ start: 10, end: 22 });
    });

    it('finds it although the spaces or line breaks differ', () => {
        expect(locateUnitText('Hi   there.\nHow are you?', 'Hi there. How are you?')).toEqual({ start: 0, end: 24 });
    });

    it('finds it although the quotes are the other kind', () => {
        expect(locateUnitText('She said “it’s fine”.', 'She said "it\'s fine".')).toEqual({ start: 0, end: 21 });
    });

    it('takes characters of a regular expression literally', () => {
        expect(locateUnitText('Cost (approx.) is $5?', '(approx.) is $5?')).toEqual({ start: 5, end: 21 });
    });

    it('gives null when it is not there or there is nothing to look for', () => {
        expect(locateUnitText('Hello', 'Goodbye')).toBeNull();
        expect(locateUnitText('Hello', '')).toBeNull();
        expect(locateUnitText('Hello', null)).toBeNull();
    });
});

describe('locateUnitRange', () => {
    const paragraphs = ['Dear Mia,', 'See you soon.', 'With all my love,', 'Wanda'];

    it('finds a unit inside one paragraph', () => {
        expect(locateUnitRange(paragraphs, 'See you soon.')).toEqual({ first: 1, last: 1, start: 0, end: 13 });
    });

    it('finds a unit that covers several paragraphs, with the offsets in the first and the last', () => {
        expect(locateUnitRange(paragraphs, 'With all my love,\n\nWanda')).toEqual({ first: 2, last: 3, start: 0, end: 5 });
    });

    it('finds a unit that starts in the middle of a paragraph and ends in the middle of another', () => {
        expect(locateUnitRange(['Hello Mia. I', 'hope you are well.'], 'I\n\nhope')).toEqual({ first: 0, last: 1, start: 11, end: 4 });
    });

    it('gives null when the text is not in the paragraphs', () => {
        expect(locateUnitRange(paragraphs, 'Goodbye')).toBeNull();
    });
});

describe('changedSentenceParts', () => {
    const changed = (parts) => parts.filter(part => part.changed).map(part => part.text);

    it('marks the sentences that are not in the old text', () => {
        const parts = changedSentenceParts(['I am happy. See you soon.'], 'I am happy. See you tomorrow!');
        expect(changed(parts)).toEqual(['See you tomorrow!']);
    });

    it('does not mark a sentence that only differs in case or punctuation', () => {
        expect(changed(changedSentenceParts(['Hello there.'], 'hello there!'))).toEqual([]);
    });

    it('compares with every old text it is given', () => {
        expect(changed(changedSentenceParts(['One sentence.', 'Another one.'], 'Another one. One sentence.'))).toEqual([]);
    });

    it('lets a line break end a sentence, so a greeting without a full stop is compared on its own', () => {
        const parts = changedSentenceParts(['Dear Mia,\nI hope you are well.'], 'Dear Mia,\nI hope you are great.');
        expect(changed(parts)).toEqual(['I hope you are great.']);
    });

    it('keeps the whole text, in order, whatever is marked', () => {
        const parts = changedSentenceParts(['Old.'], 'Old. New text here.');
        expect(parts.map(part => part.text).join('')).toBe('Old. New text here.');
    });
});

describe('levenshtein', () => {
    it('is 0 for the same text and the length of the other for an empty one', () => {
        expect(levenshtein('same', 'same')).toBe(0);
        expect(levenshtein('', 'abc')).toBe(3);
        expect(levenshtein('abc', '')).toBe(3);
        expect(levenshtein(null, 'ab')).toBe(2);
    });

    it('counts insertions, deletions and substitutions', () => {
        expect(levenshtein('kitten', 'sitting')).toBe(3);
        expect(levenshtein('flaw', 'lawn')).toBe(2);
    });
});

describe('shuffle', () => {
    it('keeps the same items and does not change the list it was given', () => {
        const items = [1, 2, 3, 4, 5];
        const result = shuffle(items, () => 0.5);
        expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
        expect(items).toEqual([1, 2, 3, 4, 5]);
    });

    it('gives the order its random source decides', () => {
        expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
    });
});
