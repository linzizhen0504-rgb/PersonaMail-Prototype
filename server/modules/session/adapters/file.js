// Sessions as folders and files on disk: <root>/<user>/<task>/{meta,factors,intents,drafts,localized,logs}/...
const fs = require('node:fs');
const path = require('node:path');
const { createSessionRepository } = require('../repository');

function createFileStore(root) {
    const base = path.resolve(root);
    const resolve = (relative) => {
        const target = path.resolve(base, relative);
        if (target !== base && !target.startsWith(base + path.sep)) throw new Error('path outside the session folder');
        return target;
    };
    return {
        async read(relative) {
            try {
                return fs.readFileSync(resolve(relative), 'utf-8');
            } catch (error) {
                if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
                throw error;
            }
        },
        async write(relative, text) {
            const target = resolve(relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, text, 'utf-8');
        },
        async exists(relative) {
            try {
                return fs.statSync(resolve(relative)).isDirectory();
            } catch (error) {
                return false;
            }
        }
    };
}

const createFileSessionRepository = ({ root }) => createSessionRepository(createFileStore(root));

module.exports = { createFileSessionRepository };
