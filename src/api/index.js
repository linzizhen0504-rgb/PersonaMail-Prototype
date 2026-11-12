// The only way the page talks to the backend and to the files it serves. A page never imports axios or writes an address: it calls
// a function here. Every function sends and expects what contracts/schemas says (src/api/api.test.js checks that).
// Every function gives back the body of the answer; a failure is thrown as it came (an axios error with .message and .response).
import { backend, pageFiles } from './client';

const PREFERENCE_TIMEOUT_MS = 5000;

const sessionPath = (taskId, file) => `/sessiondata/${encodeURIComponent(taskId)}/${file}`;

export function createApi({ http = backend, staticHttp = pageFiles } = {}) {
    const post = async (url, body, config) => (await http.post(url, body, config)).data;
    const get = async (url) => (await http.get(url)).data;
    // The preference model is slow to answer only when it is down; the backend has its own short timeout, this one is a safety net
    const preference = (route) => (payload) => post(`/preference/${route}`, payload, { timeout: PREFERENCE_TIMEOUT_MS });

    return {
        session: {
            createSession: (body) => post('/create-session', body),
            saveFactorChoices: (body) => post('/save-factor-choices', body),
            updateTaskMeta: (body) => post('/update-task-meta', body),
            readMeta: (taskId) => get(sessionPath(taskId, 'meta/task.json'))
        },
        drafts: {
            save: (taskId, content) => post(sessionPath(taskId, 'drafts/latest.md'), { content }),
            read: async (taskId) => {
                const text = await get(sessionPath(taskId, 'drafts/latest.md'));
                return typeof text === 'string' ? text : '';
            },
            selectFactors: (body) => post('/select-factors', body),
            generateFirst: (body) => post('/generate-first-draft', body),
            rewriteSelection: (body) => post('/ai-generate-rewrite', body),
            addContent: (body) => post('/ai-add-content', body)
        },
        components: {
            extract: (body) => post('/component-extractor', body),
            link: (body) => post('/component-intent-link', body)
        },
        intents: {
            analyze: (body) => post('/intent-analyzer-new', body),
            read: (taskId) => get(sessionPath(taskId, 'intents/current.json')),
            rewrite: (body) => post('/intent-change-rewriter', body),
            checkConsistency: (body) => post('/intent-consistency-check', body),
            regenerateValues: (body) => post('/intent-regenerate-values', body)
        },
        preference: {
            rank: preference('rank'),
            update: preference('update'),
            rejectCheck: preference('reject-check'),
            resetSession: preference('reset-session'),
            analyzeChange: preference('analyze-change')
        },
        logging: {
            logEvent: (record) => post('/log-event', record)
        },
        static: {
            loadFactorList: async () => (await staticHttp.get('/data/PredefinedData/factor_list.json')).data
        }
    };
}

export const api = createApi();
