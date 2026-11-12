// What the sender already changed in this email, written into the rewriter's prompt so that the other parts are changed in the same manner.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { styleExamplesSection } = require('./styleExamples');

const EXAMPLE = { dimension: 'Reason for Delay', value: 'Detailed honest breakdown', before: 'I am behind.', after: 'I fell behind because the data took longer to clean than planned.' };

describe('styleExamplesSection', () => {
    it('is empty when there are no examples (the prompt stays as it was)', () => {
        assert.equal(styleExamplesSection(undefined), '');
        assert.equal(styleExamplesSection([]), '');
    });

    it('shows each change with its intent, its value and the text before and after', () => {
        const text = styleExamplesSection([EXAMPLE]);
        assert.ok(text.includes('Reason for Delay') && text.includes('Detailed honest breakdown'));
        assert.ok(text.includes(EXAMPLE.before) && text.includes(EXAMPLE.after));
    });

    it('asks for the same manner and degree, and not for the same words', () => {
        const text = styleExamplesSection([EXAMPLE]);
        assert.match(text, /same manner/i);
        assert.match(text, /do not copy/i);
    });

    it('keeps only the last three examples', () => {
        const many = [1, 2, 3, 4, 5].map(n => ({ ...EXAMPLE, value: `Value ${n}` }));
        const text = styleExamplesSection(many);
        assert.ok(!text.includes('Value 1') && !text.includes('Value 2'));
        assert.ok(text.includes('Value 3') && text.includes('Value 5'));
    });

    it('cuts a very long text', () => {
        const text = styleExamplesSection([{ ...EXAMPLE, after: 'x'.repeat(5000) }]);
        assert.ok(text.length < 2500);
    });

    it('leaves out entries that are not complete and does not break on junk', () => {
        assert.equal(styleExamplesSection([{ dimension: 'Tone' }, null, 'x', { ...EXAMPLE, before: '' }]), '');
    });
});

describe('styleExamplesSection with the analysis of what changed', () => {
    const analysed = { ...EXAMPLE, analysis: { added: ['I hope your week is going well!'], removed: ['I will send my draft today.'], reworded: 2, kept: 1 } };

    it('says which sentences are new, which are gone and how many were only reworded', () => {
        const text = styleExamplesSection([analysed]);
        assert.ok(text.includes('I hope your week is going well!'));
        assert.ok(text.includes('I will send my draft today.'));
        assert.match(text, /2 sentences? (was|were) only reworded/);
    });

    it('forbids copying those sentences or bringing in a greeting or closing that is not the component\'s own', () => {
        const text = styleExamplesSection([analysed]);
        assert.match(text, /never copy/i);
        assert.match(text, /greeting|pleasantry/i);
    });

    it('does not change anything when an example has no analysis', () => {
        assert.equal(styleExamplesSection([EXAMPLE]).includes('only reworded'), false);
        assert.equal(styleExamplesSection([EXAMPLE]).includes('New sentences'), false);
    });

    it('ignores an analysis that is not well formed and cuts what is too long', () => {
        assert.equal(styleExamplesSection([{ ...EXAMPLE, analysis: 'x' }]), styleExamplesSection([EXAMPLE]));
        const long = styleExamplesSection([{ ...EXAMPLE, analysis: { added: ['y'.repeat(2000)], removed: [], reworded: 0, kept: 0 } }]);
        assert.ok(!long.includes('y'.repeat(700)));
    });

    it('says nothing about a change in which every sentence was kept', () => {
        const text = styleExamplesSection([{ ...EXAMPLE, analysis: { added: [], removed: [], reworded: 0, kept: 3 } }]);
        assert.equal(text.includes('What changed'), false);
    });
});
