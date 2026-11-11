// A stand-in for the model server: answers POST /api/chat with the next reply that the test queued.
// Every prompt that reaches it is kept in `prompts`, so a test can look at what the server asked.
const http = require('node:http');

async function startFakeOllama() {
    const replies = [];
    const prompts = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const prompt = JSON.parse(body).messages[0].content;
            prompts.push(prompt);
            if (replies.length === 0) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'no reply queued' }));
                return;
            }
            const reply = replies.shift();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: { content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }));
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        prompts,
        queue: (...next) => { replies.push(...next); },
        reset: () => { replies.length = 0; prompts.length = 0; },
        close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })
    };
}

module.exports = { startFakeOllama };
