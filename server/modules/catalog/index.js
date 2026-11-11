// The predefined communication factors (factor_list.json).
const fs = require('node:fs');

const createFileFactorCatalog = ({ file }) => ({
    async list() {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
});

const createMemoryFactorCatalog = (factors) => ({ async list() { return factors; } });

module.exports = { createFileFactorCatalog, createMemoryFactorCatalog };
