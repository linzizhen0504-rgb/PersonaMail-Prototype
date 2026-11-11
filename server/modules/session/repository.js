// The SessionRepository, written once over a small store (where the files live: a folder on disk, or memory).
const path = require('node:path');
const { assertSafeName, newTaskId } = require('./ids');
const { ValidationError } = require('../../contracts/errors');

const json = (value) => JSON.stringify(value, null, 2);

function createSessionRepository(store) {
    const taskPath = (ref) => `${assertSafeName(ref.userName, 'userName')}/${assertSafeName(ref.taskId, 'taskId')}`;
    const readText = async (ref, relative) => store.read(`${taskPath(ref)}/${relative}`);
    const readJson = async (ref, relative) => {
        const text = await readText(ref, relative);
        return text === null ? null : JSON.parse(text);
    };
    const write = (ref, relative, text) => store.write(`${taskPath(ref)}/${relative}`, text);

    return {
        async createSession(userName) {
            assertSafeName(userName, 'userName');
            const ref = { userName, taskId: newTaskId(userName) };
            await write(ref, 'meta/task.json', json({ user: userName, task_id: ref.taskId, created_iso: new Date().toISOString(), original_task: '' }));
            await write(ref, 'intents/history.json', json([]));
            await write(ref, 'intents/current.json', json([]));
            await write(ref, 'factors/choices.json', json({}));
            for (const draft of ['00_first.md', '01_regen.md', 'latest.md']) await write(ref, `drafts/${draft}`, '');
            await write(ref, 'localized/001_variation.json', json({}));
            await write(ref, 'localized/002_direct_rewrite.json', json({}));
            await write(ref, 'logs/regen_01.json', json({}));
            return ref;
        },
        hasSession: async (ref) => store.exists(taskPath(ref)),
        readDraft: (ref) => readText(ref, 'drafts/latest.md'),
        writeDraft: (ref, text) => write(ref, 'drafts/latest.md', text),
        readChoices: (ref) => readJson(ref, 'factors/choices.json'),
        writeChoices: (ref, choices) => write(ref, 'factors/choices.json', json(choices)),
        readIntents: (ref) => readJson(ref, 'intents/current.json'),
        writeIntents: (ref, intents) => write(ref, 'intents/current.json', json(intents)),
        readMeta: (ref) => readJson(ref, 'meta/task.json'),
        async updateMeta(ref, patch) {
            const meta = { ...((await readJson(ref, 'meta/task.json')) || {}), ...patch };
            await write(ref, 'meta/task.json', json(meta));
            return meta;
        },
        async readFile(ref, relativePath) {
            const base = taskPath(ref);
            const normalized = path.posix.normalize(String(relativePath));
            if (!relativePath || path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || String(relativePath).includes('\u0000')) {
                throw new ValidationError('the path leaves the task folder');
            }
            const content = await store.read(`${base}/${normalized}`);
            return content === null ? null : { content, extension: path.posix.extname(normalized).toLowerCase() };
        }
    };
}

module.exports = { createSessionRepository };
