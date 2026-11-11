const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { describeSessionRepository } = require('./sessions.contract');
const { createFileSessionRepository } = require('./adapters/file');
const { createMemorySessionRepository } = require('./adapters/memory');

const folders = [];
describeSessionRepository('memory', async () => ({ repository: createMemorySessionRepository() }));
describeSessionRepository('files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-'));
    folders.push(root);
    return { repository: createFileSessionRepository({ root }), root };
});
after(() => folders.forEach(folder => fs.rmSync(folder, { recursive: true, force: true })));

describe('file session repository: layout on disk', () => {
    const make = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-'));
        folders.push(root);
        return { root, repository: createFileSessionRepository({ root }) };
    };

    it('keeps the folders and files that the earlier versions made', async () => {
        const { root, repository } = make();
        const ref = await repository.createSession('mia');
        const task = path.join(root, 'mia', ref.taskId);
        for (const folder of ['meta', 'factors', 'intents', 'drafts', 'localized', 'logs']) assert.ok(fs.statSync(path.join(task, folder)).isDirectory(), folder);
        for (const file of ['drafts/00_first.md', 'drafts/01_regen.md', 'drafts/latest.md', 'intents/history.json', 'intents/current.json',
            'factors/choices.json', 'meta/task.json', 'localized/001_variation.json', 'localized/002_direct_rewrite.json', 'logs/regen_01.json']) {
            assert.ok(fs.existsSync(path.join(task, file)), file);
        }
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(task, 'intents/history.json'), 'utf-8')), []);
    });

    it('writes a draft into a session folder that was only partly there', async () => {
        const { root, repository } = make();
        const ref = { userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' };
        await repository.writeDraft(ref, 'hello');
        assert.equal(fs.readFileSync(path.join(root, 'mia', ref.taskId, 'drafts', 'latest.md'), 'utf-8'), 'hello');
    });
});
