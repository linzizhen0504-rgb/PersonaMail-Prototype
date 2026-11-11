// The composition root: the only place that knows which implementation stands behind each port.
// Every part can be given instead (tests give fakes); each one is checked against its port before the app starts.
const { createHttpApp } = require('./http/app');
const { assertPort, PORTS } = require('./contracts/assertPort');
const { createLlm, createGeminiAdapter, createOllamaAdapter } = require('./modules/llm');
const { createPromptStore } = require('./modules/prompts');
const { createFileSessionRepository, createSessionService } = require('./modules/session');
const { createExperimentLog, createApiLog } = require('./modules/logging');
const { createFileFactorCatalog } = require('./modules/catalog');
const { createEmailServices } = require('./modules/email');
const { createModelServicePreference, createPreferenceService } = require('./modules/preference');

function createAdapter(llmConfig) {
    if (llmConfig.provider === 'gemini') return createGeminiAdapter({ apiKey: llmConfig.apiKey, model: llmConfig.model });
    if (llmConfig.provider === 'ollama') return createOllamaAdapter({ host: llmConfig.host, model: llmConfig.model });
    throw new Error(`unknown model provider: ${llmConfig.provider}`);
}

function createServerApp(config, overrides = {}) {
    const apiLog = assertPort(PORTS.ApiLog, overrides.apiLog || createApiLog({ dir: config.dirs.apiLogs }));
    const experimentLog = assertPort(PORTS.ExperimentLog, overrides.experimentLog || createExperimentLog({ dir: config.dirs.experimentLogs }));
    const sessions = assertPort(PORTS.SessionRepository, overrides.sessions || createFileSessionRepository({ root: config.dirs.sessions }));
    const prompts = assertPort(PORTS.PromptStore, overrides.prompts || createPromptStore({ dir: config.dirs.prompts }));
    const catalog = assertPort(PORTS.FactorCatalog, overrides.catalog || createFileFactorCatalog({ file: config.files.factorList }));
    const preference = assertPort(PORTS.PreferencePort, overrides.preference || createModelServicePreference({ baseUrl: config.preference.url, timeoutMs: config.preference.timeoutMs }));
    const llm = assertPort(PORTS.LlmPort, overrides.llm || createLlm({ adapter: createAdapter(config.llm), log: apiLog }));

    return createHttpApp({
        email: createEmailServices({ llm, sessions, prompts, catalog }),
        preference: createPreferenceService({ preference }),
        session: createSessionService({ sessions }),
        experimentLog,
        apiLog,
        corsOrigins: config.corsOrigins
    });
}

module.exports = { createServerApp };
