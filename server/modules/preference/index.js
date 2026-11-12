// The preference model: which version of a sentence a participant is likely to pick.
//   an adapter (createModelServicePreference) talks to the model service (model_service, Python) over http
//   the service (createPreferenceService) is what the rest of the server asks: it keeps the app working when the model is down
const axios = require('axios');
const { PreferenceUnavailableError } = require('../../contracts/errors');

const DEFAULT_CARDS = 3;

// The PreferencePort over http. Every call has a short timeout; whatever goes wrong is reported as "unavailable".
function createModelServicePreference({ baseUrl, timeoutMs = 2000, post = axios.post }) {
    const call = async (route, payload) => {
        try {
            return (await post(`${baseUrl}${route}`, payload, { timeout: timeoutMs })).data;
        } catch (error) {
            throw new PreferenceUnavailableError(error.message);
        }
    };
    return {
        rank: (request) => call('/rank', request),
        update: (event) => call('/update', event),
        rejectCheck: (request) => call('/reject-check', request),
        resetSession: (request) => call('/reset-session', request),
        analyzeChange: (request) => call('/analyze-change', request)
    };
}

// A PreferencePort for tests: answers with what it was given, remembers the calls, or fails with the error it was given
function createFakePreference({ rank, rejectCheck, analyzeChange, failWith } = {}) {
    const calls = [];
    const run = async (method, payload, result) => {
        calls.push({ method, payload });
        if (failWith) throw failWith;
        return result;
    };
    return {
        calls,
        rank: (request) => run('rank', request, rank),
        update: (event) => run('update', event, { ok: true }),
        rejectCheck: (request) => run('rejectCheck', request, rejectCheck || { reject_mean: 0, exceeds: false }),
        resetSession: (request) => run('resetSession', request, { ok: true }),
        analyzeChange: (request) => run('analyzeChange', request, analyzeChange || { added: [], removed: [], reworded: 0, kept: 0 })
    };
}

function shuffled(items, random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function createPreferenceService({ preference, random = Math.random }) {
    return {
        // The candidates in the order the participant is likely to prefer, `k` of them. When the model is down, or gives nothing
        // for candidates that exist, a random order is returned and `available` says it was not the model.
        async rank(request) {
            const cards = request.k || DEFAULT_CARDS;
            try {
                const result = await preference.rank(request);
                const values = (result && result.values) || [];
                if (request.candidates.length === 0 || values.length > 0) return { ...result, available: true };
            } catch (error) {
                if (!(error instanceof PreferenceUnavailableError)) throw error;
            }
            return {
                values: shuffled(request.candidates.map(candidate => candidate.value), random).slice(0, cards),
                ordering: 'fallback_random',
                mmr_used: false,
                style_strength: null,
                scores: null,
                style_scores: null,
                available: false
            };
        },
        update: (event) => preference.update(event),
        rejectCheck: (request) => preference.rejectCheck(request),
        resetSession: (request) => preference.resetSession(request),
        // What a used card changed. When the model is down the answer is "nothing", marked as not available (the page then goes on without it)
        async analyzeChange(request) {
            try {
                return { ...(await preference.analyzeChange(request)), available: true };
            } catch (error) {
                if (!(error instanceof PreferenceUnavailableError)) throw error;
                return { added: [], removed: [], reworded: 0, kept: 0, available: false };
            }
        }
    };
}

module.exports = { createModelServicePreference, createFakePreference, createPreferenceService };
