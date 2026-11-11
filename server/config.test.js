const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadConfig } = require('./config');

const ROOT = '/project';

describe('loadConfig', () => {
    it('uses Gemini when there is a key, with the model and port of the earlier versions', () => {
        const config = loadConfig({ GEMINI_API_KEY: 'K' }, { root: ROOT });
        assert.deepEqual([config.port, config.llm.provider, config.llm.apiKey, config.llm.model], [3001, 'gemini', 'K', 'gemini-3.5-flash']);
    });

    it('uses a local Ollama model when OLLAMA_MODEL is set, even with a key', () => {
        const config = loadConfig({ GEMINI_API_KEY: 'K', OLLAMA_MODEL: 'qwen2.5:7b', OLLAMA_HOST: 'http://h:1' }, { root: ROOT });
        assert.deepEqual([config.llm.provider, config.llm.model, config.llm.host], ['ollama', 'qwen2.5:7b', 'http://h:1']);
    });

    it('asks for Ollama on its usual address when no host is given', () => {
        assert.equal(loadConfig({ OLLAMA_MODEL: 'm' }, { root: ROOT }).llm.host, 'http://localhost:11434');
    });

    it('refuses to start without a key and without a local model, and says what to set', () => {
        assert.throws(() => loadConfig({}, { root: ROOT }), /GEMINI_API_KEY.*OLLAMA_MODEL/);
    });

    it('takes the port and the model name from the environment', () => {
        const config = loadConfig({ GEMINI_API_KEY: 'K', PORT: '4000', GEMINI_MODEL: 'gemini-x' }, { root: ROOT });
        assert.deepEqual([config.port, config.llm.model], [4000, 'gemini-x']);
    });

    it('keeps the data where the earlier versions kept it', () => {
        const { dirs, files } = loadConfig({ GEMINI_API_KEY: 'K' }, { root: ROOT });
        assert.equal(dirs.sessions, path.join(ROOT, 'src/data/SessionData'));
        assert.equal(dirs.experimentLogs, path.join(ROOT, 'src/data/logs'));
        assert.equal(dirs.apiLogs, path.join(ROOT, 'src/pages/api_logs'));
        assert.equal(dirs.prompts, path.join(ROOT, 'public/data/Prompts'));
        assert.equal(files.factorList, path.join(ROOT, 'public/data/PredefinedData/factor_list.json'));
    });

    it('lets the pages of the app on this computer call by default, and other origins only when named', () => {
        assert.deepEqual(loadConfig({ GEMINI_API_KEY: 'K' }, { root: ROOT }).corsOrigins, ['http://localhost:3000', 'http://127.0.0.1:3000']);
        assert.deepEqual(loadConfig({ GEMINI_API_KEY: 'K', CORS_ORIGINS: 'http://a:1, http://b:2' }, { root: ROOT }).corsOrigins, ['http://a:1', 'http://b:2']);
    });
});
