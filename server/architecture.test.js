// The rules of the architecture, checked on the source: who may depend on whom.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = __dirname;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
});
const sources = walk(SERVER).filter(file => file.endsWith('.js') && !/\.test\.js$|\.contract\.js$/.test(file) && !file.includes(`${path.sep}test-support${path.sep}`) && !file.includes(`${path.sep}characterization${path.sep}`));
const requiresOf = (file) => [...fs.readFileSync(file, 'utf-8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
const rel = (file) => path.relative(SERVER, file).split(path.sep).join('/');
const inside = (file, folder) => rel(file).startsWith(`${folder}/`);
const resolved = (file, request) => (request.startsWith('.') ? path.relative(SERVER, path.resolve(path.dirname(file), request)).split(path.sep).join('/') : null);

describe('modules reach each other only through their entry point', () => {
    for (const file of sources.filter(each => inside(each, 'modules'))) {
        it(`${rel(file)}`, () => {
            const own = rel(file).split('/')[1];
            for (const request of requiresOf(file)) {
                const target = resolved(file, request);
                if (target === null || target.startsWith('contracts')) continue;
                const [, module, ...rest] = target.split('/');
                if (module === own) continue;
                assert.ok(target.startsWith('modules/') && rest.length === 0, `${request}: go through modules/${module}/index.js, not into its inside`);
            }
        });
    }
});

describe('the business code does not touch a disk, a network or the environment', () => {
    const forbidden = ['fs', 'node:fs', 'axios', 'http', 'https', 'node:http', 'node:https', 'child_process', 'node:child_process'];
    for (const file of sources.filter(each => inside(each, 'modules/email') || inside(each, 'http'))) {
        it(`${rel(file)}`, () => {
            const used = requiresOf(file).filter(request => forbidden.includes(request));
            assert.deepEqual(used, [], `${rel(file)} must not use ${used.join(', ')}`);
            assert.ok(!/process\.env/.test(fs.readFileSync(file, 'utf-8')), 'must not read the environment');
        });
    }

    it('does not depend on an adapter or on a provider', () => {
        for (const file of sources.filter(each => inside(each, 'modules/email'))) {
            for (const request of requiresOf(file)) {
                assert.ok(!/adapters/.test(request) && !/gemini|ollama/i.test(request), `${rel(file)} requires ${request}`);
            }
        }
    });
});

describe('only the start-up script reads the environment', () => {
    for (const file of sources) {
        it(`${rel(file)}`, () => {
            const reads = /process\.env/.test(fs.readFileSync(file, 'utf-8'));
            assert.equal(reads, rel(file) === 'index.js', `${rel(file)}: process.env (only index.js hands the environment to loadConfig)`);
        });
    }
});

describe('the http layer only calls services', () => {
    for (const file of sources.filter(each => inside(each, 'http/routes'))) {
        it(`${rel(file)}`, () => {
            for (const request of requiresOf(file)) {
                const target = resolved(file, request);
                assert.ok(target === null || target.startsWith('http/') || target.startsWith('contracts'), `${rel(file)} requires ${request}`);
            }
        });
    }
});

describe('the model providers are only named where they are made', () => {
    for (const file of sources.filter(each => !inside(each, 'modules/llm') && rel(each) !== 'app.js' && rel(each) !== 'config.js')) {
        it(`${rel(file)}`, () => {
            const text = fs.readFileSync(file, 'utf-8').replace(/\/\/.*$/gm, '');
            assert.ok(!/generativelanguage|ollama/i.test(text), 'names a provider');
        });
    }
});
