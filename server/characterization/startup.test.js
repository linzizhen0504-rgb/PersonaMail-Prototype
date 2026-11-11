const test = require('node:test');
const assert = require('node:assert/strict');
const { startFakeOllama } = require('../test-support/fakeOllama');
const { startServer } = require('../test-support/serverProcess');

test('the server listens on the port named in PORT', async () => {
    const model = await startFakeOllama();
    let server;
    try {
        server = await startServer({ modelUrl: model.url });
        const response = await fetch(`${server.url}/api-logs/dates`);
        assert.equal(response.status, 200);
    } finally {
        if (server) await server.stop();
        await model.close();
    }
});
