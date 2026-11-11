// The LlmPort: one question to a language model, with retries and a record of every call.
// An adapter (adapters/gemini.js, adapters/ollama.js) does the single call to one provider; this module is the same for all of them.
const { ModelUnavailableError } = require('../../contracts/errors');
const { parseModelJson, createJsonRequester } = require('./json');
const { createGeminiAdapter } = require('./adapters/gemini');
const { createOllamaAdapter } = require('./adapters/ollama');
const { createFakeLlm } = require('./adapters/fake');

const DEFAULT_TIMEOUT_MS = 300000;

function createLlm({ adapter, log = null, maxRetries = 5, sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)) }) {
    const record = async (entry) => {
        if (!log) return;
        try {
            await log.append('gemini', { timestamp: new Date().toISOString(), ...entry });
        } catch (error) {
            console.error('Could not write the model log:', error.message);
        }
    };

    return {
        async generateText(prompt, options = {}) {
            const callOptions = { timeoutMs: DEFAULT_TIMEOUT_MS, ...options };
            const requestId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const result = await adapter.generate(prompt, callOptions);
                    await record({ requestId, prompt, requestBody: result.request, response: result.response, retryAttempt: attempt });
                    return result.text;
                } catch (error) {
                    console.error(`Model request failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);
                    await record({ requestId, prompt, error: error.message, retryAttempt: attempt });
                    if (attempt + 1 === maxRetries) {
                        throw new ModelUnavailableError(`gave up after ${maxRetries} attempts: ${error.message}`);
                    }
                    // A timeout waits longer than other errors: 10s, 20s, 40s, 80s against 5s, 10s, 20s, 40s
                    const isTimeout = error.isTimeout || /socket hang up|timeout/i.test(error.message);
                    await sleep(Math.pow(2, attempt + 1) * (isTimeout ? 5000 : 2500));
                }
            }
            throw new ModelUnavailableError('the model request failed');
        }
    };
}

module.exports = { createLlm, createGeminiAdapter, createOllamaAdapter, createFakeLlm, parseModelJson, createJsonRequester };
