// Records every request with its answer in the ApiLog (secrets in the headers are left out).
const SECRET_HEADERS = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key'];

const MAX_LOGGED_CHARS = 20000;
const PREVIEW_CHARS = 2000;

// A request or an answer that is very long is kept as its size and its start (a draft or a list of logs would fill the disk)
const shortened = (data) => {
    if (data === undefined || data === null) return data;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (text.length <= MAX_LOGGED_CHARS) return data;
    return { truncated: true, size: text.length, preview: text.slice(0, PREVIEW_CHARS) };
};

const withoutSecrets = (headers) => Object.fromEntries(Object.entries(headers).filter(([name]) => !SECRET_HEADERS.includes(name.toLowerCase())));

function requestLogger(apiLog) {
    return (req, res, next) => {
        // Reading or clearing the record is not recorded: its answer is the record, which would then contain itself and grow at every reading
        if (req.url.startsWith('/api-logs')) return next();
        const startedAt = Date.now();
        const requestId = `${startedAt}-${Math.random().toString(36).slice(2, 11)}`;
        const request = {
            requestId, timestamp: new Date().toISOString(), method: req.method, url: req.url,
            headers: withoutSecrets(req.headers), body: shortened(req.body), query: req.query, params: req.params
        };
        let recorded = false;
        const record = (data) => {
            if (recorded) return;
            recorded = true;
            const duration = Date.now() - startedAt;
            console.log(`${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
            Promise.resolve(apiLog.append('api', {
                endpoint: req.url.replace(/[^a-zA-Z0-9-_]/g, '_'),
                request,
                response: { requestId, timestamp: new Date().toISOString(), statusCode: res.statusCode, data: shortened(data), duration: `${duration}ms` }
            })).catch(error => console.error('Could not write the request log:', error.message));
        };
        const json = res.json.bind(res);
        const send = res.send.bind(res);
        res.json = (data) => { record(data); return json(data); };
        res.send = (data) => { record(data); return send(data); };
        next();
    };
}

module.exports = { requestLogger };
