// The express app: middleware and routes. It gets its services as arguments and knows no model, no folder and no environment variable.
const express = require('express');
const cors = require('cors');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errors');
const { sessionRoutes } = require('./routes/session');
const { emailRoutes } = require('./routes/email');
const { logRoutes } = require('./routes/logs');
const { preferenceRoutes } = require('./routes/preference');

function createHttpApp({ email, session, preference, experimentLog, apiLog, corsOrigins }) {
    const app = express();
    // Only the pages of the app (and calls that come from no page at all) may read the answers
    app.use(cors({ origin: (origin, done) => done(null, !origin || corsOrigins.includes(origin) ? origin || true : false) }));
    app.use(express.json({ limit: '1mb' }));
    app.use(requestLogger(apiLog));
    app.use(logRoutes({ experimentLog, apiLog }));
    app.use(sessionRoutes({ session }));
    app.use(emailRoutes({ email }));
    app.use(preferenceRoutes({ preference }));
    app.use(errorHandler);
    return app;
}

module.exports = { createHttpApp };
