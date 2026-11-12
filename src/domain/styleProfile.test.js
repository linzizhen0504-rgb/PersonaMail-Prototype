import { usableProfile, rewriterProfile, describeOperation, recommendationReason } from './styleProfile';

const PROFILE = {
    available: true, ops_count: 5, strength: 0.6,
    liked: [{ dimension: 'Tone', value: 'Direct and formal', weight: 2 }, { dimension: 'Length', value: 'Short and concise', weight: 1 }],
    disliked: [{ dimension: 'Tone', value: 'Apologetic', weight: 0.9 }, { dimension: 'Tone', value: 'Warm', weight: 0.3 }],
    stats: { changes: 3, mean_length_change_pct: -23, with_added: 2, with_removed: 1, only_reworded: 0 },
    traits: [{ kind: 'shorter', text: 'Tends to make texts shorter (about 23% on average)', evidence: ['A', 'B'] }, { kind: 'adds', text: 'Often adds new sentences (2 of 3 changes)', evidence: ['A', 'B'] }],
    recent: []
};

describe('usableProfile', () => {
    it('is true for a profile with operations', () => {
        expect(usableProfile(PROFILE)).toBe(true);
    });

    it('is false for none, one the model could not give, and one without operations', () => {
        expect(usableProfile(null)).toBe(false);
        expect(usableProfile({ ...PROFILE, available: false })).toBe(false);
        expect(usableProfile({ ...PROFILE, ops_count: 0 })).toBe(false);
    });
});

describe('rewriterProfile (what is sent to the rewriter)', () => {
    it('sends the statements, the values taken and the values passed over (those passed over clearly), and the length', () => {
        expect(rewriterProfile(PROFILE)).toEqual({
            traits: ['Tends to make texts shorter (about 23% on average)', 'Often adds new sentences (2 of 3 changes)'],
            liked: ['Direct and formal', 'Short and concise'],
            disliked: ['Apologetic'],
            lengthChangePct: -23
        });
    });

    it('asks for a length only when a statement about the length stands behind it', () => {
        const withoutLength = { ...PROFILE, traits: [PROFILE.traits[1]] };
        expect(rewriterProfile(withoutLength).lengthChangePct).toBeNull();
    });

    it('is null when there is nothing to say', () => {
        expect(rewriterProfile(null)).toBeNull();
        expect(rewriterProfile({ ...PROFILE, available: false })).toBeNull();
        expect(rewriterProfile({ ...PROFILE, traits: [], liked: [], disliked: [] })).toBeNull();
    });
});

describe('describeOperation', () => {
    it('says what an operation changed, in a line', () => {
        expect(describeOperation({ kind: 'pick', dimension: 'Tone', value: 'Direct', added: 1, removed: 2, reworded: 0, length_change_pct: -40 }))
            .toBe('Used "Direct": 40% shorter, 1 new sentence, 2 removed');
    });

    it('names the kind of operation and leaves out what did not change', () => {
        expect(describeOperation({ kind: 'ai_edit', dimension: 'Tone', value: 'Formal', added: 0, removed: 0, reworded: 1, length_change_pct: 12 }))
            .toBe('AI rewrite (Formal): 12% longer, only reworded');
        expect(describeOperation({ kind: 'manual_edit', dimension: 'Tone', value: 'Direct', added: 0, removed: 0, reworded: 0, length_change_pct: 0 }))
            .toBe('Edited by hand after "Direct": same length');
    });
});

describe('recommendationReason (why a card is recommended; only for the card the model is clear about)', () => {
    const reasons = {
        Straight: { nearest_liked: { value: 'Direct', similarity: 0.912 }, length_change_pct: -30 },
        Elaborate: { nearest_liked: { value: 'Direct', similarity: 0.1 }, length_change_pct: 40 }
    };

    it('names the card the model recommends, with the value taken that it is closest to and the length it would give', () => {
        expect(recommendationReason('Straight', 'Straight', reasons)).toEqual({
            headline: 'Matches your picks: Direct',
            detail: 'Closest to "Direct" (similarity 0.91); would make the text 30% shorter.'
        });
    });

    it('says longer for a longer text, and leaves the length out when it is not known', () => {
        expect(recommendationReason('Elaborate', 'Elaborate', reasons).detail).toMatch(/40% longer/);
        expect(recommendationReason('X', 'X', { X: { nearest_liked: { value: 'Direct', similarity: 0.8 }, length_change_pct: null } }).detail).toBe('Closest to "Direct" (similarity 0.80).');
    });

    it('is null for a card that is not the recommended one, and when nothing is recommended', () => {
        expect(recommendationReason('Elaborate', 'Straight', reasons)).toBeNull();
        expect(recommendationReason('Straight', null, reasons)).toBeNull();
        expect(recommendationReason('Straight', undefined, undefined)).toBeNull();
        expect(recommendationReason('Straight', 'Straight', {})).toBeNull();
    });
});
