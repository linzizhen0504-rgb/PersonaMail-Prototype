// The rules of the email domain that need neither a model nor a disk.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, plainName } = require('./names');
const { cleanLinks, ensureEveryComponentLinked } = require('./links');
const { alignVariationValues, variationsMatchValues } = require('./variations');
const { filterFactorChoices, cleanFactorSelection } = require('./factors');
const { createJsonRequester } = require('../llm/json');
const { createFakeLlm } = require('../llm/adapters/fake');

describe('names', () => {
    it('normalizeName ignores case, underscores and repeated spaces', () => {
        assert.equal(normalizeName('  Tone_of   Voice '), 'tone of voice');
    });

    it('plainName keeps only the first of two names joined with a slash', () => {
        assert.equal(plainName('Call to Action / Proposed Next Steps'), 'Call to Action');
        assert.equal(plainName('Warm/friendly'), 'Warm');
        assert.equal(plainName('Brisk'), 'Brisk');
    });

    it('plainName keeps the text when nothing is before the slash', () => {
        assert.equal(plainName('/ only'), '/ only');
    });
});

describe('cleanLinks', () => {
    const components = [{ id: 'greeting', title: 'Greeting' }, { id: 'closing', title: 'Closing' }];
    const intents = [{ dimension: 'Tone' }, { dimension: 'Length' }];

    it('uses the exact ids and dimensions, whatever the case or the spelling of the model', () => {
        assert.deepEqual(cleanLinks([{ component_id: 'GREETING', intent_dimension: 'tone' }], components, intents),
            [{ intent_dimension: 'Tone', component_id: 'greeting' }]);
    });

    it('accepts the title of a component as its id', () => {
        assert.deepEqual(cleanLinks([{ component_id: 'Closing', intent_dimension: 'Length' }], components, intents),
            [{ intent_dimension: 'Length', component_id: 'closing' }]);
    });

    it('drops links to something that does not exist, links without both parts, and repeats', () => {
        const links = [{ component_id: 'greeting', intent_dimension: 'Tone' }, { component_id: 'greeting', intent_dimension: 'TONE' },
            { component_id: 'nobody', intent_dimension: 'Tone' }, { component_id: 'greeting', intent_dimension: 'Nothing' }, { component_id: 'greeting' }, null];
        assert.deepEqual(cleanLinks(links, components, intents), [{ intent_dimension: 'Tone', component_id: 'greeting' }]);
    });

    it('gives an empty list for something that is not a list', () => {
        assert.deepEqual(cleanLinks('x', components, intents), []);
    });
});

describe('ensureEveryComponentLinked', () => {
    const components = [{ id: 'greeting', title: 'Greeting' }, { id: 'closing', title: 'Closing' }];
    const intents = [{ dimension: 'Tone', current_value: 'Warm' }, { dimension: 'Length', current_value: 'Short' }];
    const ensure = (llm, links) => ensureEveryComponentLinked(createJsonRequester(llm))(links, components, intents);

    it('changes nothing when every component has a link, and asks nobody', async () => {
        const llm = createFakeLlm([]);
        const links = [{ intent_dimension: 'Tone', component_id: 'greeting' }, { intent_dimension: 'Tone', component_id: 'closing' }];
        assert.deepEqual(await ensure(llm, links), links);
        assert.equal(llm.prompts.length, 0);
    });

    it('asks the model for the components that were left out and takes its links', async () => {
        const llm = createFakeLlm([[{ intent_dimension: 'Length', component_id: 'closing' }]]);
        const result = await ensure(llm, [{ intent_dimension: 'Tone', component_id: 'greeting' }]);
        assert.deepEqual(result, [{ intent_dimension: 'Tone', component_id: 'greeting' }, { intent_dimension: 'Length', component_id: 'closing' }]);
        assert.ok(llm.prompts[0].includes('closing') && !llm.prompts[0].includes('"id": "greeting"'));
    });

    it('links a component that is still left out to the intent that is used most', async () => {
        const llm = createFakeLlm([[]]);
        const result = await ensure(llm, [{ intent_dimension: 'Length', component_id: 'greeting' }]);
        assert.deepEqual(result[1], { intent_dimension: 'Length', component_id: 'closing' });
    });

    it('does the same when the model cannot be used at all', async () => {
        const result = await ensure(createFakeLlm([]), []);
        assert.deepEqual(result.map(link => link.component_id).sort(), ['closing', 'greeting']);
    });

    it('returns the links as they are when there are no intents', async () => {
        assert.deepEqual(await ensureEveryComponentLinked(createJsonRequester(createFakeLlm([])))([], components, []), []);
    });
});

describe('variations', () => {
    const variations = (...pairs) => ({ component_variations: pairs.map(([intent_value, content]) => ({ intent_value, content })) });

    it('match when each requested value has exactly one version, in any spelling', () => {
        assert.equal(variationsMatchValues(variations(['warm', 'a'], ['COOL', 'b']), ['Warm', 'Cool']), true);
    });

    it('do not match when a value is missing, repeated, made up, or the content is not text', () => {
        assert.equal(variationsMatchValues(variations(['Warm', 'a']), ['Warm', 'Cool']), false);
        assert.equal(variationsMatchValues(variations(['Warm', 'a'], ['Warm', 'b']), ['Warm', 'Cool']), false);
        assert.equal(variationsMatchValues(variations(['current_intent_value', 'a'], ['Cool', 'b']), ['Warm', 'Cool']), false);
        assert.equal(variationsMatchValues({ component_variations: [{ intent_value: 'Warm', content: 1 }, { intent_value: 'Cool', content: 'b' }] }, ['Warm', 'Cool']), false);
        assert.equal(variationsMatchValues(null, ['Warm']), false);
    });

    it('alignVariationValues writes each label as the value was given', () => {
        const aligned = alignVariationValues(variations(['warm', 'a'], ['cool', 'b']), { current_value: 'Warm', other_values: ['Cool'] });
        assert.deepEqual(aligned.component_variations.map(item => item.intent_value), ['Warm', 'Cool']);
    });
});

describe('factors', () => {
    it('filterFactorChoices keeps the first value of every factor that has one', () => {
        const choices = { a: { options: [{ value: 'x' }, { value: 'y' }] }, b: { options: [] }, c: {} };
        assert.deepEqual(filterFactorChoices(choices), { a: 'x' });
    });

    const catalog = [
        { id: 'familiarity', select_type: 'single', options: [{ value: 'Familiar' }, { value: 'Strangers' }] },
        { id: 'purpose', select_type: 'multiple', options: [{ value: 'requests' }, { value: 'inform' }] }
    ];

    it('cleanFactorSelection keeps real factors with real options, one value for a single factor', () => {
        const result = cleanFactorSelection({ familiarity: ['Strangers', 'Familiar'], purpose: ['inform', 'made up', 'inform'], unknown: 'x' }, catalog);
        assert.deepEqual(result, { selectedFactors: { familiarity: true, purpose: true }, selectedValues: { familiarity: 'Strangers', purpose: ['inform'] } });
    });

    it('cleanFactorSelection gives nothing for an answer that is not an object', () => {
        assert.deepEqual(cleanFactorSelection([1], catalog), { selectedFactors: {}, selectedValues: {} });
        assert.deepEqual(cleanFactorSelection(null, catalog), { selectedFactors: {}, selectedValues: {} });
    });
});
