// The http contract: contracts/schemas/<endpoint>.json says, for every endpoint, what a request holds and what the answer holds.
// The server checks requests against it; the tests check the answers; the page checks what it sends and what it expects (src/api tests).
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const SCHEMA_DIR = path.join(__dirname, '../../contracts/schemas');

const messages = (validate) => (data) => {
    if (validate(data)) return [];
    return validate.errors.map(error => {
        const where = error.instancePath ? `${error.instancePath.slice(1).replace(/\//g, '.')} ` : '';
        if (error.keyword === 'required') return `${error.params.missingProperty} is required`;
        return `${where}${error.message}`.trim();
    });
};

// Every entry of the contract: { name, method, path, description, validateRequest(body) -> messages, validateResponse(body) -> messages }.
// The entry called "error" has no method and no path: it is how every endpoint answers when it cannot serve a call.
function loadEndpoints(dir = SCHEMA_DIR) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    return fs.readdirSync(dir).filter(file => file.endsWith('.json')).sort().map(file => {
        const spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        return {
            name: spec.name,
            method: spec.method,
            path: spec.path,
            description: spec.description,
            validateRequest: spec.request ? messages(ajv.compile(spec.request)) : () => [],
            validateResponse: spec.response ? messages(ajv.compile(spec.response)) : () => []
        };
    });
}

module.exports = { loadEndpoints, SCHEMA_DIR };
