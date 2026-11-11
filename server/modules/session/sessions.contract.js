// The behaviour every SessionRepository must have. Called with a way to make a fresh repository.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertPort, PORTS } = require('../../contracts/assertPort');
const { ValidationError } = require('../../contracts/errors');

function describeSessionRepository(label, makeRepository) {
    describe(`SessionRepository: ${label}`, () => {
        it('has every method of the port', async () => {
            const { repository } = await makeRepository();
            assert.doesNotThrow(() => assertPort(PORTS.SessionRepository, repository));
        });

        it('creates a session whose task id starts with the user name', async () => {
            const { repository } = await makeRepository();
            const ref = await repository.createSession('mia');
            assert.equal(ref.userName, 'mia');
            assert.match(ref.taskId, /^mia_/);
            assert.equal(await repository.hasSession(ref), true);
        });

        it('a new session has an empty draft, no choices, no intents and an empty original task', async () => {
            const { repository } = await makeRepository();
            const ref = await repository.createSession('mia');
            assert.equal(await repository.readDraft(ref), '');
            assert.deepEqual(await repository.readChoices(ref), {});
            assert.deepEqual(await repository.readIntents(ref), []);
            const meta = await repository.readMeta(ref);
            assert.deepEqual([meta.user, meta.task_id, meta.original_task], ['mia', ref.taskId, '']);
        });

        it('reads back what was written', async () => {
            const { repository } = await makeRepository();
            const ref = await repository.createSession('mia');
            await repository.writeDraft(ref, 'Subject: Hi');
            await repository.writeChoices(ref, { familiarity: { id: 'familiarity' } });
            await repository.writeIntents(ref, [{ dimension: 'Tone' }]);
            assert.equal(await repository.readDraft(ref), 'Subject: Hi');
            assert.deepEqual(await repository.readChoices(ref), { familiarity: { id: 'familiarity' } });
            assert.deepEqual(await repository.readIntents(ref), [{ dimension: 'Tone' }]);
        });

        it('updateMeta changes the given fields and keeps the others', async () => {
            const { repository } = await makeRepository();
            const ref = await repository.createSession('mia');
            const meta = await repository.updateMeta(ref, { original_task: 'Ask for an extension' });
            assert.equal(meta.original_task, 'Ask for an extension');
            assert.equal((await repository.readMeta(ref)).user, 'mia');
        });

        it('reads null, and does not throw, for a session that is not there', async () => {
            const { repository } = await makeRepository();
            const ref = { userName: 'nobody', taskId: 'nobody_2000-01-01T00-00-00-000Z' };
            assert.equal(await repository.hasSession(ref), false);
            assert.equal(await repository.readDraft(ref), null);
            assert.equal(await repository.readChoices(ref), null);
            assert.equal(await repository.readIntents(ref), null);
            assert.equal(await repository.readMeta(ref), null);
            assert.equal(await repository.readFile(ref, 'drafts/latest.md'), null);
        });

        it('keeps the sessions of users with underscores in their names apart', async () => {
            const { repository } = await makeRepository();
            const first = await repository.createSession('a_b');
            const second = await repository.createSession('a');
            await repository.writeDraft(first, 'first');
            await repository.writeDraft(second, 'second');
            assert.equal(await repository.readDraft(first), 'first');
            assert.equal(await repository.readDraft(second), 'second');
        });

        it('gives a file of the session with its extension', async () => {
            const { repository } = await makeRepository();
            const ref = await repository.createSession('mia');
            await repository.writeDraft(ref, 'text');
            assert.deepEqual(await repository.readFile(ref, 'drafts/latest.md'), { content: 'text', extension: '.md' });
            const task = await repository.readFile(ref, 'meta/task.json');
            assert.equal(task.extension, '.json');
            assert.equal(JSON.parse(task.content).user, 'mia');
        });

        for (const bad of ['../../package.json', '../other/meta/task.json', '/etc/passwd', 'drafts/../../x']) {
            it(`refuses the path ${bad}`, async () => {
                const { repository } = await makeRepository();
                const ref = await repository.createSession('mia');
                await assert.rejects(() => repository.readFile(ref, bad), ValidationError);
            });
        }

        it('refuses a user name or a task id that is not safe', async () => {
            const { repository } = await makeRepository();
            await assert.rejects(() => repository.createSession('../evil'), ValidationError);
            await assert.rejects(() => repository.readDraft({ userName: 'mia', taskId: '../../x' }), ValidationError);
            await assert.rejects(() => repository.readDraft({ userName: '..', taskId: 'mia_2000-01-01T00-00-00-000Z' }), ValidationError);
        });
    });
}

module.exports = { describeSessionRepository };
