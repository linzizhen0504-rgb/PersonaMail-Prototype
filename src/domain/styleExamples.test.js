import { recordStyleExample, attachAnalysis, examplesFor, copiesNewContent, MAX_STYLE_EXAMPLES } from './styleExamples';

const PICK = { dimension: 'Reason for Delay', value: 'Detailed honest breakdown', before: 'I am behind.', after: 'I fell behind because the data took longer to clean.' };

describe('recordStyleExample', () => {
    it('adds the change a used card made to the end of the list, and does not touch the list it was given', () => {
        const before = [];
        const after = recordStyleExample(before, PICK);
        expect(after).toEqual([PICK]);
        expect(before).toEqual([]);
    });

    it('keeps only the last few, the newest last', () => {
        let list = [];
        for (let n = 1; n <= MAX_STYLE_EXAMPLES + 2; n++) list = recordStyleExample(list, { ...PICK, value: `Value ${n}` });
        expect(list).toHaveLength(MAX_STYLE_EXAMPLES);
        expect(list[list.length - 1].value).toBe(`Value ${MAX_STYLE_EXAMPLES + 2}`);
        expect(list[0].value).toBe('Value 3');
    });

    it('a change that reads the same as before is nothing to show', () => {
        expect(recordStyleExample([], { ...PICK, after: 'I am behind' })).toEqual([]);
    });

    it('an incomplete change is left out', () => {
        expect(recordStyleExample([], { ...PICK, before: '' })).toEqual([]);
        expect(recordStyleExample([], { dimension: 'Tone' })).toEqual([]);
        expect(recordStyleExample([], null)).toEqual([]);
    });
});

const ANALYSIS = { added: ['I hope your week is going well and that the term is treating you kindly!'], removed: [], reworded: 1, kept: 0 };

describe('attachAnalysis', () => {
    it('puts the analysis on the example of that change, and leaves the others alone', () => {
        const other = { ...PICK, value: 'Other', after: 'something else entirely.' };
        const list = recordStyleExample(recordStyleExample([], other), PICK);
        const result = attachAnalysis(list, PICK, ANALYSIS);
        expect(result.find(e => e.value === PICK.value).analysis).toEqual(ANALYSIS);
        expect(result.find(e => e.value === 'Other').analysis).toBeUndefined();
    });

    it('does nothing when the change is no longer in the list (it was cleared by a new draft in the meantime)', () => {
        expect(attachAnalysis([], PICK, ANALYSIS)).toEqual([]);
    });

    it('does not touch the list it was given', () => {
        const list = recordStyleExample([], PICK);
        attachAnalysis(list, PICK, ANALYSIS);
        expect(list[0].analysis).toBeUndefined();
    });
});

describe('examplesFor', () => {
    it('keeps the examples of the same intent only: a change made for another intent says nothing about this one', () => {
        const list = [{ ...PICK, dimension: 'Tone' }, { ...PICK, dimension: 'Length' }, { ...PICK, dimension: ' tone ' }];
        expect(examplesFor(list, 'Tone').map(e => e.dimension)).toEqual(['Tone', ' tone ']);
        expect(examplesFor(list, 'Nothing')).toEqual([]);
    });
});

describe('copiesNewContent (a rewrite must not paste in what the used card added to another part)', () => {
    const examples = [{ ...PICK, analysis: ANALYSIS }];

    it('finds a new sentence of the card inside the rewrite, whatever the case and punctuation', () => {
        expect(copiesNewContent('Thanks. I hope your week is going well, and that the term is treating you kindly. Bye.', examples)).toBe(true);
    });

    it('is false for a rewrite that does not hold it', () => {
        expect(copiesNewContent('Thank you for your time and understanding.', examples)).toBe(false);
    });

    it('does not mind a very short new sentence (it would match by chance)', () => {
        expect(copiesNewContent('Thank you. Thanks!', [{ ...PICK, analysis: { added: ['Thanks!'], removed: [], reworded: 0, kept: 0 } }])).toBe(false);
    });

    it('is false without examples or analysis', () => {
        expect(copiesNewContent('anything', [])).toBe(false);
        expect(copiesNewContent('anything', [PICK])).toBe(false);
    });
});
