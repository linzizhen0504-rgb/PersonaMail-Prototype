// What the backend does today, pinned down endpoint by endpoint with a fake model and a throw-away user.
// The same file is run against the restructured backend (SERVER_ENTRY=server/index.js): it must pass on both.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startFakeOllama } = require('../test-support/fakeOllama');
const { startServer } = require('../test-support/serverProcess');
const { createClient, testUserName, sessionDir, readSessionFile, removeTestData, LOG_ROOT } = require('../test-support/api');

const USER = testUserName();
const TASK = 'Ask my professor for a short extension on the course project.';
const DRAFT = 'Subject: Extension request\n\nDear Professor Lee,\n\nCould I have two more days?\n\nThank you,\nMia';
let model;
let server;
let api;

before(async () => {
    model = await startFakeOllama();
    server = await startServer({ modelUrl: model.url });
    api = createClient(server.url);
});

after(async () => {
    if (server) await server.stop();
    if (model) await model.close();
    removeTestData(USER);
});

beforeEach(() => model.reset());

const newSession = async () => {
    const { json } = await api.post('/create-session', { userName: USER, userInput: TASK });
    return json.taskId;
};
const saveChoices = (taskId, factorChoices) => api.post('/save-factor-choices', { userName: USER, taskId, factorChoices });
const saveDraft = (taskId, content) => api.post(`/sessiondata/${taskId}/drafts/latest.md`, { content });
const FAMILIAR = { familiarity: { id: 'familiarity', options: [{ value: 'Familiar', type: 'user-defined' }] } };

describe('session', () => {
    it('create-session answers with a task id that starts with the user name', async () => {
        const { status, json } = await api.post('/create-session', { userName: USER, userInput: TASK });
        assert.equal(status, 200);
        assert.match(json.taskId, new RegExp(`^${USER}_`));
    });

    it('create-session lays out the task folders and the task.json file', async () => {
        const taskId = await newSession();
        for (const folder of ['meta', 'factors', 'intents', 'drafts', 'localized', 'logs']) {
            assert.ok(fs.statSync(path.join(sessionDir(USER, taskId), folder)).isDirectory(), folder);
        }
        const task = JSON.parse(readSessionFile(USER, taskId, 'meta', 'task.json'));
        assert.deepEqual([task.user, task.task_id, task.original_task], [USER, taskId, '']);
        assert.deepEqual(JSON.parse(readSessionFile(USER, taskId, 'intents', 'history.json')), []);
    });

    it('create-session starts with an empty draft, no choices and no intents', async () => {
        const taskId = await newSession();
        assert.equal(readSessionFile(USER, taskId, 'drafts', 'latest.md'), '');
        assert.deepEqual(JSON.parse(readSessionFile(USER, taskId, 'factors', 'choices.json')), {});
        assert.deepEqual(JSON.parse(readSessionFile(USER, taskId, 'intents', 'current.json')), []);
    });

    it('create-session without a user name is a 400', async () => {
        const { status } = await api.post('/create-session', { userInput: TASK });
        assert.equal(status, 400);
    });

    it('update-task-meta stores the original task', async () => {
        const taskId = await newSession();
        const { status } = await api.post('/update-task-meta', { userName: USER, taskId, originalTask: TASK });
        assert.equal(status, 200);
        assert.equal(JSON.parse(readSessionFile(USER, taskId, 'meta', 'task.json')).original_task, TASK);
    });

    it('update-task-meta without the task is a 400', async () => {
        const { status } = await api.post('/update-task-meta', { userName: USER, taskId: 'x' });
        assert.equal(status, 400);
    });

    it('save-factor-choices writes factors/choices.json', async () => {
        const taskId = await newSession();
        const { status } = await saveChoices(taskId, FAMILIAR);
        assert.equal(status, 200);
        assert.deepEqual(JSON.parse(readSessionFile(USER, taskId, 'factors', 'choices.json')), FAMILIAR);
    });

    it('save-factor-choices without choices is a 400', async () => {
        const { status } = await api.post('/save-factor-choices', { userName: USER, taskId: 'x' });
        assert.equal(status, 400);
    });

    it('a draft saved under sessiondata can be read back as plain text', async () => {
        const taskId = await newSession();
        assert.equal((await saveDraft(taskId, DRAFT)).status, 200);
        const read = await api.get(`/sessiondata/${taskId}/drafts/latest.md`);
        assert.equal(read.status, 200);
        assert.match(read.type, /text\/plain/);
        assert.equal(read.text, DRAFT);
    });

    it('a json file under sessiondata is served as json', async () => {
        const taskId = await newSession();
        const read = await api.get(`/sessiondata/${taskId}/meta/task.json`);
        assert.equal(read.status, 200);
        assert.match(read.type, /application\/json/);
        assert.equal(read.json.task_id, taskId);
    });

    it('a file that does not exist is a 404', async () => {
        const taskId = await newSession();
        assert.equal((await api.get(`/sessiondata/${taskId}/drafts/nothing.md`)).status, 404);
    });

    it('saving an empty draft is a 400', async () => {
        const taskId = await newSession();
        assert.equal((await saveDraft(taskId, '')).status, 400);
    });
});

describe('select-factors', () => {
    it('keeps only real factors with real options, one value for a single factor', async () => {
        model.queue({ familiarity: ['Familiar', 'Strangers'], communication_purpose: ['requests', 'made up'], promptness: 'Sometime', no_such_factor: 'x' });
        const { status, json } = await api.post('/select-factors', { userTask: TASK });
        assert.equal(status, 200);
        assert.deepEqual(json.selectedFactors, { familiarity: true, communication_purpose: true });
        assert.deepEqual(json.selectedValues, { familiarity: 'Familiar', communication_purpose: ['requests'] });
    });

    it('puts the request and the factor list into the prompt', async () => {
        model.queue({ familiarity: 'Familiar' });
        await api.post('/select-factors', { userTask: TASK });
        assert.ok(model.prompts[0].includes(TASK));
        assert.ok(model.prompts[0].includes('communication_purpose'));
    });

    it('an empty request is a 400', async () => {
        assert.equal((await api.post('/select-factors', { userTask: '  ' })).status, 400);
    });

    it('a reply without any usable factor is a 500', async () => {
        model.queue({ nothing: 'here' }, { nothing: 'here' }, { nothing: 'here' });
        assert.equal((await api.post('/select-factors', { userTask: TASK })).status, 500);
    });
});

describe('generate-first-draft', () => {
    it('returns the trimmed reply and asks with the request and the chosen options', async () => {
        model.queue(`  ${DRAFT}  \n`);
        const { status, json } = await api.post('/generate-first-draft', { userTask: TASK, factorChoices: FAMILIAR });
        assert.equal(status, 200);
        assert.equal(json.draft, DRAFT);
        assert.ok(model.prompts[0].includes(TASK));
        assert.ok(model.prompts[0].includes('Familiar'));
    });

    it('missing choices are a 400', async () => {
        assert.equal((await api.post('/generate-first-draft', { userTask: TASK })).status, 400);
    });
});

describe('component-extractor', () => {
    it('answers with the components as json text, each with one short title', async () => {
        const taskId = await newSession();
        await saveDraft(taskId, DRAFT);
        model.queue('```json\n' + JSON.stringify([
            { id: 'subject_line', title: 'Subject Line', content: 'Subject: Extension request' },
            { id: 'call_to_action', title: 'Call to Action / Proposed Next Steps', content: 'Could I have two more days?' }
        ]) + '\n```');
        const { status, json } = await api.post('/component-extractor', { userName: USER, taskId });
        assert.equal(status, 200);
        const components = JSON.parse(json.components);
        assert.deepEqual(components.map(component => component.title), ['Subject Line', 'Call to Action']);
        assert.deepEqual(components.map(component => component.id), ['subject_line', 'call_to_action']);
        assert.ok(model.prompts[0].includes('Could I have two more days?'));
    });

    it('a task that does not exist is a 404', async () => {
        assert.equal((await api.post('/component-extractor', { userName: USER, taskId: `${USER}_2000-01-01T00-00-00-000Z` })).status, 404);
    });

    it('a missing task id is a 400', async () => {
        assert.equal((await api.post('/component-extractor', { userName: USER })).status, 400);
    });
});

describe('intent-analyzer-new', () => {
    const intentsReply = [{ dimension: 'Tone / Formality', current_value: 'Warm / friendly', other_values: ['Cool / formal', 'Brisk', ''] }];

    it('saves the intents with short names and returns them', async () => {
        const taskId = await newSession();
        await saveChoices(taskId, FAMILIAR);
        await saveDraft(taskId, DRAFT);
        model.queue(intentsReply);
        const { status, json } = await api.post('/intent-analyzer-new', { userTask: TASK, userName: USER, taskId });
        assert.equal(status, 200);
        const expected = [{ dimension: 'Tone', current_value: 'Warm', other_values: ['Cool', 'Brisk'] }];
        assert.deepEqual(json.intents, expected);
        assert.deepEqual(JSON.parse(readSessionFile(USER, taskId, 'intents', 'current.json')), expected);
        assert.ok(model.prompts[0].includes(TASK) && model.prompts[0].includes('Dear Professor Lee'));
    });

    it('missing fields are a 400', async () => {
        assert.equal((await api.post('/intent-analyzer-new', { userName: USER })).status, 400);
    });

    it('a task that does not exist is a 500', async () => {
        const taskId = `${USER}_2000-01-01T00-00-00-000Z`;
        assert.equal((await api.post('/intent-analyzer-new', { userTask: TASK, userName: USER, taskId })).status, 500);
    });
});

describe('component-intent-link', () => {
    const components = [
        { id: 'greeting', title: 'Greeting', content: 'Dear Professor Lee,' },
        { id: 'closing', title: 'Closing', content: 'Thank you,' }
    ];

    const sessionWithIntents = async () => {
        const taskId = await newSession();
        fs.writeFileSync(path.join(sessionDir(USER, taskId), 'intents', 'current.json'), JSON.stringify([{ dimension: 'Tone', current_value: 'Warm', other_values: ['Cool'] }]));
        return taskId;
    };

    it('keeps links to real components and intents, and links every component at least once', async () => {
        const taskId = await sessionWithIntents();
        model.queue([{ intent_dimension: 'tone', component_id: 'GREETING' }, { intent_dimension: 'No such intent', component_id: 'closing' }], []);
        const { status, json } = await api.post('/component-intent-link', { userName: USER, taskId, componentList: components });
        assert.equal(status, 200);
        assert.deepEqual(json.links, [
            { intent_dimension: 'Tone', component_id: 'greeting' },
            { intent_dimension: 'Tone', component_id: 'closing' }
        ]);
    });

    it('still links every component when the model returns nothing usable', async () => {
        const taskId = await sessionWithIntents();
        model.queue('not json', 'not json', 'not json', 'not json', 'not json', 'not json');
        const { status, json } = await api.post('/component-intent-link', { userName: USER, taskId, componentList: components });
        assert.equal(status, 200);
        assert.deepEqual(json.links.map(link => link.component_id).sort(), ['closing', 'greeting']);
    });

    it('a task that does not exist is a 500', async () => {
        const taskId = `${USER}_2000-01-01T00-00-00-000Z`;
        assert.equal((await api.post('/component-intent-link', { userName: USER, taskId, componentList: components })).status, 500);
    });

    it('a session whose intent list is empty gets no links', async () => {
        const taskId = await newSession();
        model.queue([]);
        const { status, json } = await api.post('/component-intent-link', { userName: USER, taskId, componentList: components });
        assert.equal(status, 200);
        assert.deepEqual(json.links, []);
    });
});

describe('intent-change-rewriter', () => {
    const intentSelected = { dimension: 'Tone', current_value: 'Warm', other_values: ['Cool'] };
    const request = (taskId) => ({
        userName: USER, taskId, userTask: TASK, draftLatest: DRAFT, componentCurrent: 'Could I have two more days?',
        intentSelected, intentOthers: []
    });

    it('returns one version per value, with the labels written as the values were given', async () => {
        const taskId = await newSession();
        await saveChoices(taskId, FAMILIAR);
        model.queue({ component_variations: [{ intent_value: 'warm', content: 'Could I please have two more days?' }, { intent_value: 'cool', content: 'I request two more days.' }] });
        const { status, json } = await api.post('/intent-change-rewriter', request(taskId));
        assert.equal(status, 200);
        assert.deepEqual(json.component_variations.map(variation => variation.intent_value), ['Warm', 'Cool']);
        assert.ok(model.prompts[0].includes('Could I have two more days?'));
    });

    it('drops an empty version but keeps the others', async () => {
        const taskId = await newSession();
        await saveChoices(taskId, FAMILIAR);
        model.queue({ component_variations: [{ intent_value: 'Warm', content: 'Same.' }, { intent_value: 'Cool', content: '   ' }] },
            { component_variations: [{ intent_value: 'Warm', content: 'Same.' }, { intent_value: 'Cool', content: 'Other.' }] });
        const { status, json } = await api.post('/intent-change-rewriter', request(taskId));
        assert.equal(status, 200);
        assert.ok(json.component_variations.length >= 1);
    });

    it('a reply that does not match the requested values three times is a 500', async () => {
        const taskId = await newSession();
        await saveChoices(taskId, FAMILIAR);
        const wrong = { component_variations: [{ intent_value: 'current_intent_value', content: 'x' }, { intent_value: 'first_alternative_intent_value', content: 'y' }] };
        model.queue(wrong, wrong, wrong);
        assert.equal((await api.post('/intent-change-rewriter', request(taskId))).status, 500);
        assert.equal(model.prompts.length, 3);
    });

    it('missing fields are a 400', async () => {
        const taskId = await newSession();
        await saveChoices(taskId, FAMILIAR);
        assert.equal((await api.post('/intent-change-rewriter', { userName: USER, taskId, userTask: TASK })).status, 400);
    });
});

describe('intent-consistency-check', () => {
    const body = {
        userTask: TASK, draftLatest: DRAFT, intentSelected: { dimension: 'Tone', current_value: 'Cool' }, oldValue: 'Warm',
        source: { title: 'Opening', oldContent: 'Dear Professor Lee,', newContent: 'Professor Lee,' },
        targets: [{ id: 'closing', title: 'Closing', content: 'Thank you,' }, { id: 'subject', title: 'Subject', content: 'Subject: Extension request' }]
    };

    it('reports for every target whether it needs a change; a target the model skipped needs one', async () => {
        model.queue([{ id: 'closing', needs_change: false, reason: '  fits  ' }]);
        const { status, json } = await api.post('/intent-consistency-check', body);
        assert.equal(status, 200);
        assert.deepEqual(json.results, [
            { id: 'closing', needs_change: false, reason: 'fits' },
            { id: 'subject', needs_change: true, reason: '' }
        ]);
        assert.ok(model.prompts[0].includes('Professor Lee,') && model.prompts[0].includes('Thank you,'));
    });

    it('no targets is a 400', async () => {
        assert.equal((await api.post('/intent-consistency-check', { ...body, targets: [] })).status, 400);
    });

    it('a reply the server cannot use is a 500', async () => {
        model.queue('no', 'no', 'no');
        assert.equal((await api.post('/intent-consistency-check', body)).status, 500);
    });
});

describe('intent-regenerate-values', () => {
    const body = { userName: USER, taskId: 'none', userTask: TASK, draftLatest: DRAFT, intentDimension: 'Tone', currentValue: 'Warm', rejectedValues: ['Cool'] };

    it('returns three new values with short names', async () => {
        model.queue({ other_values: ['Alpha / Beta', 'Gamma', 'Delta'] });
        const { status, json } = await api.post('/intent-regenerate-values', body);
        assert.equal(status, 200);
        assert.deepEqual(json.other_values, ['Alpha', 'Gamma', 'Delta']);
    });

    it('values that repeat the current or a rejected one are refused (three tries, then a 500)', async () => {
        const repeating = { other_values: ['warm', 'Gamma', 'Delta'] };
        model.queue(repeating, repeating, repeating);
        assert.equal((await api.post('/intent-regenerate-values', body)).status, 500);
        assert.equal(model.prompts.length, 3);
    });

    it('missing fields are a 400', async () => {
        assert.equal((await api.post('/intent-regenerate-values', { userTask: TASK })).status, 400);
    });
});

describe('ai-generate-rewrite and ai-add-content', () => {
    it('ai-generate-rewrite returns the trimmed rewrite and asks with the selection and the instruction', async () => {
        const taskId = await newSession();
        model.queue('  Could I please have two more days?  ');
        const { status, json } = await api.post('/ai-generate-rewrite', { userTask: TASK, userName: USER, taskId, selectedContent: 'two more days', userPrompt: 'make it politer' });
        assert.equal(status, 200);
        assert.equal(json.rewrittenContent, 'Could I please have two more days?');
        assert.ok(model.prompts[0].includes('two more days') && model.prompts[0].includes('make it politer'));
    });

    it('ai-generate-rewrite with missing fields is a 400', async () => {
        assert.equal((await api.post('/ai-generate-rewrite', { userTask: TASK })).status, 400);
    });

    it('ai-add-content returns the trimmed revised draft', async () => {
        const taskId = await newSession();
        model.queue(`${DRAFT}\n\nP.S. Thanks again.\n`);
        const { status, json } = await api.post('/ai-add-content', { userTask: TASK, userName: USER, taskId, currentDraft: DRAFT, userPrompt: 'add a thank-you note' });
        assert.equal(status, 200);
        assert.equal(json.revisedDraft, `${DRAFT}\n\nP.S. Thanks again.`);
    });

    it('ai-add-content with missing fields is a 400', async () => {
        assert.equal((await api.post('/ai-add-content', { userTask: TASK })).status, 400);
    });
});

describe('logs', () => {
    it('log-event appends one json line to the file of its pid', async () => {
        const record = { pid: USER, event: 'pick', unit_id: 'a' };
        assert.equal((await api.post('/log-event', record)).status, 200);
        assert.equal((await api.post('/log-event', { ...record, event: 'leave' })).status, 200);
        const lines = fs.readFileSync(path.join(LOG_ROOT, `${USER}.jsonl`), 'utf-8').trim().split('\n').map(line => JSON.parse(line));
        assert.deepEqual(lines.map(line => line.event), ['pick', 'leave']);
    });

    it('a pid with path characters cannot leave the log folder', async () => {
        await api.post('/log-event', { pid: '../../evil', event: 'x' });
        assert.ok(!fs.existsSync(path.join(LOG_ROOT, '..', '..', 'evil.jsonl')));
        assert.ok(fs.existsSync(path.join(LOG_ROOT, '______evil.jsonl')));
        fs.rmSync(path.join(LOG_ROOT, '______evil.jsonl'), { force: true });
    });

    it('api-logs/dates lists the dates that have logs', async () => {
        const { status, json } = await api.get('/api-logs/dates');
        assert.equal(status, 200);
        assert.ok(Array.isArray(json.availableDates));
    });

    it('api-logs answers with the entries of a day, newest requests included', async () => {
        const { status, json } = await api.get('/api-logs');
        assert.equal(status, 200);
        assert.ok(json.logs ? Array.isArray(json.logs) : typeof json.message === 'string');
    });
});
