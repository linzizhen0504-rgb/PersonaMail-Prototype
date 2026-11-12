// The interfaces between modules. A module asks for a port (an object with these methods) and never for a concrete implementation.
// Each method is described here with its input, output and the errors it may throw; assertPort checks at start-up that an
// implementation has all of them.

/**
 * @typedef {Object} SessionRef     A task of a user, already checked (see modules/session/ids.js)
 * @property {string} userName
 * @property {string} taskId
 */

/**
 * @typedef {Object} GenerateOptions
 * @property {boolean} [reasoning]   let the model think before it answers (a hint; a provider may ignore it)
 * @property {number}  [timeoutMs]   give up after this long (default 5 minutes)
 */

/**
 * LlmPort: one question to a language model.
 *   generateText(prompt: string, options?: GenerateOptions) -> Promise<string>
 *     throws ModelUnavailableError when the model cannot be reached after the retries; ModelOutputError when it blocked the request
 *
 * PromptStore: the prompt files.
 *   render(name: string, values: Object<string,string>) -> string      fills {{KEY}} once, in one pass, with the given values
 *
 * SessionRepository: what is stored for one task. A read of something that is not there returns null; it never throws for that.
 *   createSession(userName: string) -> Promise<SessionRef>
 *   hasSession(ref: SessionRef) -> Promise<boolean>
 *   readDraft(ref) -> Promise<string|null>          writeDraft(ref, text: string) -> Promise<void>
 *   readChoices(ref) -> Promise<Object|null>        writeChoices(ref, choices: Object) -> Promise<void>
 *   readIntents(ref) -> Promise<Array|null>         writeIntents(ref, intents: Array) -> Promise<void>
 *   readMeta(ref) -> Promise<Object|null>           updateMeta(ref, patch: Object) -> Promise<Object>
 *   readFile(ref, relativePath: string) -> Promise<{content: string, extension: string}|null>
 *     throws ValidationError when the path leaves the task folder
 *
 * PreferencePort: the preference model (which version a participant is likely to pick).
 *   rank(request) -> Promise<RankResult>            update(event) -> Promise<void>
 *   rejectCheck(request) -> Promise<Object>         resetSession(request) -> Promise<void>
 *   analyzeChange({before, after}) -> Promise<{added, removed, reworded, kept}>  (what a used card changed, in sentences)
 *
 * ExperimentLog: the events of an experiment, one line per event.
 *   append(record: Object) -> Promise<void>
 *
 * ApiLog: the record of the requests the server handled and the model calls it made.
 *   append(type: 'api'|'gemini', entry: Object) -> Promise<void>
 *   listDates() -> Promise<string[]>                query({date, type}) -> Promise<Array|null>
 *   clear({date, type}) -> Promise<string[]>        names of the files that were deleted
 *
 * FactorCatalog: the predefined communication factors.
 *   list() -> Promise<Array<{id, title, select_type, options: Array<{value}>}>>
 */

const PORTS = {
    LlmPort: { name: 'LlmPort', methods: ['generateText'] },
    PromptStore: { name: 'PromptStore', methods: ['render'] },
    SessionRepository: {
        name: 'SessionRepository',
        methods: ['createSession', 'hasSession', 'readDraft', 'writeDraft', 'readChoices', 'writeChoices', 'readIntents', 'writeIntents', 'readMeta', 'updateMeta', 'readFile']
    },
    PreferencePort: { name: 'PreferencePort', methods: ['rank', 'update', 'rejectCheck', 'resetSession', 'analyzeChange'] },
    ExperimentLog: { name: 'ExperimentLog', methods: ['append'] },
    ApiLog: { name: 'ApiLog', methods: ['append', 'listDates', 'query', 'clear'] },
    FactorCatalog: { name: 'FactorCatalog', methods: ['list'] }
};

module.exports = { PORTS };
