// The http layer in one process: real routes, fake model, sessions in memory.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHttpApp } = require('./app');
const { createEmailServices } = require('../modules/email');
const { createSessionService, createMemorySessionRepository } = require('../modules/session');
const { createFakeLlm } = require('../modules/llm/adapters/fake');
const { createPromptStore } = require('../modules/prompts');
const { createMemoryFactorCatalog } = require('../modules/catalog');
const { createPreferenceService } = require('../modules/preference');
const { PreferenceUnavailableError } = require('../contracts/errors');

const PROMPTS = path.join(__dirname, '../../public/data/Prompts');
let server;
let base;
let llm;
let sessions;
let experimentEvents;
let apiEntries;
let preferenceDown = false;
const preferenceCalls = [];

before(async () => {
    llm = createFakeLlm([]);
    sessions = createMemorySessionRepository();
    experimentEvents = [];
    apiEntries = [];
    const modelAnswering = async (method, payload, result) => {
        preferenceCalls.push({ method, payload });
        if (preferenceDown) throw new PreferenceUnavailableError('connection refused');
        return result;
    };
    const app = createHttpApp({
        preference: createPreferenceService({ preference: {
            rank: (request) => modelAnswering('rank', request, { values: ['B', 'A'], ordering: 'preference', mmr_used: false, style_strength: 0.2, scores: { A: 1 }, style_scores: { A: 0 } }),
            update: (event) => modelAnswering('update', event, { ok: true }),
            rejectCheck: (request) => modelAnswering('rejectCheck', request, { reject_mean: 0.4, exceeds: true }),
            resetSession: (request) => modelAnswering('resetSession', request, { ok: true })
        } }),
        email: createEmailServices({ llm, sessions, prompts: createPromptStore({ dir: PROMPTS }), catalog: createMemoryFactorCatalog([]) }),
        session: createSessionService({ sessions }),
        experimentLog: { append: async (record) => { experimentEvents.push(record); } },
        apiLog: {
            append: async (type, entry) => { apiEntries.push({ type, entry }); },
            listDates: async () => ['2026-11-10'],
            query: async ({ date }) => (date === '2026-11-10' ? [{ endpoint: 'x' }] : null),
            clear: async ({ date, type }) => (date === '2026-11-10' && type === 'api' ? ['api-logs-2026-11-10.jsonl'] : [])
        },
        corsOrigins: ['http://localhost:3000']
    });
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));

const call = async (method, route, body, headers = {}) => {
    const response = await fetch(`${base}${route}`, {
        method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { /* text */ }
    return { status: response.status, json, text, headers: response.headers };
};
const newSession = async (userName) => (await call('POST', '/create-session', { userName, userInput: 'x' })).json.taskId;

describe('users with underscores in their names', () => {
    it('can save a draft and read it back (the user used to be read as the text before the first underscore)', async () => {
        const taskId = await newSession('zz_char_1');
        assert.equal((await call('POST', `/sessiondata/${taskId}/drafts/latest.md`, { content: 'Hello' })).status, 200);
        const read = await call('GET', `/sessiondata/${taskId}/drafts/latest.md`);
        assert.equal(read.status, 200);
        assert.equal(read.text, 'Hello');
    });

    it('keep their sessions apart from those of a user whose name is the first part', async () => {
        const underscore = await newSession('ab_cd');
        const plain = await newSession('ab');
        await call('POST', `/sessiondata/${underscore}/drafts/latest.md`, { content: 'underscore' });
        await call('POST', `/sessiondata/${plain}/drafts/latest.md`, { content: 'plain' });
        assert.equal((await call('GET', `/sessiondata/${underscore}/drafts/latest.md`)).text, 'underscore');
        assert.equal((await call('GET', `/sessiondata/${plain}/drafts/latest.md`)).text, 'plain');
    });
});

describe('paths that try to leave the session folder', () => {
    it('are refused when they climb out of it', async () => {
        const taskId = await newSession('mia');
        const response = await call('GET', `/sessiondata/${taskId}/..%2F..%2F..%2F..%2Fpackage.json`);
        assert.equal(response.status, 400);
        assert.equal(response.json.code, 'VALIDATION');
    });

    it('are refused when the task id itself is a path', async () => {
        assert.equal((await call('GET', '/sessiondata/..%2F..%2Fx/meta/task.json')).status, 400);
        assert.equal((await call('POST', '/sessiondata/..%2F..%2Fx/drafts/latest.md', { content: 'x' })).status, 400);
    });

    it('are refused for a user name that is a path', async () => {
        assert.equal((await call('POST', '/create-session', { userName: '../evil', userInput: 'x' })).status, 400);
        assert.equal((await call('POST', '/update-task-meta', { userName: '../evil', taskId: 'x', originalTask: 'y' })).status, 400);
        assert.equal((await call('POST', '/save-factor-choices', { userName: 'a/b', taskId: 'x', factorChoices: {} })).status, 400);
    });
});

describe('answers to a call that cannot be served', () => {
    it('a missing field is a 400 with the message and a code', async () => {
        const response = await call('POST', '/create-session', { userName: 'mia' });
        assert.equal(response.status, 400);
        assert.ok(typeof response.json.error === 'string' && response.json.error.length > 0);
        assert.equal(response.json.code, 'VALIDATION');
    });

    it('a task that does not exist is a 404', async () => {
        const response = await call('POST', '/component-extractor', { userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' });
        assert.equal(response.status, 404);
        assert.equal(response.json.code, 'NOT_FOUND');
    });

    it('a model that gives nothing usable is a 500 with its code', async () => {
        llm.queue('no', 'no', 'no');
        const response = await call('POST', '/select-factors', { userTask: 'Write something' });
        assert.equal(response.status, 500);
        assert.equal(response.json.code, 'MODEL_OUTPUT');
    });

    it('an unexpected error is a 500 that does not show where it came from', async () => {
        const response = await call('POST', '/intent-analyzer-new', { userTask: 'x', userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' });
        assert.equal(response.status, 500);
        assert.ok(!/at .*\.js/.test(response.text));
    });
});

describe('who may call', () => {
    it('lets the page of the app call (the origin is allowed)', async () => {
        const response = await call('GET', '/api-logs/dates', undefined, { Origin: 'http://localhost:3000' });
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    });

    it('does not let a page of another site read the answers', async () => {
        const response = await call('GET', '/api-logs/dates', undefined, { Origin: 'http://evil.example' });
        assert.equal(response.headers.get('access-control-allow-origin'), null);
    });
});

describe('the record of requests', () => {
    it('keeps every request with its answer, without the headers that hold secrets', async () => {
        apiEntries.length = 0;
        await call('GET', '/api-logs/dates', undefined, { Authorization: 'Bearer SECRET', Cookie: 'session=SECRET' });
        const logged = apiEntries.find(item => item.entry.request.url === '/api-logs/dates');
        assert.equal(logged.type, 'api');
        assert.equal(logged.entry.response.statusCode, 200);
        assert.equal(logged.entry.endpoint, '_api-logs_dates');
        assert.ok(!JSON.stringify(logged.entry).includes('SECRET'));
    });

    it('log-event passes the event on to the experiment log', async () => {
        const response = await call('POST', '/log-event', { pid: 'P01', event: 'pick' });
        assert.deepEqual(response.json, { ok: true });
        assert.deepEqual(experimentEvents.at(-1), { pid: 'P01', event: 'pick' });
    });

    it('api-logs/dates, api-logs and delete api-logs answer as before', async () => {
        assert.deepEqual((await call('GET', '/api-logs/dates')).json, { availableDates: ['2026-11-10'] });
        const day = await call('GET', '/api-logs?date=2026-11-10');
        assert.deepEqual([day.json.date, day.json.type, day.json.totalEntries, day.json.availableDates], ['2026-11-10', 'api', 1, ['2026-11-10']]);
        const none = await call('GET', '/api-logs?date=1999-01-01');
        assert.equal(none.json.message, 'No logs found for 1999-01-01');
        assert.deepEqual((await call('DELETE', '/api-logs?date=2026-11-10&type=api')).json, { message: 'Deleted api-logs-2026-11-10.jsonl' });
        assert.equal((await call('DELETE', '/api-logs?date=1999-01-01&type=api')).status, 404);
    });
});

describe('preference', () => {
    const rankBody = { pid: 'P01', context: 'Equal', intent_dimension: 'Tone', k: 2, candidates: [{ value: 'A', text: 'a' }, { value: 'B', text: 'b' }, { value: 'C', text: 'c' }] };
    const reset = () => { preferenceDown = false; preferenceCalls.length = 0; };

    it('rank answers with the order of the model and says that it came from the model', async () => {
        reset();
        const response = await call('POST', '/preference/rank', rankBody);
        assert.equal(response.status, 200);
        assert.deepEqual(response.json.values, ['B', 'A']);
        assert.equal(response.json.available, true);
        assert.equal(response.json.style_strength, 0.2);
        assert.deepEqual(preferenceCalls[0].payload, rankBody);
    });

    it('rank still answers when the model is down: a random order and available false', async () => {
        reset();
        preferenceDown = true;
        const response = await call('POST', '/preference/rank', rankBody);
        preferenceDown = false;
        assert.equal(response.status, 200);
        assert.equal(response.json.available, false);
        assert.equal(response.json.ordering, 'fallback_random');
        assert.equal(response.json.values.length, 2);
    });

    it('rank needs the participant, the context, the intent and the candidates', async () => {
        reset();
        for (const missing of ['pid', 'context', 'intent_dimension', 'candidates']) {
            const body = { ...rankBody };
            delete body[missing];
            const response = await call('POST', '/preference/rank', body);
            assert.equal(response.status, 400, missing);
            assert.equal(response.json.code, 'VALIDATION');
        }
        assert.equal(preferenceCalls.length, 0);
    });

    it('update passes the event on', async () => {
        reset();
        const event = { pid: 'P01', context: 'Equal', intent_dimension: 'Tone', event: 'pick', chosen_value: 'A', shown_values: ['A', 'B'] };
        const response = await call('POST', '/preference/update', event);
        assert.deepEqual([response.status, response.json.ok], [200, true]);
        assert.deepEqual(preferenceCalls[0], { method: 'update', payload: event });
    });

    it('update says 503 when the model is down, so that the page knows it was not recorded', async () => {
        reset();
        preferenceDown = true;
        const response = await call('POST', '/preference/update', { pid: 'P01', context: 'Equal', intent_dimension: 'Tone', event: 'pick' });
        preferenceDown = false;
        assert.equal(response.status, 503);
        assert.equal(response.json.code, 'PREFERENCE_UNAVAILABLE');
    });

    it('reject-check gives the answer of the model, or 503', async () => {
        reset();
        const body = { pid: 'P01', context: 'Equal', intent_dimension: 'Tone' };
        assert.deepEqual((await call('POST', '/preference/reject-check', body)).json, { reject_mean: 0.4, exceeds: true });
        preferenceDown = true;
        assert.equal((await call('POST', '/preference/reject-check', body)).status, 503);
        preferenceDown = false;
    });

    it('reset-session passes on, or says 503', async () => {
        reset();
        assert.equal((await call('POST', '/preference/reset-session', { pid: 'P01', session_id: 's' })).status, 200);
        preferenceDown = true;
        assert.equal((await call('POST', '/preference/reset-session', { pid: 'P01', session_id: 's' })).status, 503);
        preferenceDown = false;
    });

    it('update, reject-check and reset-session need their fields', async () => {
        reset();
        assert.equal((await call('POST', '/preference/update', { pid: 'P01' })).status, 400);
        assert.equal((await call('POST', '/preference/reject-check', { pid: 'P01' })).status, 400);
        assert.equal((await call('POST', '/preference/reset-session', { pid: 'P01' })).status, 400);
    });
});
