const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPromptStore, createMemoryPromptStore } = require('./index');
const { assertPort, PORTS } = require('../../contracts/assertPort');

describe('prompt store', () => {
    let dir;
    before(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
        fs.writeFileSync(path.join(dir, 'greeting.prompt.md'), 'Task: {{USER_TASK}}\nDraft: {{DRAFT}}\nAgain: {{USER_TASK}}');
    });
    after(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('is a PromptStore', () => {
        assert.doesNotThrow(() => assertPort(PORTS.PromptStore, createPromptStore({ dir })));
        assert.doesNotThrow(() => assertPort(PORTS.PromptStore, createMemoryPromptStore({})));
    });

    it('fills every place of a value from the file of that name', () => {
        const text = createPromptStore({ dir }).render('greeting.prompt.md', { USER_TASK: 'write', DRAFT: 'hello' });
        assert.equal(text, 'Task: write\nDraft: hello\nAgain: write');
    });

    it('takes a value literally, also when it looks like a replacement pattern', () => {
        const text = createPromptStore({ dir }).render('greeting.prompt.md', { USER_TASK: 'costs $& and $1', DRAFT: 'd' });
        assert.ok(text.startsWith('Task: costs $& and $1'));
    });

    it('does not fill a placeholder that sits inside an inserted value', () => {
        const text = createPromptStore({ dir }).render('greeting.prompt.md', { USER_TASK: 'see {{DRAFT}}', DRAFT: 'real' });
        assert.equal(text, 'Task: see {{DRAFT}}\nDraft: real\nAgain: see {{DRAFT}}');
    });

    it('leaves a placeholder without a value as it is', () => {
        const text = createPromptStore({ dir }).render('greeting.prompt.md', { USER_TASK: 'x' });
        assert.ok(text.includes('{{DRAFT}}'));
    });

    it('says which prompt is missing', () => {
        assert.throws(() => createPromptStore({ dir }).render('nothing.prompt.md', {}), /nothing\.prompt\.md/);
    });

    it('does not read files outside its folder', () => {
        assert.throws(() => createPromptStore({ dir }).render('../package.json', {}), /not allowed|outside/i);
    });
});

describe('memory prompt store', () => {
    it('renders from templates held in memory', () => {
        assert.equal(createMemoryPromptStore({ a: 'Hi {{NAME}}' }).render('a', { NAME: 'Mia' }), 'Hi Mia');
    });

    it('fails for a template it does not have', () => {
        assert.throws(() => createMemoryPromptStore({}).render('a', {}), /a/);
    });
});
