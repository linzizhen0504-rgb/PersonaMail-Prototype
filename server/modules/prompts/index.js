// The PromptStore: prompt files with {{KEY}} places, filled in with the values of one request.
const fs = require('node:fs');
const path = require('node:path');

// One pass over the template: a place is filled with its value as it is (never read as a replacement pattern), and nothing that was
// inserted is looked at again. A place without a value stays as it is.
const fill = (template, values) => template.replace(/\{\{([A-Z_]+)\}\}/g, (place, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : place
));

function createPromptStore({ dir }) {
    const root = path.resolve(dir);
    return {
        render(name, values = {}) {
            const file = path.resolve(root, name);
            if (file !== root && !file.startsWith(root + path.sep)) throw new Error(`prompt ${name} is not allowed: it is outside the prompt folder`);
            let template;
            try {
                template = fs.readFileSync(file, 'utf-8');
            } catch (error) {
                throw new Error(`prompt ${name} could not be read: ${error.message}`);
            }
            return fill(template, values);
        }
    };
}

// Templates held in memory, for tests
function createMemoryPromptStore(templates) {
    return {
        render(name, values = {}) {
            if (!Object.prototype.hasOwnProperty.call(templates, name)) throw new Error(`prompt ${name} does not exist`);
            return fill(templates[name], values);
        }
    };
}

module.exports = { createPromptStore, createMemoryPromptStore };
