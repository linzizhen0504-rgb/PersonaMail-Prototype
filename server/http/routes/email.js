const express = require('express');
const { route } = require('../middleware/errors');
const { ValidationError } = require('../../contracts/errors');

// Writing an email: factors, draft, components, intents and their rewrites
function emailRoutes({ email }) {
    const router = express.Router();
    const refOf = ({ userName, taskId }, message) => {
        if (!userName || !taskId) throw new ValidationError(message);
        return { userName, taskId };
    };

    router.post('/select-factors', route(async (req, res) => {
        res.json(await email.selectFactors(req.body));
    }));

    router.post('/generate-first-draft', route(async (req, res) => {
        res.json({ draft: await email.generateFirstDraft(req.body) });
    }));

    router.post('/component-extractor', route(async (req, res) => {
        const ref = refOf(req.body, 'Missing required fields: taskId or userName');
        res.json({ components: await email.extractComponents(ref) });
    }));

    router.post('/intent-analyzer-new', route(async (req, res) => {
        const { userTask } = req.body;
        if (!userTask) throw new ValidationError('Missing required fields: userTask, userName, or taskId');
        const ref = refOf(req.body, 'Missing required fields: userTask, userName, or taskId');
        res.json({ message: 'Intents saved successfully', intents: await email.analyzeIntents({ userTask, ref }) });
    }));

    router.post('/component-intent-link', route(async (req, res) => {
        const { componentList } = req.body;
        if (!componentList) throw new ValidationError('Missing required fields: userName, taskId, or componentList');
        const ref = refOf(req.body, 'Missing required fields: userName, taskId, or componentList');
        res.json({ links: await email.linkComponents({ ref, componentList }) });
    }));

    router.post('/intent-change-rewriter', route(async (req, res) => {
        const { userName, taskId, ...rest } = req.body;
        let ref = { userName, taskId };
        if (!userName || !taskId) ref = null;
        if (!ref) throw new ValidationError('Missing required fields in the request body');
        res.json(await email.rewriteForIntent({ ref, ...rest }));
    }));

    router.post('/intent-consistency-check', route(async (req, res) => {
        res.json({ results: await email.checkConsistency(req.body) });
    }));

    router.post('/intent-regenerate-values', route(async (req, res) => {
        const { userName, taskId, ...rest } = req.body;
        res.json({ other_values: await email.regenerateValues({ ref: userName && taskId ? { userName, taskId } : undefined, ...rest }) });
    }));

    router.post('/ai-generate-rewrite', route(async (req, res) => {
        const ref = refOf(req.body, 'Missing required fields');
        res.json({ rewrittenContent: await email.rewriteSelection({ ...req.body, ref }) });
    }));

    router.post('/ai-add-content', route(async (req, res) => {
        const ref = refOf(req.body, 'Missing required fields');
        res.json({ revisedDraft: await email.addContent({ ...req.body, ref }) });
    }));

    return router;
}

module.exports = { emailRoutes };
