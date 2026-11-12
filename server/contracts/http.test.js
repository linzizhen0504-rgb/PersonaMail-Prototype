const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadEndpoints } = require('./http');
const { createServerApp } = require('../app');
const os = require('node:os');
const path = require('node:path');
const { createFakeLlm } = require('../modules/llm');

const entries = loadEndpoints();
const endpoints = entries.filter(entry => entry.method); // the routes (the entry "error" is not one)
const byName = (name) => entries.find(entry => entry.name === name);

describe('the http contract (contracts/schemas)', () => {
    it('describes each endpoint once, with a name, a method, a path and a response', () => {
        assert.ok(endpoints.length >= 20);
        assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
        for (const endpoint of endpoints) {
            assert.ok(endpoint.name && endpoint.method && endpoint.path, JSON.stringify(endpoint.name));
            assert.ok(['GET', 'POST', 'DELETE'].includes(endpoint.method), endpoint.name);
            assert.ok(endpoint.validateResponse, `${endpoint.name} has no response`);
        }
    });

    it('has a description for every route the server has, and for no route it does not have', () => {
        const app = createServerApp({
            port: 0, llm: { provider: 'ollama', model: 'm', host: 'http://127.0.0.1:1' }, corsOrigins: [], preference: { url: 'http://127.0.0.1:1', timeoutMs: 50 },
            dirs: { sessions: path.join(os.tmpdir(), 'c-s'), experimentLogs: path.join(os.tmpdir(), 'c-e'), apiLogs: path.join(os.tmpdir(), 'c-a'), prompts: path.join(__dirname, '../../public/data/Prompts') },
            files: { factorList: path.join(__dirname, '../../public/data/PredefinedData/factor_list.json') }
        }, { llm: createFakeLlm([]) });
        const routes = [];
        const walk = (stack) => stack.forEach(layer => {
            if (layer.route) Object.keys(layer.route.methods).forEach(method => routes.push(`${method.toUpperCase()} ${layer.route.path}`));
            else if (layer.handle && layer.handle.stack) walk(layer.handle.stack);
        });
        walk(app._router.stack);
        const described = endpoints.map(endpoint => `${endpoint.method} ${endpoint.path}`);
        assert.deepEqual(routes.sort(), described.sort());
    });

    it('accepts a good create-session request and says what is wrong with a bad one', () => {
        const endpoint = byName('create-session');
        assert.deepEqual(endpoint.validateRequest({ userName: 'mia', userInput: 'Write to my professor' }), []);
        const errors = endpoint.validateRequest({ userName: 'mia' });
        assert.ok(errors.some(message => /userInput/.test(message)), errors.join('; '));
        assert.ok(endpoint.validateRequest({ userName: 42, userInput: 'x' }).some(message => /userName/.test(message)));
    });

    it('the rewriter accepts what the sender already changed, and refuses an example that is not complete', () => {
        const endpoint = byName('intent-change-rewriter');
        const base = {
            userName: 'mia', taskId: 'mia_2026-11-10T12-44-41-888Z', userTask: 'x', draftLatest: 'x', componentCurrent: 'x',
            intentSelected: { dimension: 'Tone', current_value: 'Warm' }, intentOthers: []
        };
        assert.deepEqual(endpoint.validateRequest(base), []);
        assert.deepEqual(endpoint.validateRequest({ ...base, styleExamples: [{ dimension: 'Tone', value: 'Warm', before: 'a', after: 'b' }] }), []);
        assert.ok(endpoint.validateRequest({ ...base, styleExamples: [{ dimension: 'Tone', value: 'Warm', before: 'a' }] }).length > 0);
        assert.ok(endpoint.validateRequest({ ...base, styleExamples: 'Warm' }).length > 0);
        const example = { dimension: 'Tone', value: 'Warm', before: 'a', after: 'b' };
        assert.deepEqual(endpoint.validateRequest({ ...base, styleExamples: [{ ...example, analysis: { added: ['New.'], removed: [], reworded: 1, kept: 0 } }] }), []);
        assert.ok(endpoint.validateRequest({ ...base, styleExamples: [{ ...example, analysis: { added: 'New.', removed: [] } }] }).length > 0);
        assert.ok(endpoint.validateRequest({ ...base, styleExamples: [{ ...example, analysis: { added: ['1', '2', '3', '4', '5', '6'], removed: [] } }] }).length > 0);
    });

    it('the rewriter accepts a style profile and refuses one that is not well formed', () => {
        const endpoint = byName('intent-change-rewriter');
        const base = {
            userName: 'mia', taskId: 'mia_2026-11-10T12-44-41-888Z', userTask: 'x', draftLatest: 'x', componentCurrent: 'x',
            intentSelected: { dimension: 'Tone', current_value: 'Warm' }, intentOthers: []
        };
        const good = { traits: ['Tends to make texts shorter'], liked: ['Direct'], disliked: [], lengthChangePct: -23 };
        assert.deepEqual(endpoint.validateRequest({ ...base, styleProfile: good }), []);
        assert.deepEqual(endpoint.validateRequest({ ...base, styleProfile: { ...good, lengthChangePct: null } }), []);
        assert.ok(endpoint.validateRequest({ ...base, styleProfile: { ...good, traits: 'shorter' } }).length > 0);
        assert.ok(endpoint.validateRequest({ ...base, styleProfile: 'Warm' }).length > 0);
    });

    it('lets a request carry fields the contract does not know (older and newer pages)', () => {
        assert.deepEqual(byName('create-session').validateRequest({ userName: 'mia', userInput: 'x', extra: true }), []);
    });

    it('checks the shape of an answer too', () => {
        const endpoint = byName('create-session');
        assert.deepEqual(endpoint.validateResponse({ message: 'ok', taskId: 'mia_2026-11-10T12-44-41-888Z' }), []);
        assert.ok(endpoint.validateResponse({ message: 'ok' }).some(message => /taskId/.test(message)));
    });

    it('knows the list of versions of the rewriter and the answer of the consistency check', () => {
        assert.deepEqual(byName('intent-change-rewriter').validateResponse({ component_variations: [{ intent_value: 'Warm', content: 'Hi' }] }), []);
        assert.ok(byName('intent-change-rewriter').validateResponse({ component_variations: [{ intent_value: 'Warm' }] }).length > 0);
        assert.deepEqual(byName('intent-consistency-check').validateResponse({ results: [{ id: 'a', needs_change: true, reason: '' }] }), []);
        assert.ok(byName('intent-consistency-check').validateResponse({ results: [{ id: 'a', needs_change: 'yes' }] }).length > 0);
    });

    it('requires at least one target for a consistency check and three values for regenerate-values to be answered', () => {
        const check = byName('intent-consistency-check');
        const base = { intentSelected: { dimension: 'Tone', current_value: 'Cool' }, source: { title: 'A', oldContent: 'a', newContent: 'b' } };
        assert.ok(check.validateRequest({ ...base, targets: [] }).length > 0);
        assert.deepEqual(check.validateRequest({ ...base, targets: [{ id: 'x', title: 'X', content: 'x' }] }), []);
        assert.ok(byName('intent-regenerate-values').validateResponse({ other_values: ['a', 'b'] }).length > 0);
    });

    it('describes the answer of an error', () => {
        const endpoint = byName('error');
        assert.deepEqual(endpoint.validateResponse({ error: 'userName is required', code: 'VALIDATION' }), []);
    });
});
