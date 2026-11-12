// What the sender prefers in this email (learned from their choices so far), as a section of the rewriter's prompt.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { styleProfileSection } = require('./styleProfile');

const PROFILE = {
    traits: ['Tends to make texts shorter (about 23% on average)', 'Often adds new sentences (2 of 3 changes)'],
    liked: ['Direct and formal', 'Short and concise'],
    disliked: ['Apologetic and submissive'],
    lengthChangePct: -23
};

describe('styleProfileSection', () => {
    it('is empty when there is no profile or nothing in it (the prompt stays as it was)', () => {
        assert.equal(styleProfileSection(undefined), '');
        assert.equal(styleProfileSection(null), '');
        assert.equal(styleProfileSection({ traits: [], liked: [], disliked: [], lengthChangePct: null }), '');
        assert.equal(styleProfileSection('Warm'), '');
    });

    it('lists what the sender tends to do, which values they took and which they passed over', () => {
        const text = styleProfileSection(PROFILE);
        for (const part of [...PROFILE.traits, ...PROFILE.liked, ...PROFILE.disliked]) assert.ok(text.includes(part), part);
    });

    it('gives a length to aim for, in the direction of the sender', () => {
        assert.match(styleProfileSection(PROFILE), /about 23% shorter/i);
        assert.match(styleProfileSection({ ...PROFILE, lengthChangePct: 30 }), /about 30% longer/i);
    });

    it('gives no length when it is small or unknown', () => {
        assert.doesNotMatch(styleProfileSection({ ...PROFILE, lengthChangePct: 4 }), /Aim for/i);
        assert.doesNotMatch(styleProfileSection({ ...PROFILE, lengthChangePct: null }), /Aim for/i);
    });

    it('keeps the meaning of the intent values, and does not ask for copying or for other parts', () => {
        const text = styleProfileSection(PROFILE);
        assert.match(text, /meaning of each intent value/i);
        assert.match(text, /not copy/i);
        assert.match(text, /greeting|pleasantry/i);
    });

    it('keeps at most five of each, cuts long ones and ignores what is not text', () => {
        const many = styleProfileSection({ traits: [], liked: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], disliked: [], lengthChangePct: null });
        assert.ok(many.includes('a5') && !many.includes('a6'));
        const long = styleProfileSection({ traits: ['x'.repeat(2000)], liked: [], disliked: [], lengthChangePct: null });
        assert.ok(!long.includes('x'.repeat(400)));
        assert.equal(styleProfileSection({ traits: [1, null, {}], liked: [], disliked: [], lengthChangePct: null }), '');
    });
});
