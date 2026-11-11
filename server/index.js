// Starts the backend: node server/index.js (or npm run server)
const path = require('node:path');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });

const { loadConfig } = require('./config');
const { createServerApp } = require('./app');

let config;
try {
    config = loadConfig(process.env, { root });
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

createServerApp(config).listen(config.port, () => {
    console.log(`Server running on port ${config.port} (${config.llm.provider}: ${config.llm.model})`);
});
