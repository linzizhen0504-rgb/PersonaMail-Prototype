import { usableProfile, rewriterProfile } from './styleProfile';

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
