const express = require('express');
const { route } = require('../middleware/errors');

// Sessions, their draft and their files
function sessionRoutes({ session }) {
    const router = express.Router();

    router.post('/create-session', route(async (req, res) => {
        const { taskId } = await session.createSession(req.body);
        res.status(200).json({ message: 'Session 数据已创建', taskId });
    }));

    router.post('/save-factor-choices', route(async (req, res) => {
        await session.saveFactorChoices(req.body);
        res.status(200).json({ message: 'Factor choices saved successfully' });
    }));

    router.post('/update-task-meta', route(async (req, res) => {
        await session.updateTaskMeta(req.body);
        res.status(200).json({ message: 'Task meta updated successfully' });
    }));

    router.get('/sessiondata/:taskId/*', route(async (req, res) => {
        const { content, extension } = await session.readFile({ taskId: req.params.taskId, relativePath: req.params[0] });
        if (extension === '.json') res.type('application/json');
        else if (extension === '.md') res.type('text/plain');
        else res.type(extension || 'text/plain');
        res.send(content);
    }));

    router.post('/sessiondata/:taskId/drafts/latest.md', route(async (req, res) => {
        await session.saveDraft({ taskId: req.params.taskId, content: (req.body || {}).content });
        res.status(200).json({ message: 'Content saved successfully.' });
    }));

    return router;
}

module.exports = { sessionRoutes };
