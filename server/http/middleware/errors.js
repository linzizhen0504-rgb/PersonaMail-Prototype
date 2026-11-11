// The one place where an error becomes an answer.
const { httpStatusFor } = require('../../contracts/errors');

// Wraps an async route so that what it throws reaches the error handler
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, next) => {
    const status = error.status && error.status < 500 ? error.status : httpStatusFor(error);
    if (status >= 500) console.error(`${req.method} ${req.url}:`, error);
    res.status(status).json({ error: error.message || 'Error', code: error.code || 'INTERNAL' });
};

module.exports = { route, errorHandler };
