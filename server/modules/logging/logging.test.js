const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createExperimentLog, createApiLog } = require('./index');
const { assertPort, PORTS } = require('../../contracts/assertPort');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('experiment log', () => {
    it('is an ExperimentLog', () => assert.doesNotThrow(() => assertPort(PORTS.ExperimentLog, createExperimentLog({ dir }))));

    it('appends one json line per event to the file of the pid', async () => {
        const log = createExperimentLog({ dir: path.join(dir, 'new-folder') });
        await log.append({ pid: 'P01', event: 'pick' });
        await log.append({ pid: 'P01', event: 'leave' });
        const lines = fs.readFileSync(path.join(dir, 'new-folder', 'P01.jsonl'), 'utf-8').trim().split('\n').map(line => JSON.parse(line));
        assert.deepEqual(lines.map(line => line.event), ['pick', 'leave']);
    });

    it('writes an event without a pid under "unknown"', async () => {
        await createExperimentLog({ dir }).append({ event: 'x' });
        assert.ok(fs.existsSync(path.join(dir, 'unknown.jsonl')));
    });

    it('turns characters that are not allowed in a file name into underscores, so the file stays in the folder', async () => {
        await createExperimentLog({ dir }).append({ pid: '../../evil', event: 'x' });
        assert.deepEqual(fs.readdirSync(dir), ['______evil.jsonl']);
    });
});

describe('api log', () => {
    const at = (iso) => ({ now: () => new Date(iso) });

    it('is an ApiLog', () => assert.doesNotThrow(() => assertPort(PORTS.ApiLog, createApiLog({ dir }))));

    it('appends entries of one day and one type to one file without rewriting the earlier ones', async () => {
        const log = createApiLog({ dir, ...at('2026-11-10T08:00:00Z') });
        await log.append('api', { endpoint: 'a' });
        const first = fs.statSync(path.join(dir, 'api-logs-2026-11-10.jsonl')).size;
        await log.append('api', { endpoint: 'b' });
        assert.ok(fs.statSync(path.join(dir, 'api-logs-2026-11-10.jsonl')).size > first);
        assert.deepEqual((await log.query({ date: '2026-11-10', type: 'api' })).map(entry => entry.endpoint), ['a', 'b']);
    });

    it('keeps model entries apart from request entries', async () => {
        const log = createApiLog({ dir, ...at('2026-11-10T08:00:00Z') });
        await log.append('api', { endpoint: 'a' });
        await log.append('gemini', { prompt: 'p' });
        assert.deepEqual(await log.query({ date: '2026-11-10', type: 'gemini' }), [{ prompt: 'p' }]);
    });

    it('also reads the files the earlier versions wrote (one json array per day)', async () => {
        fs.writeFileSync(path.join(dir, 'api-logs-2026-11-09.json'), JSON.stringify([{ endpoint: 'old' }]));
        const log = createApiLog({ dir, ...at('2026-11-09T08:00:00Z') });
        await log.append('api', { endpoint: 'new' });
        assert.deepEqual((await log.query({ date: '2026-11-09', type: 'api' })).map(entry => entry.endpoint), ['old', 'new']);
    });

    it('answers null for a day without entries', async () => {
        assert.equal(await createApiLog({ dir }).query({ date: '1999-01-01', type: 'api' }), null);
    });

    it('lists the days that have entries, newest first, from both kinds of file', async () => {
        fs.writeFileSync(path.join(dir, 'api-logs-2026-11-08.json'), '[]');
        fs.writeFileSync(path.join(dir, 'gemini-logs-2026-11-09.json'), '[]');
        await createApiLog({ dir, ...at('2026-11-10T08:00:00Z') }).append('api', { endpoint: 'x' });
        fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a log');
        assert.deepEqual(await createApiLog({ dir }).listDates(), ['2026-11-10', '2026-11-09', '2026-11-08']);
    });

    it('removes the files of one day and type, and says which', async () => {
        const log = createApiLog({ dir, ...at('2026-11-10T08:00:00Z') });
        await log.append('api', { endpoint: 'a' });
        await log.append('gemini', { prompt: 'p' });
        assert.deepEqual(await log.clear({ date: '2026-11-10', type: 'gemini' }), ['gemini-logs-2026-11-10.jsonl']);
        assert.deepEqual(await log.listDates(), ['2026-11-10']);
        assert.equal(await log.query({ date: '2026-11-10', type: 'gemini' }), null);
    });

    it('removes both types of one day when no type is given, and every day when no day is given', async () => {
        const log = createApiLog({ dir, ...at('2026-11-10T08:00:00Z') });
        await log.append('api', { endpoint: 'a' });
        await log.append('gemini', { prompt: 'p' });
        fs.writeFileSync(path.join(dir, 'api-logs-2026-11-09.json'), '[]');
        assert.deepEqual((await log.clear({ date: '2026-11-10' })).sort(), ['api-logs-2026-11-10.jsonl', 'gemini-logs-2026-11-10.jsonl']);
        assert.deepEqual(await log.clear({}), ['api-logs-2026-11-09.json']);
    });

    it('does not take a date that would leave the folder', async () => {
        const log = createApiLog({ dir });
        assert.equal(await log.query({ date: '../../x', type: 'api' }), null);
        assert.deepEqual(await log.clear({ date: '../../x', type: 'api' }), []);
    });
});
