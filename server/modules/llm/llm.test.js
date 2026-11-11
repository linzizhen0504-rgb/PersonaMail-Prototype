const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLlm } = require('./index');
const { createGeminiAdapter } = require('./adapters/gemini');
const { createOllamaAdapter } = require('./adapters/ollama');
const { ModelUnavailableError, ModelOutputError } = require('../../contracts/errors');
const { assertPort, PORTS } = require('../../contracts/assertPort');

const noSleep = { sleep: async () => {} };
const adapterReturning = (...steps) => {
    const calls = [];
    return {
        calls,
        generate: async (prompt, options) => {
            calls.push({ prompt, options });
            const step = steps.shift();
            if (step instanceof Error) throw step;
            return { text: step, request: { prompt }, response: { text: step } };
        }
    };
};

describe('createLlm', () => {
    it('is an LlmPort', () => {
        assert.doesNotThrow(() => assertPort(PORTS.LlmPort, createLlm({ adapter: adapterReturning('x') })));
    });

    it('returns the text of the adapter and passes the options on with the default timeout', async () => {
        const adapter = adapterReturning('hello');
        const llm = createLlm({ adapter, ...noSleep });
        assert.equal(await llm.generateText('ask', { reasoning: true }), 'hello');
        assert.deepEqual(adapter.calls[0], { prompt: 'ask', options: { reasoning: true, timeoutMs: 300000 } });
    });

    it('tries again after an error and returns the later answer', async () => {
        const adapter = adapterReturning(new Error('busy'), new Error('busy'), 'finally');
        assert.equal(await createLlm({ adapter, ...noSleep }).generateText('ask'), 'finally');
        assert.equal(adapter.calls.length, 3);
    });

    it('gives up after five tries with a ModelUnavailableError that names the last problem', async () => {
        const adapter = adapterReturning(...Array.from({ length: 6 }, () => new Error('still busy')));
        await assert.rejects(() => createLlm({ adapter, ...noSleep }).generateText('ask'),
            error => error instanceof ModelUnavailableError && /still busy/.test(error.message));
        assert.equal(adapter.calls.length, 5);
    });

    it('waits longer between tries after a timeout than after another error', async () => {
        const waits = [];
        const timeout = Object.assign(new Error('timeout of 5ms exceeded'), { isTimeout: true });
        const adapter = adapterReturning(timeout, new Error('bad gateway'), 'ok');
        await createLlm({ adapter, sleep: async ms => { waits.push(ms); } }).generateText('ask');
        assert.deepEqual(waits, [2 * 5000, 4 * 2500]);
    });

    it('records every call and every failure in the log', async () => {
        const entries = [];
        const adapter = adapterReturning(new Error('busy'), 'fine');
        await createLlm({ adapter, ...noSleep, log: { append: async (type, entry) => { entries.push({ type, entry }); } } }).generateText('ask');
        assert.deepEqual(entries.map(item => item.type), ['gemini', 'gemini']);
        assert.equal(entries[0].entry.error, 'busy');
        assert.equal(entries[1].entry.prompt, 'ask');
        assert.equal(entries[1].entry.retryAttempt, 1);
    });

    it('does not fail when the log cannot be written', async () => {
        const adapter = adapterReturning('fine');
        const log = { append: async () => { throw new Error('disk full'); } };
        assert.equal(await createLlm({ adapter, ...noSleep, log }).generateText('ask'), 'fine');
    });
});

describe('gemini adapter', () => {
    const answer = (text, extra = {}) => ({ status: 200, data: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...extra } });

    it('sends the prompt to the chosen model and returns the text', async () => {
        const sent = [];
        const adapter = createGeminiAdapter({ apiKey: 'K', model: 'gemini-x', post: async (url, body, config) => { sent.push({ url, body, config }); return answer('hi'); } });
        const result = await adapter.generate('ask', { reasoning: false, timeoutMs: 1234 });
        assert.equal(result.text, 'hi');
        assert.match(sent[0].url, /models\/gemini-x:generateContent\?key=K$/);
        assert.deepEqual(sent[0].body.contents, [{ parts: [{ text: 'ask' }] }]);
        assert.equal(sent[0].config.timeout, 1234);
    });

    it('turns the reasoning hint into the thinking budget of this provider', async () => {
        const budgets = [];
        const adapter = createGeminiAdapter({ apiKey: 'K', post: async (url, body) => { budgets.push(body.generationConfig.thinkingConfig.thinkingBudget); return answer('x'); } });
        await adapter.generate('a', { reasoning: true });
        await adapter.generate('a', { reasoning: false });
        assert.deepEqual(budgets, [1000, 0]);
    });

    it('does not put the api key in the request it reports for logging', async () => {
        const adapter = createGeminiAdapter({ apiKey: 'SECRET', post: async () => answer('x') });
        const result = await adapter.generate('a', {});
        assert.ok(!JSON.stringify(result).includes('SECRET'));
    });

    it('reports a blocked request as a ModelOutputError', async () => {
        const adapter = createGeminiAdapter({ apiKey: 'K', post: async () => ({ status: 200, data: { promptFeedback: { blockReason: 'SAFETY' } } }) });
        await assert.rejects(() => adapter.generate('a', {}), error => error instanceof ModelOutputError && /SAFETY/.test(error.message));
    });

    it('reports an answer without candidates as a ModelOutputError', async () => {
        const adapter = createGeminiAdapter({ apiKey: 'K', post: async () => ({ status: 200, data: {} }) });
        await assert.rejects(() => adapter.generate('a', {}), ModelOutputError);
    });

    it('uses the message of the provider and marks a timeout', async () => {
        const failing = createGeminiAdapter({ apiKey: 'K', post: async () => { throw Object.assign(new Error('Request failed'), { response: { data: { error: { message: 'quota used up' } } } }); } });
        await assert.rejects(() => failing.generate('a', {}), /quota used up/);
        const slow = createGeminiAdapter({ apiKey: 'K', post: async () => { throw Object.assign(new Error('timeout of 10ms exceeded'), { code: 'ECONNABORTED' }); } });
        await assert.rejects(() => slow.generate('a', {}), error => error.isTimeout === true);
    });
});

describe('ollama adapter', () => {
    it('asks the chat endpoint of the host with the model and returns the message', async () => {
        const sent = [];
        const adapter = createOllamaAdapter({ host: 'http://h:1', model: 'qwen', post: async (url, body, config) => { sent.push({ url, body, config }); return { status: 200, data: { message: { content: 'hi' } } }; } });
        const result = await adapter.generate('ask', { timeoutMs: 99 });
        assert.equal(result.text, 'hi');
        assert.equal(sent[0].url, 'http://h:1/api/chat');
        assert.equal(sent[0].body.model, 'qwen');
        assert.deepEqual(sent[0].body.messages, [{ role: 'user', content: 'ask' }]);
        assert.equal(sent[0].body.stream, false);
        assert.equal(sent[0].config.timeout, 99);
    });

    it('reports an answer without a message as a ModelOutputError', async () => {
        const adapter = createOllamaAdapter({ host: 'http://h:1', model: 'm', post: async () => ({ status: 200, data: {} }) });
        await assert.rejects(() => adapter.generate('a', {}), ModelOutputError);
    });
});
