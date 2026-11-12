const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createModelServicePreference, createFakePreference, createPreferenceService } = require('./index');
const { assertPort, PORTS } = require('../../contracts/assertPort');
const { PreferenceUnavailableError } = require('../../contracts/errors');

const RANK = {
    pid: 'P01', context: 'Equal', intent_dimension: 'Tone', k: 3, session_id: 's1', current_text: 'Hi.',
    candidates: [{ value: 'Warm', text: 'Hello!' }, { value: 'Cool', text: 'Hello.' }, { value: 'Brisk', text: 'Hi' }, { value: 'Soft', text: 'Hey' }]
};
const answer = { values: ['Cool', 'Warm', 'Soft'], ordering: 'preference', mmr_used: true, style_strength: 0.4, scores: { Cool: 1 }, style_scores: { Cool: 0.1 } };

describe('model service adapter', () => {
    const recording = (reply) => {
        const calls = [];
        return { calls, post: async (url, body, config) => { calls.push({ url, body, config }); if (reply instanceof Error) throw reply; return { data: reply }; } };
    };

    it('is a PreferencePort', () => {
        assert.doesNotThrow(() => assertPort(PORTS.PreferencePort, createModelServicePreference({ baseUrl: 'http://x', post: async () => ({ data: {} }) })));
    });

    it('asks the service to rank and returns its answer, with a short timeout', async () => {
        const { calls, post } = recording(answer);
        const result = await createModelServicePreference({ baseUrl: 'http://s:3003', timeoutMs: 2000, post }).rank(RANK);
        assert.deepEqual(result, answer);
        assert.equal(calls[0].url, 'http://s:3003/rank');
        assert.deepEqual(calls[0].body, RANK);
        assert.equal(calls[0].config.timeout, 2000);
    });

    it('sends update, reject-check and reset-session to the paths of the service', async () => {
        const { calls, post } = recording({ ok: true, reject_mean: 0.2, exceeds: false });
        const preference = createModelServicePreference({ baseUrl: 'http://s', post });
        await preference.update({ pid: 'P01', event: 'pick' });
        assert.deepEqual(await preference.rejectCheck({ pid: 'P01' }), { ok: true, reject_mean: 0.2, exceeds: false });
        await preference.resetSession({ pid: 'P01', session_id: 's1' });
        assert.deepEqual(calls.map(call => call.url), ['http://s/update', 'http://s/reject-check', 'http://s/reset-session']);
    });

    it('asks the service what a used card changed, on the path of the service', async () => {
        const reply = { added: ['New sentence.'], removed: [], reworded: 1, kept: 2 };
        const { calls, post } = recording(reply);
        const result = await createModelServicePreference({ baseUrl: 'http://s', post }).analyzeChange({ before: 'Old.', after: 'New sentence.' });
        assert.deepEqual(result, reply);
        assert.equal(calls[0].url, 'http://s/analyze-change');
    });

    it('asks the service for the profile of an email, on the path of the service', async () => {
        const reply = { ops_count: 2, strength: 0.4, liked: [], disliked: [], stats: {}, traits: [], recent: [] };
        const { calls, post } = recording(reply);
        const result = await createModelServicePreference({ baseUrl: 'http://s', post }).profile({ pid: 'P01', session_id: 's1' });
        assert.deepEqual(result, reply);
        assert.equal(calls[0].url, 'http://s/profile');
    });

    it('reports a service that cannot be reached as a PreferenceUnavailableError', async () => {
        const { post } = recording(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
        await assert.rejects(() => createModelServicePreference({ baseUrl: 'http://s', post }).rank(RANK),
            error => error instanceof PreferenceUnavailableError && /ECONNREFUSED/.test(error.message));
    });

    it('talks to a real http server too', async () => {
        const seen = [];
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => { seen.push({ url: req.url, body: JSON.parse(body) }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(answer)); });
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const result = await createModelServicePreference({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 2000 }).rank(RANK);
            assert.deepEqual(result, answer);
            assert.equal(seen[0].url, '/rank');
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    });

    it('gives up on a service that does not answer in time', async () => {
        const server = http.createServer(() => { /* never answers */ });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            await assert.rejects(() => createModelServicePreference({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 100 }).rank(RANK), PreferenceUnavailableError);
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    });
});

describe('preference service', () => {
    const unavailable = () => createFakePreference({ failWith: new PreferenceUnavailableError('down') });

    it('rank: gives the answer of the model and says it came from the model', async () => {
        const result = await createPreferenceService({ preference: createFakePreference({ rank: answer }) }).rank(RANK);
        assert.deepEqual(result, { ...answer, available: true });
    });

    it('rank: when the model is down, gives a random order of the candidates, three of them, and says so', async () => {
        const result = await createPreferenceService({ preference: unavailable(), random: () => 0 }).rank(RANK);
        assert.equal(result.available, false);
        assert.equal(result.ordering, 'fallback_random');
        assert.equal(result.mmr_used, false);
        assert.equal(result.values.length, 3);
        assert.ok(result.values.every(value => RANK.candidates.some(candidate => candidate.value === value)));
        assert.equal(new Set(result.values).size, 3);
    });

    it('rank: the number of cards asked for decides how many come back when the model is down', async () => {
        const result = await createPreferenceService({ preference: unavailable() }).rank({ ...RANK, k: 2 });
        assert.equal(result.values.length, 2);
    });

    it('rank: an order that is different each time, from the random source it was given', async () => {
        const orders = new Set();
        for (let i = 0; i < 20; i++) orders.add((await createPreferenceService({ preference: unavailable() }).rank(RANK)).values.join());
        assert.ok(orders.size > 1);
    });

    it('rank: an answer without any value for candidates that were given counts as no answer', async () => {
        const result = await createPreferenceService({ preference: createFakePreference({ rank: { ...answer, values: [] } }) }).rank(RANK);
        assert.equal(result.available, false);
        assert.equal(result.values.length, 3);
    });

    it('rank: without candidates there is nothing to show, and the model is not blamed', async () => {
        const result = await createPreferenceService({ preference: createFakePreference({ rank: { ...answer, values: [] } }) }).rank({ ...RANK, candidates: [] });
        assert.deepEqual([result.values, result.available], [[], true]);
    });

    it('rank: a failure that is not about availability is not hidden', async () => {
        await assert.rejects(() => createPreferenceService({ preference: createFakePreference({ failWith: new TypeError('bug') }) }).rank(RANK), TypeError);
    });

    it('update, reject-check and reset-session pass on what the model does, and its failure', async () => {
        const preference = createFakePreference({ rejectCheck: { reject_mean: 0.1, exceeds: true } });
        const service = createPreferenceService({ preference });
        await service.update({ pid: 'P01', event: 'pick' });
        assert.deepEqual(await service.rejectCheck({ pid: 'P01' }), { reject_mean: 0.1, exceeds: true });
        await service.resetSession({ pid: 'P01', session_id: 's' });
        assert.deepEqual(preference.calls.map(call => call.method), ['update', 'rejectCheck', 'resetSession']);
        await assert.rejects(() => createPreferenceService({ preference: unavailable() }).update({}), PreferenceUnavailableError);
        await assert.rejects(() => createPreferenceService({ preference: unavailable() }).rejectCheck({}), PreferenceUnavailableError);
        await assert.rejects(() => createPreferenceService({ preference: unavailable() }).resetSession({}), PreferenceUnavailableError);
    });
});

describe('preference service: what a used card changed', () => {
    const CHANGE = { before: 'Old.', after: 'New sentence.' };

    it('gives the analysis of the model and says it was available', async () => {
        const preference = createFakePreference({ analyzeChange: { added: ['New sentence.'], removed: ['Old.'], reworded: 0, kept: 0 } });
        const result = await createPreferenceService({ preference }).analyzeChange(CHANGE);
        assert.deepEqual(result, { added: ['New sentence.'], removed: ['Old.'], reworded: 0, kept: 0, available: true });
        assert.deepEqual(preference.calls[0], { method: 'analyzeChange', payload: CHANGE });
    });

    it('says nothing could be analysed (instead of failing) when the model is down', async () => {
        const preference = createFakePreference({ failWith: new PreferenceUnavailableError('down') });
        const result = await createPreferenceService({ preference }).analyzeChange(CHANGE);
        assert.deepEqual(result, { added: [], removed: [], reworded: 0, kept: 0, available: false });
    });
});

describe('preference service: the profile of an email', () => {
    const REQUEST = { pid: 'P01', session_id: 's1' };
    const PROFILE = { ops_count: 3, strength: 0.5, liked: [{ dimension: 'Tone', value: 'Direct', weight: 1 }], disliked: [], stats: { changes: 2 }, traits: [], recent: [] };

    it('gives the profile of the model and says it was available', async () => {
        const preference = createFakePreference({ profile: PROFILE });
        const result = await createPreferenceService({ preference }).profile(REQUEST);
        assert.deepEqual(result, { ...PROFILE, available: true });
        assert.deepEqual(preference.calls[0], { method: 'profile', payload: REQUEST });
    });

    it('gives an empty profile marked as not available when the model is down (the page then shows nothing)', async () => {
        const preference = createFakePreference({ failWith: new PreferenceUnavailableError('down') });
        const result = await createPreferenceService({ preference }).profile(REQUEST);
        assert.equal(result.available, false);
        assert.deepEqual([result.ops_count, result.liked, result.traits, result.recent], [0, [], [], []]);
        assert.equal(result.evidence, 0);
    });
});
