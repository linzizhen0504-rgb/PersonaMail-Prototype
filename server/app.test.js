const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { createServerApp } = require('./app');
const { createFakeLlm } = require('./modules/llm/adapters/fake');

const baseConfig = () => ({
    port: 0,
    llm: { provider: 'ollama', model: 'm', host: 'http://127.0.0.1:1' },
    corsOrigins: [],
    preference: { url: 'http://127.0.0.1:1', timeoutMs: 50 },
    dirs: { sessions: path.join(os.tmpdir(), 'app-test-sessions'), experimentLogs: path.join(os.tmpdir(), 'app-test-exp'), apiLogs: path.join(os.tmpdir(), 'app-test-api'), prompts: path.join(__dirname, '../public/data/Prompts') },
    files: { factorList: path.join(__dirname, '../public/data/PredefinedData/factor_list.json') }
});

describe('createServerApp', () => {
    it('starts with the parts it makes itself', () => {
        assert.equal(typeof createServerApp(baseConfig()).listen, 'function');
    });

    it('takes a part that is given instead of making its own', () => {
        assert.doesNotThrow(() => createServerApp(baseConfig(), { llm: createFakeLlm([]) }));
    });

    it('does not start when a given part lacks a method of its port, and names the port and the method', () => {
        assert.throws(() => createServerApp(baseConfig(), { llm: {} }), /LlmPort.*generateText/);
        assert.throws(() => createServerApp(baseConfig(), { sessions: { createSession: async () => ({}) } }), /SessionRepository.*readDraft/);
        assert.throws(() => createServerApp(baseConfig(), { experimentLog: {} }), /ExperimentLog.*append/);
        assert.throws(() => createServerApp(baseConfig(), { preference: { rank: async () => ({}) } }), /PreferencePort.*update/);
    });

    it('does not start for a provider it does not know', () => {
        const config = baseConfig();
        config.llm = { provider: 'nobody' };
        assert.throws(() => createServerApp(config), /nobody/);
    });
});
