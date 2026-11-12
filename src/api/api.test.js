// The only way the page talks to the backend. Each function is checked against the contract in contracts/schemas: what it sends
// must be a valid request, and the answers it expects must be valid answers (the same files the server is tested with).
import { createApi } from './index';

const { loadEndpoints } = require('../../server/contracts/http');

const endpoints = loadEndpoints();
const endpoint = (name) => endpoints.find(entry => entry.name === name);

const TASK_ID = 'mia_2026-11-10T12-44-41-888Z';
const INTENT = { dimension: 'Tone', current_value: 'Warm', other_values: ['Cool', 'Brisk'] };

// An axios-like object that records what it was asked and answers with what the test gave it
const fakeHttp = (answers = {}) => {
    const calls = [];
    const answer = (method) => async (url, ...rest) => {
        const body = method === 'post' ? rest[0] : undefined;
        const config = method === 'post' ? rest[1] : rest[0];
        calls.push({ method, url, body, config });
        const key = `${method.toUpperCase()} ${url}`;
        if (!(key in answers)) throw new Error(`no answer for ${key}`);
        return { data: answers[key] };
    };
    return { calls, get: answer('get'), post: answer('post') };
};

const expectValidRequest = (name, call) => expect(endpoint(name).validateRequest(call.body)).toEqual([]);
const expectValidAnswer = (name, data) => expect(endpoint(name).validateResponse(data)).toEqual([]);

describe('session', () => {
    it('createSession posts the user and the request and returns the answer', async () => {
        const answers = { 'POST /create-session': { message: 'ok', taskId: TASK_ID } };
        const http = fakeHttp(answers);
        const data = await createApi({ http }).session.createSession({ userName: 'mia', userInput: 'Write to my professor' });
        expect(data).toEqual(answers['POST /create-session']);
        expectValidRequest('create-session', http.calls[0]);
        expectValidAnswer('create-session', data);
    });

    it('saveFactorChoices and updateTaskMeta post to their endpoints', async () => {
        const http = fakeHttp({ 'POST /save-factor-choices': { message: 'ok' }, 'POST /update-task-meta': { message: 'ok' } });
        const api = createApi({ http });
        await api.session.saveFactorChoices({ userName: 'mia', taskId: TASK_ID, factorChoices: { familiarity: {} } });
        await api.session.updateTaskMeta({ userName: 'mia', taskId: TASK_ID, originalTask: 'Ask for an extension' });
        expectValidRequest('save-factor-choices', http.calls[0]);
        expectValidRequest('update-task-meta', http.calls[1]);
    });

    it('readMeta reads the task.json of the task', async () => {
        const http = fakeHttp({ [`GET /sessiondata/${TASK_ID}/meta/task.json`]: { original_task: 'Ask' } });
        expect(await createApi({ http }).session.readMeta(TASK_ID)).toEqual({ original_task: 'Ask' });
    });

    it('puts a task id into the path as one piece, whatever it holds', async () => {
        const odd = 'Mia Chen_2026-11-10T12-44-41-888Z';
        const http = fakeHttp({ [`GET /sessiondata/${encodeURIComponent(odd)}/meta/task.json`]: {} });
        await createApi({ http }).session.readMeta(odd);
        expect(http.calls[0].url).toBe('/sessiondata/Mia%20Chen_2026-11-10T12-44-41-888Z/meta/task.json');
    });
});

describe('drafts', () => {
    it('save posts the content to the draft of the task', async () => {
        const http = fakeHttp({ [`POST /sessiondata/${TASK_ID}/drafts/latest.md`]: { message: 'ok' } });
        await createApi({ http }).drafts.save(TASK_ID, 'Subject: Hi');
        expect(http.calls[0].body).toEqual({ content: 'Subject: Hi' });
        expectValidRequest('save-draft', http.calls[0]);
    });

    it('read gives the draft as text, and an empty text when the answer is not text', async () => {
        const api = (data) => createApi({ http: fakeHttp({ [`GET /sessiondata/${TASK_ID}/drafts/latest.md`]: data }) });
        expect(await api('Subject: Hi').drafts.read(TASK_ID)).toBe('Subject: Hi');
        expect(await api({ not: 'text' }).drafts.read(TASK_ID)).toBe('');
    });

    it('selectFactors and generateFirst send what the contract asks for and return the answer', async () => {
        const http = fakeHttp({
            'POST /select-factors': { selectedFactors: { familiarity: true }, selectedValues: { familiarity: 'Familiar' } },
            'POST /generate-first-draft': { draft: 'Subject: Hi' }
        });
        const api = createApi({ http });
        expectValidAnswer('select-factors', await api.drafts.selectFactors({ userTask: 'Write' }));
        expectValidAnswer('generate-first-draft', await api.drafts.generateFirst({ userTask: 'Write', factorChoices: {} }));
        expectValidRequest('select-factors', http.calls[0]);
        expectValidRequest('generate-first-draft', http.calls[1]);
    });

    it('rewriteSelection and addContent', async () => {
        const http = fakeHttp({ 'POST /ai-generate-rewrite': { rewrittenContent: 'x' }, 'POST /ai-add-content': { revisedDraft: 'y' } });
        const api = createApi({ http });
        expect((await api.drafts.rewriteSelection({ userTask: 't', userName: 'mia', taskId: TASK_ID, selectedContent: 's', userPrompt: 'p' })).rewrittenContent).toBe('x');
        expect((await api.drafts.addContent({ userTask: 't', userName: 'mia', taskId: TASK_ID, currentDraft: 'd', userPrompt: 'p' })).revisedDraft).toBe('y');
        expectValidRequest('ai-generate-rewrite', http.calls[0]);
        expectValidRequest('ai-add-content', http.calls[1]);
    });
});

describe('components and intents', () => {
    it('extract, link and analyze', async () => {
        const http = fakeHttp({
            'POST /component-extractor': { components: '[{"id":"a"}]' },
            'POST /component-intent-link': { links: [{ intent_dimension: 'Tone', component_id: 'a' }] },
            'POST /intent-analyzer-new': { message: 'ok', intents: [INTENT] }
        });
        const api = createApi({ http });
        expectValidAnswer('component-extractor', await api.components.extract({ userName: 'mia', taskId: TASK_ID }));
        expectValidAnswer('component-intent-link', await api.components.link({ userName: 'mia', taskId: TASK_ID, componentList: [{ id: 'a', title: 'A', content: 'a' }] }));
        expectValidAnswer('intent-analyzer-new', await api.intents.analyze({ userTask: 't', userName: 'mia', taskId: TASK_ID }));
        http.calls.forEach((call, index) => expectValidRequest(['component-extractor', 'component-intent-link', 'intent-analyzer-new'][index], call));
    });

    it('read gives the intents of the task', async () => {
        const http = fakeHttp({ [`GET /sessiondata/${TASK_ID}/intents/current.json`]: [INTENT] });
        expect(await createApi({ http }).intents.read(TASK_ID)).toEqual([INTENT]);
    });

    it('rewrite, checkConsistency and regenerateValues', async () => {
        const http = fakeHttp({
            'POST /intent-change-rewriter': { component_variations: [{ intent_value: 'Warm', content: 'a' }] },
            'POST /intent-consistency-check': { results: [{ id: 'a', needs_change: true, reason: '' }] },
            'POST /intent-regenerate-values': { other_values: ['a', 'b', 'c'] }
        });
        const api = createApi({ http });
        expectValidAnswer('intent-change-rewriter', await api.intents.rewrite({ userName: 'mia', taskId: TASK_ID, userTask: 't', draftLatest: 'd', componentCurrent: 'c', intentSelected: INTENT, intentOthers: [] }));
        expectValidAnswer('intent-consistency-check', await api.intents.checkConsistency({ userTask: 't', intentSelected: INTENT, source: { title: 'A', oldContent: 'a', newContent: 'b' }, targets: [{ id: 'a', title: 'A', content: 'a' }] }));
        expectValidAnswer('intent-regenerate-values', await api.intents.regenerateValues({ userName: 'mia', taskId: TASK_ID, userTask: 't', draftLatest: 'd', intentDimension: 'Tone', currentValue: 'Warm', rejectedValues: ['Cool'] }));
        ['intent-change-rewriter', 'intent-consistency-check', 'intent-regenerate-values'].forEach((name, index) => expectValidRequest(name, http.calls[index]));
    });
});

describe('preference', () => {
    const RANK = { pid: 'P01', context: 'Equal', intent_dimension: 'Tone', k: 3, candidates: [{ value: 'A', text: 'a' }] };

    it('rank, update, rejectCheck and resetSession call /preference/... with a timeout, and return the answers', async () => {
        const http = fakeHttp({
            'POST /preference/rank': { values: ['A'], ordering: 'ranked', mmr_used: true, available: true },
            'POST /preference/update': { ok: true },
            'POST /preference/reject-check': { reject_mean: 0.1, exceeds: false },
            'POST /preference/reset-session': { ok: true }
        });
        const api = createApi({ http });
        expectValidAnswer('preference-rank', await api.preference.rank(RANK));
        await api.preference.update({ pid: 'P01', context: 'Equal', intent_dimension: 'Tone', event: 'pick', chosen_value: 'A', shown_values: ['A'] });
        expectValidAnswer('preference-reject-check', await api.preference.rejectCheck({ pid: 'P01', context: 'Equal', intent_dimension: 'Tone' }));
        await api.preference.resetSession({ pid: 'P01', session_id: 's' });
        ['preference-rank', 'preference-update', 'preference-reject-check', 'preference-reset-session'].forEach((name, index) => expectValidRequest(name, http.calls[index]));
        http.calls.forEach(call => expect(call.config.timeout).toBe(5000));
    });

    it('analyzeChange posts both texts to /preference/analyze-change and returns what changed', async () => {
        const answer = { added: ['New.'], removed: [], reworded: 0, kept: 1, available: true };
        const http = fakeHttp({ 'POST /preference/analyze-change': answer });
        const data = await createApi({ http }).preference.analyzeChange({ before: 'Old.', after: 'Old. New.' });
        expect(data).toEqual(answer);
        expectValidRequest('preference-analyze-change', http.calls[0]);
        expectValidAnswer('preference-analyze-change', data);
    });

    it('profile posts the participant and the session to /preference/profile and returns the profile', async () => {
        const answer = { available: true, ops_count: 1, strength: 0.2, liked: [], disliked: [], stats: { changes: 1 }, traits: [], recent: [] };
        const http = fakeHttp({ 'POST /preference/profile': answer });
        const data = await createApi({ http }).preference.profile({ pid: 'P01', session_id: 't1:1' });
        expect(data).toEqual(answer);
        expectValidRequest('preference-profile', http.calls[0]);
        expectValidAnswer('preference-profile', data);
    });

    it('lets the failure of the model through, so the page can tell that it was not recorded', async () => {
        const http = { post: async () => { throw Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }); } };
        await expect(createApi({ http }).preference.update({})).rejects.toThrow(/503/);
    });
});

describe('logging and static files', () => {
    it('logEvent posts the record', async () => {
        const http = fakeHttp({ 'POST /log-event': { ok: true } });
        await createApi({ http }).logging.logEvent({ pid: 'P01', event: 'pick' });
        expect(http.calls[0].body).toEqual({ pid: 'P01', event: 'pick' });
        expectValidRequest('log-event', http.calls[0]);
    });

    it('loadFactorList reads the predefined factors that the page itself serves', async () => {
        const staticHttp = fakeHttp({ 'GET /data/PredefinedData/factor_list.json': [{ id: 'familiarity' }] });
        expect(await createApi({ http: fakeHttp(), staticHttp }).static.loadFactorList()).toEqual([{ id: 'familiarity' }]);
    });
});

describe('the address of the backend', () => {
    it('comes from the environment, not from the code of a page', () => {
        const { API_BASE_URL } = require('./client');
        expect(API_BASE_URL).toBe(process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001');
    });
});
