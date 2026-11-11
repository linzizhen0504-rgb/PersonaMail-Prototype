const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeName, newTaskId, parseTaskId } = require('./ids');
const { ValidationError } = require('../../contracts/errors');

describe('assertSafeName', () => {
    for (const name of ['zizhen', 'P01', 'a_b', 'zz_char_1', 'Mia Chen', '李明', 'a.b']) {
        it(`accepts ${name}`, () => assert.equal(assertSafeName(name, 'userName'), name));
    }

    for (const [label, name] of [['empty', ''], ['blank', '   '], ['dots', '..'], ['one dot', '.'], ['a slash', 'a/b'], ['a backslash', 'a\\b'],
        ['a parent folder', '../x'], ['a null byte', 'a\u0000b'], ['too long', 'x'.repeat(101)], ['not text', 42], ['missing', undefined]]) {
        it(`rejects ${label}`, () => assert.throws(() => assertSafeName(name, 'userName'), ValidationError));
    }

    it('names the field in the message', () => {
        assert.throws(() => assertSafeName('..', 'userName'), /userName/);
    });
});

describe('task ids', () => {
    const now = new Date('2026-11-10T12:44:41.888Z');

    it('start with the user name and end with the time', () => {
        assert.equal(newTaskId('zizhen', now), 'zizhen_2026-11-10T12-44-41-888Z');
    });

    it('give the user name back, also when the name has underscores', () => {
        assert.equal(parseTaskId(newTaskId('a_b', now)).userName, 'a_b');
        assert.equal(parseTaskId(newTaskId('zz_char_x1', now)).userName, 'zz_char_x1');
        assert.equal(parseTaskId(newTaskId('zizhen', now)).userName, 'zizhen');
    });

    it('reject a task id that is not of that form or that leaves the folder', () => {
        for (const bad of ['', 'nonsense', 'zizhen_today', '../x_2026-11-10T12-44-41-888Z', 'a/b_2026-11-10T12-44-41-888Z', undefined]) {
            assert.throws(() => parseTaskId(bad), ValidationError, String(bad));
        }
    });
});
