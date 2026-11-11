const express = require('express');
const { route } = require('../middleware/errors');
const { ValidationError } = require('../../contracts/errors');

const need = (body, fields) => {
    const missing = fields.filter(field => body[field] === undefined || body[field] === null || body[field] === '');
    if (missing.length > 0) throw new ValidationError(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    return body;
};

// What the page asks of the preference model. It never talks to the model service itself.
function preferenceRoutes({ preference, check }) {
    const router = express.Router();

    router.post('/preference/rank', check('preference-rank'), route(async (req, res) => {
        const body = need(req.body, ['pid', 'context', 'intent_dimension', 'candidates']);
        if (!Array.isArray(body.candidates)) throw new ValidationError('candidates must be a list');
        res.json(await preference.rank(body));
    }));

    router.post('/preference/update', check('preference-update'), route(async (req, res) => {
        res.json(await preference.update(need(req.body, ['pid', 'context', 'intent_dimension', 'event'])));
    }));

    router.post('/preference/reject-check', check('preference-reject-check'), route(async (req, res) => {
        res.json(await preference.rejectCheck(need(req.body, ['pid', 'context', 'intent_dimension'])));
    }));

    router.post('/preference/reset-session', check('preference-reset-session'), route(async (req, res) => {
        res.json(await preference.resetSession(need(req.body, ['pid', 'session_id'])));
    }));

    return router;
}

module.exports = { preferenceRoutes };
