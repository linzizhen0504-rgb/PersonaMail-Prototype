# Architecture

PersonaMail Prototype is a **modular monolith**: one front end, one backend process, one separate preference-model service. Inside the
backend the code is divided into modules that talk to each other only through written interfaces (ports), so that each module can be
tested alone and replaced without touching the others.

```
   browser (React, src/)                    backend (Node, server/)                      outside
 ┌──────────────────────────┐   http    ┌──────────────────────────────────────┐
 │ pages: what the user sees │──────────▶│ http   routes, contract check, errors │
 │ src/domain: pure logic    │  contract │   │                                    │
 │ src/api: the only calls   │◀──────────│   ▼                                    │
 └──────────────────────────┘           │ email services (the business rules)    │
                                         │   │       │          │         │       │
                                         │   ▼       ▼          ▼         ▼       │
                                         │ LlmPort PromptStore SessionRepo Preference ──▶ model_service (Python, :3003)
                                         │   │                    │                    ExperimentLog / ApiLog / FactorCatalog
                                         │   ▼                    ▼
                                         │ Gemini | Ollama     files on disk (src/data/)
                                         └──────────────────────────────────────┘
```

## Where things are

| Part | Folder | What it does | Knows about |
|---|---|---|---|
| Pages | `src/pages/`, `src/App.js` | Screens, the editor (Slate), clicks and typing | `src/api`, `src/domain` |
| Page logic | `src/domain/` | Pure functions: finding, marking, highlighting and replacing a unit in the email (also over several paragraphs), which units a change reaches, comparing texts, checking a rewrite, placeholders | nothing (no React, no network) |
| Page → backend | `src/api/` | The only place that names the backend and calls it | the http contract |
| Contract | `contracts/schemas/` | One JSON Schema file per endpoint: request and answer (and the shape of an error) | – |
| Backend start-up | `server/index.js`, `server/config.js`, `server/app.js` | Reads the environment, chooses the implementation of every port, starts the server | everything (it is the only place that does) |
| Ports | `server/contracts/` | The interfaces between modules (`ports.js`), typed errors (`errors.js`), the check that an implementation is complete (`assertPort.js`), the loader of the http contract (`http.js`) | – |
| http | `server/http/` | Routes, checking requests against the contract, one error handler, the request log | services, never a model, a disk or the environment |
| email | `server/modules/email/` | The steps of writing an email: factors, draft, components, intents, rewrites, consistency check; the rules for what a usable model answer is | ports only |
| llm | `server/modules/llm/` | `LlmPort`: retries, JSON reading, a record of every call; adapters for Gemini, Ollama and a fake | a provider, only in `adapters/` |
| prompts | `server/modules/prompts/` | `PromptStore`: reads a prompt file and fills its `{{KEY}}` places | the prompt folder |
| session | `server/modules/session/` | `SessionRepository`: a task of a user (draft, choices, intents, meta data); checked names and paths | a folder on disk, or memory |
| preference | `server/modules/preference/` | `PreferencePort`: the adapter for the model service, and a service that falls back to a random order when it is down | `model_service` over http |
| logging | `server/modules/logging/` | `ExperimentLog` (what the participants did) and `ApiLog` (requests and model calls) | a log folder |
| catalog | `server/modules/catalog/` | `FactorCatalog`: the predefined communication factors | `factor_list.json` |
| Preference model | `model_service/` | Python/FastAPI service: ranks versions, learns from picks (see README) | its own data folder |

## The rules (and what enforces them)

1. **Modules reach each other only through their entry point** (`modules/x/index.js`), never into their inside. Checked by `server/architecture.test.js`.
2. **The business code does not touch a disk, a network or the environment**: `modules/email` and `http` may not require `fs`, `axios`, `http`, or read `process.env`; `modules/email` may not name an adapter or a provider. Checked by `server/architecture.test.js`.
3. **Only `server/index.js` reads the environment** (`server/config.js` receives it as an argument). Checked by `architecture.test.js`.
4. **A model provider is named only in `modules/llm` and the composition root.** Checked by `architecture.test.js`.
5. **Every implementation is checked against its port at start-up**: if a method is missing, the server does not start and says which (`assertPort`). Checked by `server/app.test.js`.
6. **The page never imports `axios` and never writes an address**: it calls `src/api`. Enforced by an eslint rule (`package.json`, `eslintConfig.overrides`).
7. **Every route has a description in `contracts/schemas/`, and every description has a route.** Checked by `server/contracts/http.test.js`; requests are checked against it at run time; every answer in the HTTP tests must match it; `src/api/api.test.js` checks what the page sends and expects against the same files.

## The ports

Written in `server/contracts/ports.js` (inputs, outputs, errors) and checked by `assertPort`.

| Port | Methods | Implementations |
|---|---|---|
| `LlmPort` | `generateText(prompt, { reasoning, timeoutMs })` | `createLlm({ adapter })` over `adapters/gemini.js` or `adapters/ollama.js`; `adapters/fake.js` for tests |
| `PromptStore` | `render(name, values)` | `createPromptStore({ dir })`, `createMemoryPromptStore` |
| `SessionRepository` | `createSession`, `hasSession`, `readDraft`/`writeDraft`, `readChoices`/`writeChoices`, `readIntents`/`writeIntents`, `readMeta`/`updateMeta`, `readFile` | `createFileSessionRepository({ root })`, `createMemorySessionRepository()` |
| `PreferencePort` | `rank`, `update`, `rejectCheck`, `resetSession` | `createModelServicePreference({ baseUrl })`, `createFakePreference` |
| `ExperimentLog` | `append(record)` | `createExperimentLog({ dir })` |
| `ApiLog` | `append(type, entry)`, `listDates`, `query`, `clear` | `createApiLog({ dir })` (appends json lines; also reads the older one-array-per-day files) |
| `FactorCatalog` | `list()` | `createFileFactorCatalog({ file })`, `createMemoryFactorCatalog` |

Errors are typed (`server/contracts/errors.js`): `ValidationError` (400), `NotFoundError` (404), `PreferenceUnavailableError` (503),
`ModelUnavailableError` and `ModelOutputError` (500, as clients know them). Only `http/middleware/errors.js` turns an error into an answer:
`{ "error": "<message>", "code": "<CODE>" }`.

## An example: the writer uses a version card

1. The page calls `api.intents.rewrite(...)` → `POST /intent-change-rewriter` → checked against `intent-change-rewriter.json` →
   `email.rewriteForIntent` → `PromptStore.render` + `LlmPort.generateText` → the versions of the unit under every value of the intent.
2. The page calls `api.preference.rank(...)` → `POST /preference/rank` → `PreferenceService.rank` → the model service. If the model service
   is down or answers nothing, the backend answers with a random order and `available: false`; the page logs `model_unavailable`.
3. The writer clicks **Use**: the page calls `api.preference.update(...)`, then `api.intents.checkConsistency(...)`; the window of the other
   parts appears when some part no longer fits.

## How to replace a part

**Another model provider** (for example another cloud model):
1. Write `server/modules/llm/adapters/<name>.js` with `generate(prompt, { reasoning, timeoutMs }) → { text, request, response }`; throw
   `ModelUnavailableError` (set `isTimeout` for a timeout) or `ModelOutputError`.
2. Export it from `server/modules/llm/index.js` and add its case to `createAdapter` in `server/app.js` and to `loadConfig` in `server/config.js`.
3. Write its unit test like `llm.test.js` (a fake `post`), then run `npm run test:server`. Nothing in `modules/email` or the pages changes.

**Another store for sessions** (a database instead of folders): implement the small store (`read`, `write`, `exists`) that
`server/modules/session/repository.js` is written over, or implement `SessionRepository` whole; run the shared suite
`sessions.contract.js` against it (see `sessions.test.js`); pass it to `createServerApp(config, { sessions })`.

**Another preference model**: implement `PreferencePort` (`rank`, `update`, `rejectCheck`, `resetSession`); the service in
`modules/preference/index.js` keeps the app working when it is down. Set `PREFERENCE_URL` if it is the same service on another address.

**The backend address the page uses**: `REACT_APP_API_BASE_URL` (in `.env.local`); it is read in `src/api/client.js` only.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | – | Use Gemini (needed unless `OLLAMA_MODEL` is set) |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model name |
| `OLLAMA_MODEL`, `OLLAMA_HOST` | – , `http://localhost:11434` | Use a local Ollama model instead of Gemini |
| `PORT` | `3001` | Backend port |
| `PREFERENCE_URL`, `PREFERENCE_TIMEOUT_MS` | `http://127.0.0.1:3003`, `2000` | The preference model service |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Pages that may read the answers (comma separated) |
| `REACT_APP_API_BASE_URL` | `http://localhost:3001` | Where the page finds the backend |

## Data on disk (unchanged by the restructuring)

- `src/data/SessionData/<user>/<task>/{meta,factors,intents,drafts,localized,logs}/` — one folder per task; the user is read from the task
  id (`<user>_<time>`) by removing the time at the end, so user names may contain underscores.
- `src/data/logs/<pid>.jsonl` — experiment events.
- `src/pages/api_logs/{api,gemini}-logs-<day>.jsonl` — requests and model calls (older days are `.json` arrays; both are read). Reading the
  record is not recorded, and a request or answer over 20,000 characters is kept as its size and its first 2,000 characters.
- `model_service/data/` — what the preference model has learned.

## Security measures

- Names that end up in paths (user, task, file path) are checked once, in `modules/session`; `..`, separators and null bytes are refused.
- Only the pages named in `CORS_ORIGINS` may read the answers.
- Requests are checked against the contract (type, required fields); the request body is limited to 1 MB.
- Request logs leave out `Authorization`, `Cookie` and similar headers; the Gemini key never appears in a log.

## Tests

| Layer | Command | What it holds |
|---|---|---|
| Backend | `npm run test:server` | characterization tests of every endpoint against a fake model (the same file runs on any backend with `SERVER_ENTRY`), unit tests of every module, port contract tests, http tests, architecture rules |
| Page | `npm test` | `src/api` against the contract, `src/domain` functions |
| Preference model | `cd model_service && pytest` | see README |
| End to end | `tests/e2e/run_all.sh` | a real browser, the real model; see `tests/e2e/README.md` |

Work is done test first (red, green, refactor): a failing test, then the least code that passes, then tidying. A bug gets a test that
reproduces it before it is fixed.

## Known limits and to do

- **Split `EmailEditor.js` (about 4,200 lines).** It still holds the editor (Slate), the version cards, the propagation window, the sidebar
  state and the step order of the writing flow. Splitting it into components and hooks was left out of the restructuring on purpose:
  the risk is in the Slate editor state (`editorKey` remounts), the undo snapshots and the selection races. Do it as its own task, with
  the end-to-end scripts as the safety net. This is the next step to make the front end only about the screen.
- **Version cards are two steps from the page**: asking for the versions and ranking them. The page filters the versions with the
  real paragraphs of the editor (`rewriteProblem`), so the two cannot be one backend call without sending the editor content.
- **Model failures are a 500** (as before), only an unreachable preference model is a 503.
- **`src/pages/serverDB.js`** (generation of anchor images in the original paper) is not used; it can be deleted.
- `email_system_refactor_plan.md` and `INSTRUCTION.md` in the project root are from October and do not describe the present structure.
