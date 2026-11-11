// A local Ollama server (a model that runs on this computer).
const axios = require('axios');
const { ModelOutputError, ModelUnavailableError } = require('../../../contracts/errors');

function createOllamaAdapter({ host = 'http://localhost:11434', model, post = axios.post }) {
    return {
        async generate(prompt, { timeoutMs = 300000 } = {}) {
            const request = {
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                keep_alive: '30m',
                options: { num_ctx: 8192 }
            };
            let response;
            try {
                response = await post(`${host}/api/chat`, request, { timeout: timeoutMs });
            } catch (error) {
                const failure = new ModelUnavailableError(error.message);
                failure.isTimeout = error.code === 'ECONNABORTED';
                throw failure;
            }
            const text = response.data && response.data.message && response.data.message.content;
            if (typeof text !== 'string') throw new ModelOutputError('Ollama returned a response without a message');
            return { text, request, response: response.data };
        }
    };
}

module.exports = { createOllamaAdapter };
