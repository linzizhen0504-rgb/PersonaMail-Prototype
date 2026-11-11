const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseModelJson, createJsonRequester } = require('./json');
const { createFakeLlm } = require('./adapters/fake');

describe('parseModelJson', () => {
    it('reads plain json', () => {
        assert.deepEqual(parseModelJson('[{"a":1}]'), [{ a: 1 }]);
    });

    it('reads json inside a code fence', () => {
        assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
    });

    it('reads json surrounded by prose', () => {
        assert.deepEqual(parseModelJson('Here you go: {"a":1} Hope it helps!'), { a: 1 });
    });

    it('reads json whose brackets and underscores were escaped as markdown', () => {
        assert.deepEqual(parseModelJson('\\[{"current\\_value":"x"}\\]'), [{ current_value: 'x' }]);
    });

    it('throws when there is no json', () => {
        assert.throws(() => parseModelJson('no json here'));
    });
});

describe('createJsonRequester', () => {
    const isArray = Array.isArray;

    it('returns the parsed answer', async () => {
        const llm = createFakeLlm(['[1,2]']);
        assert.deepEqual(await createJsonRequester(llm)('ask', {}, isArray), [1, 2]);
    });

    it('asks again when the answer is not json', async () => {
        const llm = createFakeLlm(['nope', '[1]']);
        assert.deepEqual(await createJsonRequester(llm)('ask', {}, isArray), [1]);
        assert.equal(llm.prompts.length, 2);
    });

    it('asks again when the answer has the wrong shape, and gives up after the attempts', async () => {
        const llm = createFakeLlm(['{"a":1}', '{"a":1}', '{"a":1}']);
        await assert.rejects(() => createJsonRequester(llm)('ask', {}, isArray), /unexpected shape/);
        assert.equal(llm.prompts.length, 3);
    });

    it('stops after the number of attempts it was given', async () => {
        const llm = createFakeLlm(['x', 'x', 'x']);
        await assert.rejects(() => createJsonRequester(llm)('ask', {}, isArray, 2));
        assert.equal(llm.prompts.length, 2);
    });

    it('treats an empty answer as a failed attempt', async () => {
        const llm = createFakeLlm(['', '[1]']);
        assert.deepEqual(await createJsonRequester(llm)('ask', {}, isArray), [1]);
    });

    it('hands the options on to the model', async () => {
        const llm = createFakeLlm(['[1]']);
        await createJsonRequester(llm)('ask', { reasoning: true }, isArray);
        assert.deepEqual(llm.options[0], { reasoning: true });
    });
});
