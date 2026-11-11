// Checks the body of a request against the contract (contracts/schemas) before the route does anything with it.
const { ValidationError } = require('../../contracts/errors');

function createContractCheck(entries) {
    const byName = new Map(entries.map(entry => [entry.name, entry]));
    return (name) => {
        const endpoint = byName.get(name);
        if (!endpoint) throw new Error(`the contract has no endpoint called ${name}`);
        return (req, res, next) => {
            const problems = endpoint.validateRequest(req.body === undefined ? {} : req.body);
            next(problems.length > 0 ? new ValidationError(problems.join('; ')) : undefined);
        };
    };
}

module.exports = { createContractCheck };
