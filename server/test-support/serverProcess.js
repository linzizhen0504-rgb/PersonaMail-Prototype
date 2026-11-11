// Starts the backend as its own process on a free port, with the fake model server as its model, and stops it again.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const freePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
    probe.on('error', reject);
});

async function startServer({ entry = process.env.SERVER_ENTRY || 'src/pages/serverGM.js', modelUrl }) {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(PROJECT_ROOT, entry)], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PORT: String(port), OLLAMA_MODEL: 'fake', OLLAMA_HOST: modelUrl, GEMINI_API_KEY: '' },
        stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 15000;
    for (;;) {
        if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode}): ${stderr.slice(-400)}`);
        try {
            const response = await fetch(`${url}/api-logs/dates`);
            if (response.ok) break;
        } catch (error) {
            // not listening yet
        }
        if (Date.now() > deadline) { child.kill(); throw new Error(`server did not start: ${stderr.slice(-400)}`); }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return {
        url,
        stop: () => new Promise(resolve => { child.once('exit', resolve); child.kill(); })
    };
}

module.exports = { startServer, PROJECT_ROOT };
