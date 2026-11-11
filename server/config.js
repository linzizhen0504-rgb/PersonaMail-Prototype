// The one place that reads the environment: which model, which port, where the data lives.
const path = require('node:path');

const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function loadConfig(env, { root }) {
    const ollamaModel = env.OLLAMA_MODEL;
    if (!env.GEMINI_API_KEY && !ollamaModel) {
        throw new Error('Set GEMINI_API_KEY or OLLAMA_MODEL in the .env file in the project folder');
    }
    // A local model is used when one is named; otherwise Gemini
    const llm = ollamaModel
        ? { provider: 'ollama', model: ollamaModel, host: env.OLLAMA_HOST || 'http://localhost:11434' }
        : { provider: 'gemini', apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-3.5-flash' };
    return {
        port: Number(env.PORT) || 3001,
        llm,
        corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean) : DEFAULT_CORS_ORIGINS,
        dirs: {
            sessions: path.join(root, 'src/data/SessionData'),
            experimentLogs: path.join(root, 'src/data/logs'),
            apiLogs: path.join(root, 'src/pages/api_logs'),
            prompts: path.join(root, 'public/data/Prompts')
        },
        files: { factorList: path.join(root, 'public/data/PredefinedData/factor_list.json') }
    };
}

module.exports = { loadConfig };
