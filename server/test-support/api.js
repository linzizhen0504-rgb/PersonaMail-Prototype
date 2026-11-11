// Helpers for tests that call a running backend over HTTP and keep their data under a throw-away user name.
const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('./serverProcess');

const SESSION_ROOT = path.join(PROJECT_ROOT, 'src/data/SessionData');
const LOG_ROOT = path.join(PROJECT_ROOT, 'src/data/logs');

const testUserName = () => `zzchar${Math.random().toString(36).slice(2, 8)}`; // no underscore: the old backend finds the user by cutting the task id at the first one

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
