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

const PROMPTS = path.join(__dirname, '../../public/data/Prompts');
let server;
let base;
let llm;
let sessions;
let experimentEvents;
let apiEntries;

before(async () => {
    llm = createFakeLlm([]);
    sessions = createMemorySessionRepository();
    experimentEvents = [];
    apiEntries = [];
    const app = createHttpApp({
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
