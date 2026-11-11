// Helpers for tests that call a running backend over HTTP and keep their data under a throw-away user name.
const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('./serverProcess');
const assert = require('node:assert/strict');
const { loadEndpoints } = require('../contracts/http');

const SESSION_ROOT = path.join(PROJECT_ROOT, 'src/data/SessionData');
const LOG_ROOT = path.join(PROJECT_ROOT, 'src/data/logs');

const testUserName = () => `zzchar${Math.random().toString(36).slice(2, 8)}`; // no underscore: the old backend finds the user by cutting the task id at the first one

const entries = loadEndpoints();
const endpointFor = (method, route) => {
    const pathOnly = route.split('?')[0];
    return entries.find(entry => entry.method === method && !entry.path.includes(':') && entry.path === pathOnly);
};
const errorEntry = entries.find(entry => entry.name === 'error');

// Every answer that has a description in the contract must match it (and every failure must have the shape of an error)
function assertMatchesContract(method, route, status, json) {
    if (json === null) return;
    if (status >= 400) {
        assert.deepEqual(errorEntry.validateResponse(json), [], `${method} ${route} (${status}) is not an error as the contract describes it: ${JSON.stringify(json)}`);
        return;
    }
    const endpoint = endpointFor(method, route);
    if (endpoint) assert.deepEqual(endpoint.validateResponse(json), [], `${method} ${route} does not answer as the contract describes: ${JSON.stringify(json).slice(0, 200)}`);
}

function createClient(baseUrl) {
    const call = async (method, route, body) => {
        const response = await fetch(`${baseUrl}${route}`, {
            method,
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await response.text();
        let json = null;
        try { json = JSON.parse(text); } catch (error) { /* plain text answer */ }
        assertMatchesContract(method, route, response.status, json);
        return { status: response.status, json, text, type: response.headers.get('content-type') || '' };
    };
    return { get: (route) => call('GET', route), post: (route, body) => call('POST', route, body) };
}

const sessionDir = (userName, taskId) => path.join(SESSION_ROOT, userName, taskId);
const readSessionFile = (userName, taskId, ...parts) => fs.readFileSync(path.join(sessionDir(userName, taskId), ...parts), 'utf-8');
const removeTestData = (userName) => {
    fs.rmSync(path.join(SESSION_ROOT, userName), { recursive: true, force: true });
    fs.rmSync(path.join(LOG_ROOT, `${userName}.jsonl`), { force: true });
};

module.exports = { createClient, testUserName, sessionDir, readSessionFile, removeTestData, SESSION_ROOT, LOG_ROOT };
