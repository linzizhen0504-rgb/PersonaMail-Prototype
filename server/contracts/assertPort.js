const { PORTS } = require('./ports');

// Stops the start-up with a clear message when an implementation does not have every method of its port
function assertPort(port, implementation) {
    if (!implementation || typeof implementation !== 'object' && typeof implementation !== 'function') {
        throw new Error(`${port.name}: no implementation was given`);
    }
    const missing = port.methods.filter(method => typeof implementation[method] !== 'function');
    if (missing.length > 0) {
        throw new Error(`${port.name}: the implementation has no ${missing.join(', ')}`);
    }
    return implementation;
}

module.exports = { assertPort, PORTS };
