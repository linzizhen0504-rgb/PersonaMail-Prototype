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

## What a used card changed (propagation window)

After **Use**, the preference service (`model_service/change.py`, `POST /analyze-change`, through `POST /preference/analyze-change` of the backend) splits the text
of the part before and after into sentences with the MiniLM embeddings and says which sentences are new, which are gone and how many were only reworded
(cosine of 0.9 or more = kept, 0.55 or more = reworded; both limits are in `model_service/config.py`). The page puts this next to the text before and
after into the rewrite of the other parts that share the intent (`styleExamples`, `server/modules/email/styleExamples.js`).

It was chosen after comparing three analyses on the study logs (64 used cards, 52 replayed picks; read-only script, no model call):

| Analysis | Result |
|---|---|
| Sentence difference (this one) | Read on real cards it gave sensible answers (a pleasantry added, a reason added, a bracket replaced, an offer removed); 80% agreement with a plain word-overlap check on "did the content change" |
| Style labels (7 axes made from contrast sentences) | The axis named by the value was the top label for 30% of the cards, top two for 43% (chance 29%): not used |
| Accumulated preference as labels | Top-1 33% of the next picks, as good as chance; the vector the ranking uses reached 40%: not passed on to the rewriter |

The samples are small (30 to 64), so the two rejected analyses are rejected for the label list that was tried, not for every possible list.

Constraints that follow from the weak points seen:
- The analysis also carries content (a sentence like "I hope your week is going well!"). The prompt says it only shows what kind of change was made, never to copy it
  or to add a greeting, pleasantry or closing that is not the part's own job; the page also rejects a rewrite that contains a sentence the used card added
  (`copiesNewContent`, sentences of 20 characters or more) and asks once more.
- Only the examples of the same intent are sent (`examplesFor`); what was changed for another intent says nothing about this one.
- Only the last three used cards, each text cut to 600 characters, at most five sentences per list and 300 characters per sentence.
- When the preference service is down the analysis is empty (`available: false`) and the rewrite goes on with the examples alone; the page waits at most 1.5
  seconds for it. Every analysis is written to the log (`card_change_analyzed`), so that it can be checked afterwards.

## The style profile of one email

`model_service/style_profile.py` adds up, for one email of one participant, what the writer did: the cards used (with the sentences each added or
removed and its change of length), AI rewrites accepted, hand edits made after a card, and the cards passed over. It has two numbers: `evidence` (`min(1, operations / 4)`, only grows) and `strength` (how much the changes of the writer point the same way; the formula
`min(1, mass / 2) × |p| / mass` falls when the changes are about different texts, because their directions are nearly orthogonal). It is fed by the events the page already
sends to `/update` (`pick`, `regenerate`, `leave`, `ai_edit`, and the new `manual_edit`), stored in `profiles.json` under the same key as the style state and
cleared with it, and read with `POST /profile` (`/preference/profile` of the backend). Its statements ("tends to make texts shorter", "often adds new
sentences", "mostly changes the wording only") are plain rules on counts and need two changes of evidence; each lists the values it comes from.

It is used in two places (the writer never sees it; it only shows up in the logs as `profile_updated` and in `cards_shown`):
- **Ranking**: `rank` adds `profile_weight × confidence × relative profile score`. The score is the closeness (MiniLM) of the value words of a card to the values
  the writer took, minus the closeness to the ones they passed over, plus a small length term; `reasons` and `recommended` come with it.
- **Rewriting**: the page sends `styleProfile` (statements, values taken and passed over, the length to aim for) to `/intent-change-rewriter`; the prompt section is
  `server/modules/email/styleProfile.js`. It is sent in the generation of version cards and in the rewrites of the propagation window.

What the study logs say (read-only replay with the real model and the real code path, 74 picks of 43 emails, four seeds, random order switched off):

| | Taken card ranked first | Mean rank of the taken card |
|---|---|---|
| Without the profile term | 40.2% | 1.892 |
| With it (weight 1, length weight 0.1: what is built in) | 44.6% | 1.899 |
| Weight 2, length weight 0.1 | 43.2% | 1.895 |
| Length term alone (weight 2) | 37.8% | 1.959 |

The paired difference of the mean rank to the baseline is inside the noise (about ±0.11) for every setting, so **the ranking is not shown to be better**. The
length term alone was worse than the baseline, so its weight was cut to 0.1. For the card the profile calls recommended (it did so in 30% of the picks, where it
had a reason to show): it was the card taken in 55% of those cases (chance 33%); the four seeds replay the same picks, so this rests on about 22 different picks.

Rewriting, with the real model (14 real propagation rewrites of the logs, each with the profile the email had at that moment, three repeats per arm; arms: nothing /
examples and sentence analysis / those plus the profile):
- **Taking the profile in did not change the rewrites in a way these measures can see.** Alignment of the change with the change of the used card
  (+0.051 with the profile, +0.026 without; two repeats of the same arm differ by 0.095), closeness to the card's own text, and how different the versions of the
  different values are from each other (0.333 against 0.337) are all inside the noise. No rewrite copied a sentence the card had added.
- But the profiles of these emails held almost only values taken and passed over: the emails had fewer than two changes at that moment, so only one of the 14 had a
  statement and a length to aim for. In that one the rewrite followed the aim (length change +0.47 in log terms with the profile, +0.14 without, aim +0.40).
- **The length instruction is followed.** Giving every case a profile that says "about 30% shorter" or "about 40% longer" (nothing else changed) moved the length of the
  rewrite the asked way in 14 of 14 and 13 of 14 cases: 0.86 against 1.38 of the current length with none, and 1.80 for longer (the size is only roughly the one asked for).
  This shows that the instruction is obeyed, not that the result reads better.
- Versions returned unchanged (of 168 per arm): 6 without examples, 14 with the examples and the analysis, 14 with the profile too: the examples seem to make the model
  more careful about changing the text.

What is not known: whether a rewrite that follows the profile reads better to the writer (nobody read them), and whether the profile helps over several emails (it is kept for one email only; the logs of `P01` mix several people, so they cannot show it).

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
