// The email services with a fake model and sessions in memory: the same behaviour as the characterization tests, in milliseconds.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createEmailServices } = require('./index');
const { createFakeLlm } = require('../llm/adapters/fake');
const { createMemorySessionRepository } = require('../session/adapters/memory');
const { createPromptStore } = require('../prompts');
const { ValidationError, NotFoundError, ModelOutputError } = require('../../contracts/errors');

const PROMPTS = path.join(__dirname, '../../../public/data/Prompts');
const TASK = 'Ask my professor for a short extension.';
const DRAFT = 'Subject: Extension request\n\nDear Professor Lee,\n\nCould I have two more days?';
const FAMILIAR = { familiarity: { id: 'familiarity', options: [{ value: 'Familiar' }] } };
const CATALOG = [
    { id: 'familiarity', title: 'Familiarity', select_type: 'single', options: [{ value: 'Familiar' }, { value: 'Strangers' }] },
    { id: 'communication_purpose', title: 'Purpose', select_type: 'multiple', options: [{ value: 'requests' }, { value: 'inform' }] }
];

let llm;
let sessions;
let email;
let ref;
beforeEach(async () => {
    llm = createFakeLlm([]);
    sessions = createMemorySessionRepository();
    email = createEmailServices({ llm, sessions, prompts: createPromptStore({ dir: PROMPTS }), catalog: { list: async () => CATALOG } });
    ref = await sessions.createSession('mia');
});

describe('selectFactors', () => {
    it('keeps only real factors and options and puts the request and the factors into the prompt', async () => {
        llm.queue({ familiarity: ['Familiar', 'Strangers'], communication_purpose: ['requests', 'nope'], other: 1 });
        const result = await email.selectFactors({ userTask: TASK });
        assert.deepEqual(result.selectedValues, { familiarity: 'Familiar', communication_purpose: ['requests'] });
        assert.ok(llm.prompts[0].includes(TASK) && llm.prompts[0].includes('communication_purpose'));
    });

    it('needs a request', async () => {
        await assert.rejects(() => email.selectFactors({ userTask: '  ' }), ValidationError);
    });

    it('fails with a ModelOutputError when no usable factor comes back', async () => {
        llm.queue({ x: 1 }, { x: 1 }, { x: 1 });
        await assert.rejects(() => email.selectFactors({ userTask: TASK }), ModelOutputError);
    });
});

describe('generateFirstDraft', () => {
    it('returns the trimmed draft, asked with the request and the chosen options, thinking first', async () => {
        llm.queue(`  ${DRAFT} \n`);
        assert.equal(await email.generateFirstDraft({ userTask: TASK, factorChoices: FAMILIAR }), DRAFT);
        assert.ok(llm.prompts[0].includes(TASK) && llm.prompts[0].includes('Familiar'));
        assert.deepEqual(llm.options[0], { reasoning: true, timeoutMs: 120000 });
    });

    it('needs the choices', async () => {
        await assert.rejects(() => email.generateFirstDraft({ userTask: TASK }), ValidationError);
    });

    it('fails when the model answers with nothing', async () => {
        llm.queue('');
        await assert.rejects(() => email.generateFirstDraft({ userTask: TASK, factorChoices: FAMILIAR }), /first draft/i);
    });
});

describe('extractComponents', () => {
    it('gives the components as json text with one short title each', async () => {
        await sessions.writeDraft(ref, DRAFT);
        llm.queue('```json\n[{"id":"cta","title":"Call to Action / Next Steps","content":"Could I have two more days?"}]\n```');
        const result = await email.extractComponents(ref);
        assert.deepEqual(JSON.parse(result), [{ id: 'cta', title: 'Call to Action', content: 'Could I have two more days?' }]);
        assert.ok(llm.prompts[0].includes('Could I have two more days?'));
    });

    it('gives the model\'s text as it is when it is not json', async () => {
        await sessions.writeDraft(ref, DRAFT);
        llm.queue('Sorry, no components');
        assert.equal(await email.extractComponents(ref), 'Sorry, no components');
    });

    it('does not find a task that does not exist', async () => {
        await assert.rejects(() => email.extractComponents({ userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' }), NotFoundError);
    });
});

describe('analyzeIntents', () => {
    it('saves the intents with short names and returns them', async () => {
        await sessions.writeChoices(ref, FAMILIAR);
        await sessions.writeDraft(ref, DRAFT);
        llm.queue([{ dimension: 'Tone / Formality', current_value: 'Warm / friendly', other_values: ['Cool / formal', 'Brisk', ''] }]);
        const intents = await email.analyzeIntents({ userTask: TASK, ref });
        const expected = [{ dimension: 'Tone', current_value: 'Warm', other_values: ['Cool', 'Brisk'] }];
        assert.deepEqual(intents, expected);
        assert.deepEqual(await sessions.readIntents(ref), expected);
        assert.ok(llm.prompts[0].includes(TASK) && llm.prompts[0].includes('Dear Professor Lee') && llm.prompts[0].includes('Familiar'));
    });

    it('needs the choices and the draft of the task', async () => {
        await assert.rejects(() => email.analyzeIntents({ userTask: TASK, ref: { userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' } }), /choices/);
    });

    it('fails with a ModelOutputError when the model never gives intents', async () => {
        await sessions.writeChoices(ref, FAMILIAR);
        await sessions.writeDraft(ref, DRAFT);
        llm.queue('no', 'no', 'no');
        await assert.rejects(() => email.analyzeIntents({ userTask: TASK, ref }), ModelOutputError);
    });
});

describe('linkComponents', () => {
    const components = [{ id: 'greeting', title: 'Greeting', content: 'Dear Professor Lee,' }, { id: 'closing', title: 'Closing', content: 'Thank you,' }];

    it('keeps the links to real components and intents and links every component', async () => {
        await sessions.writeIntents(ref, [{ dimension: 'Tone', current_value: 'Warm', other_values: [] }]);
        llm.queue([{ intent_dimension: 'tone', component_id: 'GREETING' }], []);
        assert.deepEqual(await email.linkComponents({ ref, componentList: components }), [
            { intent_dimension: 'Tone', component_id: 'greeting' }, { intent_dimension: 'Tone', component_id: 'closing' }
        ]);
    });

    it('gives no links for a session without intents', async () => {
        llm.queue([]);
        assert.deepEqual(await email.linkComponents({ ref, componentList: components }), []);
    });

    it('does not find the intents of a task that does not exist', async () => {
        await assert.rejects(() => email.linkComponents({ ref: { userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' }, componentList: components }), /intents/);
    });
});

describe('rewriteForIntent', () => {
    const intentSelected = { dimension: 'Tone', current_value: 'Warm', other_values: ['Cool'] };
    const request = (extra = {}) => ({ ref, userTask: TASK, draftLatest: DRAFT, componentCurrent: 'Could I have two more days?', intentSelected, intentOthers: [], ...extra });

    it('gives one version per value, labelled as the values were given', async () => {
        await sessions.writeChoices(ref, FAMILIAR);
        llm.queue({ component_variations: [{ intent_value: 'warm', content: 'Please?' }, { intent_value: 'cool', content: 'I request it.' }] });
        const result = await email.rewriteForIntent(request());
        assert.deepEqual(result.component_variations.map(item => item.intent_value), ['Warm', 'Cool']);
        assert.ok(llm.prompts[0].includes('Could I have two more days?'));
        assert.ok(llm.prompts[0].includes('exactly 2 items') && llm.prompts[0].includes('["Warm","Cool"]'));
    });

    it('drops an empty version and asks again when no version of another value is left', async () => {
        await sessions.writeChoices(ref, FAMILIAR);
        llm.queue({ component_variations: [{ intent_value: 'Warm', content: 'a' }, { intent_value: 'Cool', content: '  ' }] },
            { component_variations: [{ intent_value: 'Warm', content: 'a' }, { intent_value: 'Cool', content: 'b' }] });
        const result = await email.rewriteForIntent(request());
        assert.deepEqual(result.component_variations.map(item => item.content), ['a', 'b']);
        assert.equal(llm.prompts.length, 2);
    });

    it('gives up after three replies that do not match the values', async () => {
        await sessions.writeChoices(ref, FAMILIAR);
        const wrong = { component_variations: [{ intent_value: 'current_intent_value', content: 'x' }, { intent_value: 'first_alternative_intent_value', content: 'y' }] };
        llm.queue(wrong, wrong, wrong);
        await assert.rejects(() => email.rewriteForIntent(request()), ModelOutputError);
        assert.equal(llm.prompts.length, 3);
    });

    it('needs every field, and the choices of the task', async () => {
        await sessions.writeChoices(ref, FAMILIAR);
        await assert.rejects(() => email.rewriteForIntent(request({ draftLatest: undefined })), ValidationError);
        await assert.rejects(() => email.rewriteForIntent(request({ ref: { userName: 'mia', taskId: 'mia_2000-01-01T00-00-00-000Z' } })), ValidationError);
    });
});

describe('checkConsistency', () => {
    const body = {
        userTask: TASK, draftLatest: DRAFT, intentSelected: { dimension: 'Tone', current_value: 'Cool' }, oldValue: 'Warm',
        source: { title: 'Opening', oldContent: 'Dear Professor Lee,', newContent: 'Professor Lee,' },
        targets: [{ id: 'closing', title: 'Closing', content: 'Thank you,' }, { id: 'subject', title: 'Subject', content: 'Subject: x' }]
    };

    it('answers for every target; one the model skipped needs a change', async () => {
        llm.queue([{ id: 'closing', needs_change: false, reason: ' fits ' }]);
        assert.deepEqual(await email.checkConsistency(body), [
            { id: 'closing', needs_change: false, reason: 'fits' }, { id: 'subject', needs_change: true, reason: '' }
        ]);
    });

    it('needs targets', async () => {
        await assert.rejects(() => email.checkConsistency({ ...body, targets: [] }), ValidationError);
    });

    it('fails with a ModelOutputError for an answer that cannot be used', async () => {
        llm.queue('no', 'no', 'no');
        await assert.rejects(() => email.checkConsistency(body), ModelOutputError);
    });
});

describe('regenerateValues', () => {
    const body = { ref: undefined, userTask: TASK, draftLatest: DRAFT, intentDimension: 'Tone', currentValue: 'Warm', rejectedValues: ['Cool'] };

    it('gives three new short values', async () => {
        llm.queue({ other_values: ['Alpha / Beta', 'Gamma', 'Delta'] });
        assert.deepEqual(await email.regenerateValues({ ...body, ref }), ['Alpha', 'Gamma', 'Delta']);
    });

    it('refuses values that repeat the current or a rejected one', async () => {
        const again = { other_values: ['warm', 'Gamma', 'Delta'] };
        llm.queue(again, again, again);
        await assert.rejects(() => email.regenerateValues({ ...body, ref }), ModelOutputError);
    });

    it('works without a task too', async () => {
        llm.queue({ other_values: ['A1', 'B1', 'C1'] });
        assert.deepEqual(await email.regenerateValues(body), ['A1', 'B1', 'C1']);
    });

    it('needs its fields', async () => {
        await assert.rejects(() => email.regenerateValues({ ...body, rejectedValues: 'x' }), ValidationError);
    });
});

describe('rewriteSelection and addContent', () => {
    it('rewriteSelection gives the trimmed rewrite, asked with the selection and the instruction', async () => {
        llm.queue('  Please may I?  ');
        const result = await email.rewriteSelection({ userTask: TASK, ref, selectedContent: 'two more days', userPrompt: 'be politer' });
        assert.equal(result, 'Please may I?');
        assert.ok(llm.prompts[0].includes('two more days') && llm.prompts[0].includes('be politer'));
    });

    it('addContent gives the trimmed revised draft', async () => {
        llm.queue(`${DRAFT}\n\nP.S.\n`);
        assert.equal(await email.addContent({ userTask: TASK, ref, currentDraft: DRAFT, userPrompt: 'add a note' }), `${DRAFT}\n\nP.S.`);
    });

    it('both need their fields', async () => {
        await assert.rejects(() => email.rewriteSelection({ userTask: TASK, ref }), ValidationError);
        await assert.rejects(() => email.addContent({ userTask: TASK, ref }), ValidationError);
    });
});
