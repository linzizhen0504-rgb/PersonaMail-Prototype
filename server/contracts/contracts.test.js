const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError, NotFoundError, ModelUnavailableError, ModelOutputError, PreferenceUnavailableError, httpStatusFor } = require('./errors');
const { assertPort, PORTS } = require('./assertPort');

describe('error to http status', () => {
    it('a validation error is a 400', () => {
        assert.equal(httpStatusFor(new ValidationError('userName is required')), 400);
    });

    it('a missing thing is a 404', () => {
        assert.equal(httpStatusFor(new NotFoundError('latest.md not found')), 404);
    });

    it('a model that cannot be reached or whose answer cannot be used is a 500 (as the clients know it)', () => {
        assert.equal(httpStatusFor(new ModelUnavailableError('timeout')), 500);
        assert.equal(httpStatusFor(new ModelOutputError('not json')), 500);
    });

    it('a preference model that cannot be reached is a 503, so a client can tell it from a failure of the server', () => {
        assert.equal(httpStatusFor(new PreferenceUnavailableError('connection refused')), 503);
        assert.equal(new PreferenceUnavailableError('x').code, 'PREFERENCE_UNAVAILABLE');
    });

    it('anything else is a 500', () => {
        assert.equal(httpStatusFor(new Error('boom')), 500);
    });

    it('every typed error carries a code for the client', () => {
        assert.equal(new ValidationError('x').code, 'VALIDATION');
        assert.equal(new NotFoundError('x').code, 'NOT_FOUND');
        assert.equal(new ModelUnavailableError('x').code, 'MODEL_UNAVAILABLE');
        assert.equal(new ModelOutputError('x').code, 'MODEL_OUTPUT');
    });
});

describe('assertPort', () => {
    const complete = { generateText: async () => 'x' };

    it('accepts an implementation that has every method of the port', () => {
        assert.doesNotThrow(() => assertPort(PORTS.LlmPort, complete));
    });

    it('names the port and the missing method when one is absent', () => {
        assert.throws(() => assertPort(PORTS.LlmPort, {}), /LlmPort.*generateText/);
    });

    it('rejects an implementation whose member is not a function', () => {
        assert.throws(() => assertPort(PORTS.LlmPort, { generateText: 'nope' }), /LlmPort.*generateText/);
    });

    it('rejects a missing implementation', () => {
        assert.throws(() => assertPort(PORTS.LlmPort, undefined), /LlmPort/);
    });

    it('describes every method of every port', () => {
        for (const port of Object.values(PORTS)) {
            assert.ok(port.name && Array.isArray(port.methods) && port.methods.length > 0, port.name);
        }
    });
});
