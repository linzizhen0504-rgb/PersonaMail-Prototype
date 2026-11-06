# PersonaMail Prototype

A redesigned interface for **PersonaMail**, an AI-assisted writing tool for tone-sensitive emails.

This repository is course work for **CS702-G1 Computational Interaction** at **Singapore Management University**.

## Team

- Zizhen, Lin
- Kuan Yu, Huang
- Gia Ngoc, Phan

## Original Work

This project re-forms the system presented in the following paper. The research idea, the system design and the original code belong to its authors.

> Rui Yao, Qiuyuan Ren, Felicia Fang-Yi Tan, Chen Yang, Xiaoyu Zhang, and Shengdong Zhao. 2026. **PersonaMail: Learning and Adapting Personal Communication Preferences for Context-Aware Email Writing.** In *ACM IUI 2026*. arXiv:2602.17340.

- Paper: https://arxiv.org/abs/2602.17340
- Original source code: https://github.com/Synteraction-Lab/IUI26-PersonaMail

We started from the authors' released code and redesigned the interface. The original README credits Rachel ([@RachelR1001](https://github.com/RachelR1001)) for the foundational codebase and system architecture.

### What we reuse from the paper

| From the paper | How it is used here |
|---|---|
| **Factor Exploration Panel** (Section 4.1): the curated list of communication factors in four categories — relationship, demography, communication context, risk mitigation | Kept unchanged. The factor list, options and selection logic are the authors'. |
| **Communicative Units** (Section 4.2.1): splitting the email into functional components such as Opening Salutation, Statement of Purpose, Call to Action | Kept, including the authors' prompt. |
| **Intents and intent-driven modification** (Sections 4.2.2–4.2.3): the Intent Analyzer, Unit–Intent Linker and Intent-Driven Rewriter pipeline | Kept, with the changes listed under "Intent pipeline" below. |
| **Adaptive Stylebook and QuickFix** (Section 4.3.2), and the local AI tools (rewrite, expand, shorten) | Kept unchanged. |
| The prompt templates in `public/data/Prompts/` and the Express backend `src/pages/serverGM.js` | Kept, with one new prompt and one new endpoint added. |

### What we do not use

- **Persona-Situation Anchors** (Section 4.3.1), including the anchor-adaptation agent and the anchor image generation. We replaced them with the simpler templates described below.
- **The Doubao API.** It was only used to generate anchor images, so it is no longer needed. You do not need a Doubao key, and `serverDB.js` does not need to run.

## What We Redesigned

**Interface**

- **One page instead of three.** The original has separate Email Task, Email Editor and Anchors pages with a navigation sidebar. Here the user enters a request, picks a template or sets the factors in a chat-style step, and continues in the editor on the same page.
- **Factor sidebar.** In the editor, the four factor categories sit in a collapsible left sidebar together with the user's request, so the options stay editable while writing. An arrow between the sidebar and the editor hides or shows it.
- **Templates.** A set of factor choices can be saved under a name, selected from a dropdown, updated or deleted. This replaces both "Save as Default" and the Anchors.
- **Ask AI to add content.** A box under the editor takes a description of what is missing. The AI returns a revised email as a preview, which the user applies or discards. It is currently hidden (`SHOW_ASK_AI=false` in `EmailEditor.js`) so that it does not interfere with the experiment.
- **Header and icons.** The navigation sidebar is replaced by a header with the logo, a New Task button and a user menu with Log out.
- **Simpler editor header.** The Regenerate Draft, Save Draft and Clear Highlighting buttons and the coloured unit circles are removed, and so is the `/regenerate-draft` endpoint. A blue "Generating email…" indicator shows while the draft is written.

**Intent pipeline**

- Intent options keep their position when one is selected.
- Every component is linked to at least one intent. The original prompt deliberately avoids over-linking, which often left components with no intent to adjust.
- Model output that is not valid JSON is repaired or requested again instead of failing silently.

## The A/B Experiment

The app supports a between-subjects study with two conditions, chosen by URL parameters:

```
http://localhost:3000/?cond=baseline&pid=P01
http://localhost:3000/?cond=cards&pid=P01
```

`cond` defaults to `baseline`. The URL overrides what is stored in the session, and `pid` identifies the participant in the logs.

| Condition | Intent UI |
|---|---|
| `baseline` | The original system: radio buttons for the intent values, a Modification Preview and an Apply button. Behaviour is unchanged. |
| `cards` | **Version Cards.** Each intent is a pill. Clicking a pill shows up to three cards with a red/green word diff of the unit. **Use** applies a card; **Regenerate** asks for new versions. |

Participants never see anything about the preference model.

### Version Cards behaviour

- The current value is always excluded. Up to three of the remaining values are shown; their order comes from the preference model (see below) and falls back to random if the model service is down.
- Each display ends exactly once: **Use**, **Regenerate**, or leaving (selecting another unit or intent, Generate Components, Reset Editor, New Task). Each ending writes one log line and sends one update to the model.
- **Regenerate** asks the model service whether the shown values were rejected often enough to be replaced. If so, it generates three new intent values (`/intent-regenerate-values`); otherwise it generates new versions for the same values.
- **Intent propagation.** Several units can share one intent. After **Use**, the other units that share the intent are rewritten in parallel to the same value and written into the editor, and the intent's current value is updated. A rewrite is rejected if it contains other units' text, is far longer than the original, or creates repeated sentences; it is retried once and then skipped.
- **Version filtering.** Versions that would duplicate or swallow other parts of the email are dropped before display. If none survive after a retry, the user sees "Couldn't generate versions. Try again."
- **Label check.** The rewriter prompt receives the real intent values, and the reply must match them one to one, with up to three retries. Otherwise the request fails instead of showing a mislabeled card.
- **First-use guide.** A short tour points to **Generate Components**, shown once per username in the `cards` condition.
- Highlighting marks the selected unit in the editor with a background colour only. If the unit cannot be located exactly, a looser search inside a single paragraph is used.

### Preference model

A Python service in `model_service/` (FastAPI, port 3003) decides which values to show and in what order. It runs locally and uses the `all-MiniLM-L6-v2` sentence embedding.

**Per-participant value preference (Beta-Bernoulli).** For each participant, email context, intent dimension and value, the model keeps `[accept, reject]` counts:

- **Use** adds an accept to the chosen value and a reject to the other shown values.
- **Regenerate** and leaving add a reject to every shown value.
- A new value starts from a prior of `[1, 1]` plus the counts of similar known values (cosine similarity ≥ 0.75, at most 5, strength capped at 10). Optional `priors.json` can supply frozen priors built from earlier logs.
- The score is a Thompson sample from each value's Beta distribution. MMR (λ = 0.7) picks three candidates that differ from each other. In 25% of displays the order is random instead of ranked, so that order effects can be analysed.

**Session style preference.** Within one email, the model also learns an overall style and uses it to rank cards in other intents and units:

- The style feature of a card is the embedding of its rewrite minus the embedding of the unit's current text, concatenated with the embedding of the value words.
- The preference vector is a weighted sum over events: chosen card +1.0, other shown cards −0.3, Regenerate −0.5, leave −0.2.
- Its strength grows with the amount of evidence and shrinks when picks and rejects cancel out: `min(1, mass/2) × |p|/mass`. With no evidence it is 0.
- Final score = Beta sample + 1.5 × strength × relative style score of the card within the shown set.
- The state is kept per participant and per email (`taskId:draftVersion`), and starts again for every new draft or New Task. It is stored in `model_service/data/styles.json`.

We compared three style representations offline (MiniLM only, StyleDistance only, both). MiniLM with rewrite-minus-original plus value words worked best on the simulated preference-transfer test, so StyleDistance is not used.

**Endpoints**

| Endpoint | Purpose |
|---|---|
| `POST /rank` | Rank candidates for a display; returns the order, scores, `ordering` and `style_strength` |
| `POST /update` | Record the outcome of a display (`pick`, `regenerate`, `leave`) |
| `POST /reject-check` | Decide whether to regenerate the intent values instead of the versions |
| `POST /reset-session` | Clear the style state of one email |
| `GET /stats`, `GET /health` | Counters and liveness |

CORS allows `localhost:3000` and `127.0.0.1:3000`. If the service is unreachable the front end waits at most 2 seconds, falls back to random order and logs `model_unavailable`.

### Experiment logs

The backend writes one JSON line per event to `src/data/logs/{pid}.jsonl` through `POST /log-event` (ignored by git).

- `cards`: `cards_shown` (context, ordering, `mmr_used`, trigger, `style_strength`, filtered candidates), `pick`, `regenerate`, `leave`, `edit_done` (text edited after Use, for analysis only), `values_regenerated`, `versions_regenerated`, `regenerate_failed`, `model_unavailable`, `intent_propagated` (updated and failed units).
- `baseline`: `preview_shown`, `apply`, `leave`.

`model_service/build_priors.py --pids P01 P02` turns logs into `priors.json`, and `convert_legacy_data.py` converts counts from the older three-outcome format.

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/linzizhen0504-rgb/PersonaMail-Prototype.git
cd PersonaMail-Prototype
npm install
```

The `main` branch is this version. The earlier interface-only prototype is kept on the `prototype1` branch.

### 2. Add your Gemini API key

Create a file named `.env` in the project root:

```
GEMINI_API_KEY=your_gemini_api_key
```

The `.env` file is ignored by git, so your key stays on your machine.

Optional: to run on a local [Ollama](https://ollama.com) model instead of Gemini, also add `OLLAMA_MODEL=<model name>` and start `ollama serve`. Leave it out to use Gemini. Local 7B models rewrite less reliably than Gemini; we used `qwen2.5:7b` for testing only.

### 3. Set up the preference model service (`cards` condition)

Python 3.10 or newer is needed. The `baseline` condition does not use this service.

```bash
cd model_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The first start downloads `all-MiniLM-L6-v2` once.

### 4. Run

Open three terminals in the project root.

```bash
# Terminal 1: frontend, http://localhost:3000
npm start
```

```bash
# Terminal 2: backend, port 3001
node src/pages/serverGM.js
```

```bash
# Terminal 3: preference model service, port 3003 (cards condition)
cd model_service && source .venv/bin/activate
uvicorn app:app --port 3003
```

Restart the backend after changing `serverGM.js` or `.env`.

When all three are running, open **http://localhost:3000/?cond=cards&pid=P01** in the browser. Use `?cond=baseline` instead for the original interface. Without `cond` the app runs `baseline`. If the intents show as radio buttons with an Apply button instead of pills and cards, the app is in `baseline`.

### 5. Test the model service

```bash
cd model_service && source .venv/bin/activate
pytest            # fast tests with a fake embedder
pytest -m slow    # also loads the real MiniLM model
```

## Using the Prototype

Open the app with a condition in the URL: `http://localhost:3000/?cond=cards&pid=P01` for Version Cards, or `?cond=baseline` for the original interface. Without `cond` the app runs `baseline`, which looks like the earlier prototype, and the condition is remembered until the tab is closed.

1. Enter a username at the top right.
2. Describe the email you need and send.
3. Choose a saved template or select the factors that matter, then click **Generate Email Draft**.
4. In the editor, edit the text directly, or change the factors in the sidebar and generate a new draft.
5. Click **Generate Components** to split the email into components. Select a component to see its intents.
6. In `baseline`, choose another value, preview the rewrite and click **Apply**. In `cards`, click an intent pill and **Use** one of the cards, or **Regenerate**.

## Notes

- Templates are stored in the browser's local storage, per username. They are not shared between browsers or machines.
- Drafts and session data are written to `src/data/SessionData/`, and API logs to `src/pages/api_logs/`. Both stay local and are ignored by git.
- Generating components makes three model calls and can take a while, especially with a local model. Intent propagation can take 30 to 120 seconds with a local model, and the editor refreshes when it finishes.
- Model counts and style state live in `model_service/data/` (`counts.json`, `stats.json`, `styles.json`), also ignored by git. Delete them to reset the model.
- The study data of each participant are kept under their `pid`. Use a separate `pid` such as `PT01` for testing.

## Credits

- Bot icon by [Icons8](https://icons8.com).
