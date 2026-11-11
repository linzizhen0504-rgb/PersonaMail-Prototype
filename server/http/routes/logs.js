const express = require('express');
const { route } = require('../middleware/errors');

// The experiment events and the record of requests
function logRoutes({ experimentLog, apiLog }) {
    const router = express.Router();

    router.post('/log-event', route(async (req, res) => {
        await experimentLog.append(req.body || {});
        res.json({ ok: true });
    }));

    router.get('/api-logs/dates', route(async (req, res) => {
        res.json({ availableDates: await apiLog.listDates() });
    }));

    router.get('/api-logs', route(async (req, res) => {
        const { date, type } = req.query;
        const logDate = date || new Date().toISOString().split('T')[0];
        const logs = await apiLog.query({ date: logDate, type: type === 'gemini' ? 'gemini' : 'api' });
        if (logs === null) {
            res.json({ message: `No logs found for ${logDate}`, availableDates: await apiLog.listDates() });
            return;
        }
        res.json({ date: logDate, type: type || 'api', totalEntries: logs.length, logs, availableDates: await apiLog.listDates() });
    }));

    router.delete('/api-logs', route(async (req, res) => {
        const { date, type } = req.query;
        const deleted = await apiLog.clear({ date, type: type === 'gemini' || type === 'api' ? type : undefined });
        if (date && (type === 'gemini' || type === 'api')) {
            if (deleted.length === 0) {
                res.status(404).json({ error: `Log file ${type}-logs-${date}.json not found` });
                return;
            }
            res.json({ message: `Deleted ${deleted[0]}` });
        } else if (date) {
            res.json({ message: `Deleted log files for ${date}`, deletedFiles: deleted });
        } else {
            res.json({ message: 'All logs cleared', deletedFiles: deleted });
        }
    }));

    return router;
}

module.exports = { logRoutes };
