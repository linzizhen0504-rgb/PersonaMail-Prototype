// Google Gemini over its REST interface. The only place that knows its address, its model names and its response shape.
const axios = require('axios');
const http = require('node:http');
const https = require('node:https');
const { ModelOutputError, ModelUnavailableError } = require('../../../contracts/errors');

const defaultPost = (url, body, config) => axios.post(url, body, {
    ...config,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    httpAgent: new http.Agent({ keepAlive: true, timeout: 60000 }),
    httpsAgent: new https.Agent({ keepAlive: true, timeout: 60000 })
});

function createGeminiAdapter({ apiKey, model = 'gemini-3.5-flash', post = defaultPost }) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    return {
        async generate(prompt, { reasoning = false, timeoutMs = 300000 } = {}) {
            // the reasoning hint is this provider's thinking budget
            const request = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { thinkingConfig: { thinkingBudget: reasoning ? 1000 : 0 } }
            };
            let response;
            try {
                response = await post(endpoint, request, { headers: { 'Content-Type': 'application/json' }, timeout: timeoutMs });
            } catch (error) {
                const failure = new ModelUnavailableError(error.response?.data?.error?.message || error.message);
                failure.isTimeout = error.code === 'ECONNABORTED';
                throw failure;
            }
            const candidate = response.data && response.data.candidates && response.data.candidates[0];
            if (candidate && candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                return { text: candidate.content.parts[0].text, request, response: response.data, finishReason: candidate.finishReason };
            }
            if (response.data && response.data.promptFeedback && response.data.promptFeedback.blockReason) {
                throw new ModelOutputError(`Gemini request blocked due to: ${response.data.promptFeedback.blockReason}`);
            }
            throw new ModelOutputError('Gemini returned a response without any candidate');
        }
    };
}

module.exports = { createGeminiAdapter };
