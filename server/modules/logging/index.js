// The two logs of the server. ExperimentLog: what the participants did (jsonl per participant). ApiLog: every request the server handled
// and every model call, appended to one file per day and type.
const fs = require('node:fs');
const path = require('node:path');

function createExperimentLog({ dir }) {
    return {
        async append(record) {
            const pid = String((record && record.pid) || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown';
            fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(path.join(dir, `${pid}.jsonl`), JSON.stringify(record) + '\n');
        }
    };
}

const PREFIX = { api: 'api', gemini: 'gemini' };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILE_PATTERN = /^(api|gemini)-logs-(\d{4}-\d{2}-\d{2})\.jsonl?$/;

function createApiLog({ dir, now = () => new Date() }) {
    const filesOf = (date, type) => {
        if (!DATE_PATTERN.test(String(date))) return [];
        const types = type ? [type] : Object.keys(PREFIX);
        return types.flatMap(each => PREFIX[each] ? [`${PREFIX[each]}-logs-${date}.json`, `${PREFIX[each]}-logs-${date}.jsonl`] : []);
    };
    const listFiles = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => FILE_PATTERN.test(file)) : []);

    return {
        async append(type, entry) {
            fs.mkdirSync(dir, { recursive: true });
            const date = now().toISOString().split('T')[0];
            fs.appendFileSync(path.join(dir, `${PREFIX[type] || 'api'}-logs-${date}.jsonl`), JSON.stringify(entry) + '\n');
        },
        async listDates() {
            return [...new Set(listFiles().map(file => FILE_PATTERN.exec(file)[2]))].sort().reverse();
        },
        // The entries of one day and type: the older array file first, then the lines appended since
        async query({ date, type }) {
            const [legacy, lines] = filesOf(date, type || 'api').map(file => path.join(dir, file));
            if (!legacy) return null;
            const entries = [];
            let found = false;
            if (fs.existsSync(legacy)) {
                found = true;
                entries.push(...JSON.parse(fs.readFileSync(legacy, 'utf-8')));
            }
            if (fs.existsSync(lines)) {
                found = true;
                fs.readFileSync(lines, 'utf-8').split('\n').filter(Boolean).forEach(line => entries.push(JSON.parse(line)));
            }
            return found ? entries : null;
        },
        // Deletes the files of one day and type, of one day (both types), or all; returns their names
        async clear({ date, type }) {
            const candidates = date ? filesOf(date, type) : listFiles();
            const removed = candidates.filter(file => fs.existsSync(path.join(dir, file)));
            removed.forEach(file => fs.unlinkSync(path.join(dir, file)));
            return removed;
        }
    };
}

module.exports = { createExperimentLog, createApiLog };
