// Sessions kept in memory, for tests
const { createSessionRepository } = require('../repository');

function createMemoryStore() {
    const files = new Map();
    return {
        async read(relative) { return files.has(relative) ? files.get(relative) : null; },
        async write(relative, text) { files.set(relative, text); },
        async exists(relative) { return [...files.keys()].some(key => key.startsWith(`${relative}/`)); }
    };
}

const createMemorySessionRepository = () => createSessionRepository(createMemoryStore());

module.exports = { createMemorySessionRepository };
