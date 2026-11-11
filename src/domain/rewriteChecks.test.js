import { sentenceCounts, rewriteProblem } from './rewriteChecks';

const plainTextLength = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().length;
const LONG = 'This is a sentence that is longer than twenty characters.';

describe('sentenceCounts', () => {
    it('counts how often each longer sentence occurs, in any paragraph', () => {
        const counts = sentenceCounts([`${LONG} Short.`, LONG]);
        expect(counts.get(LONG.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ''))).toBe(2);
    });

    it('leaves out sentences of less than twenty letters', () => {
        expect(sentenceCounts(['Short one. Another.']).size).toBe(0);
    });
});

describe('rewriteProblem', () => {
    const unit = { id: 'cta', title: 'Call to Action' };
    const paragraphs = ['Dear Mia,', 'Could we meet on Friday afternoon?', 'Thanks, Wanda'];
    const check = (overrides) => rewriteProblem({
        unit, oldContent: 'Could we meet on Friday afternoon?', newContent: 'Would Friday afternoon suit you?', otherUnits: [], paragraphs, index: 1, ...overrides
    });

    it('is fine for a rewrite of about the same size that repeats nothing', () => {
        expect(check({})).toBeNull();
    });

    it('refuses a rewrite that is much longer than the part it replaces', () => {
        expect(check({ newContent: 'word '.repeat(200) })).toBe('is much longer than the part it replaces');
    });

    it('puts the limit at three times the old text and sixty letters (a little under is fine, a little over is not)', () => {
        const oldLength = plainTextLength('Could we meet on Friday afternoon?');
        const limit = oldLength * 3 + 60;
        const make = (length) => 'a'.repeat(length);
        expect(check({ newContent: make(limit) })).toBeNull();
        expect(check({ newContent: make(limit + 1) })).toBe('is much longer than the part it replaces');
    });

    it('refuses a rewrite that includes the text of another part', () => {
        const other = { id: 'valediction', title: 'Valediction', content: 'Thanks, Wanda and all my love' };
        expect(check({ newContent: 'Friday works? Thanks, Wanda and all my love', otherUnits: [other] }))
            .toBe('includes the text of another part (Valediction)');
    });

    it('does not mind a short text of another part (fewer than twelve letters)', () => {
        expect(check({ newContent: 'Friday works? Thanks.', otherUnits: [{ id: 's', title: 'S', content: 'Thanks.' }] })).toBeNull();
    });

    it('says when the old text is not in the paragraph', () => {
        expect(check({ oldContent: 'Something else entirely' })).toBe('text not found in the editor');
    });

    it('refuses a rewrite that makes a sentence appear twice in the email', () => {
        const withRepeat = [...paragraphs.slice(0, 2), 'I would love to catch up with you over coffee this week.'];
        expect(check({ paragraphs: withRepeat, newContent: 'I would love to catch up with you over coffee this week.' })).toBe('repeats text that is already in the email');
    });

    it('lets a sentence that was already twice stay twice', () => {
        const twice = ['I would love to catch up with you over coffee this week.', 'Could we meet on Friday afternoon?', 'I would love to catch up with you over coffee this week.'];
        expect(check({ paragraphs: twice, index: 1 })).toBeNull();
    });
});
