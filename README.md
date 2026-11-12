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
| **Adaptive Stylebook and QuickFix** (Section 4.3.2), and the local AI tools (rewrite, expand, shorten) | Not used. The old selection toolbar is replaced by the "Describe changes" box (see below), which uses the authors' rewrite prompt. |
| The prompt templates in `public/data/Prompts/` and the Express backend in `server/` | Kept, with new prompts (version values, factor selection, consistency check) and new or changed endpoints (`/select-factors`, `/intent-consistency-check`, `/intent-regenerate-values`). |

### What we do not use

- **Persona-Situation Anchors** (Section 4.3.1), including the anchor-adaptation agent and the anchor image generation. We replaced them with the factor options chosen by the model, described below.
- **The Doubao API.** It was only used to generate anchor images, so it is no longer needed. You do not need a Doubao key, and `serverDB.js` does not need to run.

## What We Redesigned

The paper presents a writing system and evaluates it against standard LLM interfaces. Prototype2 keeps its core idea, which is to make tone explicit through communication factors, communicative units and intents. It changes how the user works with them, and it replaces the strategy-reuse part (Anchors, Adaptive Stylebook) with a different mechanism. In short:

| | Paper (PersonaMail) | Prototype2 |
|---|---|---|
| **Choosing the tone** | After the user describes the email, the system shows a curated subset of factors and the user selects values (quick selection, open-ended elaboration). | The model reads the request and selects the factors and their values itself (`/select-factors`); the user can change any of them. |
| **Reusing strategies** | Two explicit tiers. **Persona-Situation Anchors** are saved factor configurations, adapted to a new task by an LLM agent. The **Adaptive Stylebook** turns the user's edits, with their stated reason ("Why did you make this change?"), into saved rules that **QuickFix** retrieves later. | Neither is used. A **preference model** learns implicitly from what the user does with the version cards (Use, Regenerate, leave) and from AI rewrites the user accepts, and decides which values to show and in what order. No saved objects, no rationale asked, nothing shown to the participant. |
| **Changing a unit** | Select a unit, change an intent value, see one alternative expression; local AI tools for selected text (rewrite, expand, shorten) and QuickFix. | Each intent is a pill that opens up to three **version cards** (current value excluded) with the changed sentences in green; **Use** or **Regenerate**. Free-text changes go through the **Describe changes** box. |
| **Other units** | Not described. | **Intent propagation**: when units share an intent, a window offers to bring the other units in line (checked by `/intent-consistency-check`). Opening Salutation and Valediction are independent and never take part. |
| **Placeholders** | Not described. | A sidebar table fills the `[bracketed]` information live; instruction-like brackets are never left in version cards. |
| **Structure** | Three pages (task, editor, anchors). | One page: the request, the factors, the draft, its components and its intents. |
| **Models** | Prompt-based agents; anchor images from the Doubao API. | The paper's four intent agents are kept, with the changes under "Intent pipeline"; Gemini or a local Ollama model; no anchor images. The preference model is a local Python service (MiniLM embeddings). |
| **Purpose** | A system for writers, evaluated in a user study. | Built to run a study of how people use the cards: every display and its outcome is logged per participant (`pid`). |

The results reported in the paper (efficiency, quality, satisfaction) are about the authors' system. They are not claims about this prototype, which has not been evaluated in the same way. The details follow.

### One page instead of three

The original has separate Email Task, Email Editor and Anchors pages with a navigation sidebar. Here the user enters a request, the model chooses the factor options for it, and the editor opens on the same page with the first draft being written. The navigation sidebar is replaced by a header with the logo, a New Task button and a user menu with Log out.

### Sidebar (`cards`)

The left sidebar keeps the request and the options editable while the user writes. Its small buttons (Clear All, Copy) show only an icon; the name slides out next to the icon when the mouse is over the button. Its sections are open by default and can be collapsed with the arrow next to each title; an arrow between the sidebar and the editor hides or shows the whole sidebar.

- **Information to fill.** A table of the `[bracketed]` placeholders in the draft, with an input for each. Names that appear several times are listed once, and `[A / B]` brackets are split into their own fields. A bracket with an example, such as `[Proposed Date, e.g., Friday 5 PM]`, is listed under the text before the example (`[Proposed Date]`); "for example" and "such as" count as well, and emptying the input puts the whole bracket back as it was. Brackets that ask for a reason or a next step (`[briefly state your reason, e.g., … / …]`, `[mention progress, …]`) and lists of alternatives to pick from (`[stealing my food / snuggling in bed / snacking]`: every item starts in lower case) are not in the table: they stay as they are in the email and are changed with the version cards, whose versions replace such a bracket with concrete wording. What is typed goes into the email live (after a short pause), in every place the placeholder occurs; emptying an input puts the brackets back. The row stays after it is filled, so the value can be changed again, and it follows when the filled-in text is edited in the email. The row goes when all of that text is deleted by hand. The small trash icon in front of a placeholder takes the placeholder out of the email (every place it occurs, with the value filled in, and the spaces it leaves) and removes its row. Cmd/Ctrl+Z undoes a change made from the table, a deletion included. There is no Apply button: the values are also sent with the request when you click **Regenerate with These Options** and are filled into the new draft; if a value does not fit the new draft, a message says so. **Clear All** empties the inputs and puts the brackets back.
- **Request.** The user's request, with a **Copy** button.
- **Tone Factors.** The four factor categories of the paper. When a request is sent, the model reads it and selects only the factors that matter for it (`POST /select-factors`, prompt `18factor_selector.prompt.md`); every value comes from the factor's own options. The user can change any of them, and **Clear All** next to the title sets every option back to Not selected. If the model cannot choose, the draft is written without options and a message says so.
- **Regenerate with These Options** (at the bottom) writes a new draft from the current options and request.

### Generating the email (`cards`)

The draft, its components and the intents are made in one go. While they are made, the page shows its final layout with nothing in it (empty subject line, body card, component list, intents area and information table) and a "Generating email and components…" indicator. Everything appears together once both the email and its components are ready. If the intents cannot be made, the email is shown without components and a message asks the user to click **Regenerate**.

### Editor (`cards`)

- **Subject and body.** The subject is a line of its own, with a **Copy** button. The body is a white card whose top holds the formatting toolbar (bold, italic, underline, H1, H2, lists) and a **Copy** button for the body. The subject line and the toolbar stay in place; only the body scrolls, with its own scrollbar inside the card. The text `Subject:` stays in the draft data but is not shown.
- **Always editable.** The email can be edited by hand at any time. Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z or Ctrl+Y redoes, for manual edits and for accepted AI rewrites.
- **Email Components.** The component list sits at the right of the editor, with a **Regenerate** button that rebuilds the components and intents for the email as it is now (after the user has edited or rewritten it). A one-time tip points at this button after the first generation (once per username).
- **Click logic.**
  - Hovering over a unit tints it and shows a pointer.
  - The first click on a unit highlights it and shows its intents on the right; the first intent is opened at once, so its versions are generated ("Generating versions…"). The caret is placed where the click landed.
  - A click on the highlighted unit opens the **Describe changes** box for the whole unit.
  - Selecting text anywhere in the email, also across paragraphs, opens the same box for the selection.
- **Describe changes box.** The user types what to change; the AI returns a rewrite of only the selected text as a preview, which is accepted or discarded. Accepting replaces the selection (or all selected paragraphs). If the replaced text touches components, the component list is cleared and a note says so. The box does not take the keyboard focus, and typing in the email closes it.
- **Removed.** The Reset Editor and Generate Components buttons, the old selection toolbar (Quickfix, manual edit and so on), the Component Modification Record dialog, the coloured unit circles, and the Apply button of the information table. A blue loading indicator replaces the Regenerate Draft, Save Draft and Clear Highlighting buttons and the `/regenerate-draft` endpoint.
- **Ask AI to add content** (a box under the editor) is kept in the code but hidden (`SHOW_ASK_AI=false` in `EmailEditor.js`) so that it does not interfere with the experiment.

### Intent pipeline

- Intent options keep their position when one is selected.
- Every component is linked to at least one intent. The original prompt deliberately avoids over-linking, which often left components with no intent to adjust.
- Model output that is not valid JSON is repaired or requested again instead of failing silently.

## Version Cards

The app has one interface. Each intent is a pill; clicking a pill shows up to three cards, with the sentences that differ from the current text in green. **Use** applies a card; **Regenerate** asks for new versions. Add `?pid=P01` to the URL to identify the participant in the logs (and `&profile=1` for the demo view of the style profile). Participants never see anything about the preference model.

### Version Cards behaviour

- The current value is always excluded. Up to three of the remaining values are shown; their order comes from the preference model (see below) and falls back to random if the model service is down.
- Each card shows the new text of the unit as plain text. Sentences that are not in the current text are marked in green.
- Each display ends exactly once: **Use**, **Regenerate**, or leaving (selecting another unit or intent, regenerating the components, New Task). Each ending writes one log line and sends one update to the model.
- **Regenerate** (the one in the version area) asks the model service whether the shown values were rejected often enough to be replaced. If so, it generates three new intent values (`/intent-regenerate-values`); otherwise it generates new versions for the same values. The Regenerate button of the component list is a different button: it rebuilds the components and counts as leaving.
- **Intent propagation.** Several units can share one intent. After **Use**, the other units that share it (not the opening salutation and the valediction: these two are changed on their own, they neither carry a change to other units nor receive one) are checked against the new value (`POST /intent-consistency-check`, prompt `19intent_consistency_check.prompt.md`): the model reads their texts and says which ones no longer agree with it (with a one-sentence reason that goes to the log as `consistency_checked`; the window does not show it). A unit the model gives no answer for counts as not agreeing. If none disagrees, nothing is shown (the notice says they already fit). Otherwise the window "Apply this change to other parts?" lists **every** unit that shares the intent, because the writer may want the change in one that already fits: the ones that do not agree are ticked, the others are not. Their rewrites for the new value are made in parallel and shown as they arrive, with the changed sentences in green; a unit is greyed out while its rewrite is being written, and one whose rewrite failed says "Could not write a version for this part", is not ticked and stays as it is. The user changes the ticks and clicks **Apply selected** (Cmd/Ctrl+Z takes them back), or clicks **Skip**; nothing is written before that, and a unit that is skipped keeps its text and its intent value. If the check itself fails, every unit that shares the intent is offered and ticked. The rewrites also follow what the user already chose in this email: the last three used cards for the same intent (their text before and after, and which sentences the preference model found they added or removed with `POST /preference/analyze-change`) and a short summary of the style profile (see "Style profile") go to the rewriter, which is told to take over the manner and never the sentences themselves; a rewrite that contains a sentence the used card added to its own part is rejected. A rewrite is rejected if it contains other units' text, is far longer than the original, or creates repeated sentences; it is retried once and then shown as failed and left as it is.
- **Version filtering.** Versions that would duplicate or swallow other parts of the email are dropped before display. If none survive after a retry, the user sees "Couldn't generate versions. Try again."
- **Label check.** The rewriter prompt receives the real intent values, and the reply must match them one to one, with up to three retries. Otherwise the request fails instead of showing a mislabeled card.
- Highlighting marks the selected unit in the editor with a background colour only. A unit is located in the email by its text; if it cannot be found exactly, a looser search inside a single paragraph is used. Before the components are made, the draft file is updated with what is in the editor, so hand edits do not break this.

### Preference model

A Python service in `model_service/` (FastAPI, port 3003) decides which values to show and in what order. It runs locally and uses the `all-MiniLM-L6-v2` sentence embedding. The page does not call it: it asks the backend (`/preference/...`), which has a short timeout and, when the service is down or answers nothing, gives a random order of the versions (`ordering: fallback_random`, `available: false`).

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

**Style profile (one email).** Every operation of the writer in an email is added up in a profile, which is kept per participant and per email like the style state (`model_service/style_profile.py`, `profiles.json`) and cleared with it:

- **What is recorded.** A used card (the sentences it added or removed, found with the sentence embeddings, and how much it changed the length), an AI rewrite the writer accepted (their prompt, matched to a value), a hand edit made after a card, and the cards that were passed over (shown next to a used one, regenerated, or left).
- **Statements with evidence.** From two changes on, the profile says things like "Tends to make texts shorter (about 23% on average)", "Often adds new sentences (2 of 3 changes)" or "Mostly changes the wording only", each with the values it comes from. These are plain rules on counts, not a model; nothing is said when the evidence is thinner.
- **Ranking.** The rank adds a profile term: how close a card's value words are to the values the writer took and how far from the ones they passed over (MiniLM similarity), and how near the length change of the card is to the one the writer tends to make. The term counts more as the email goes on (`confidence = min(1, operations / 4)`), and `/rank` returns it with a reason for the card it is clear about.
- **Rewriting.** The page sends a short version of the profile (the statements, the values taken and passed over, the length to aim for) to the rewriter, in the generation of version cards and in the rewrites of the propagation window. The rewriter is told to follow the length and manner and to keep the meaning of each intent value.
- **Demo view.** With `?profile=1` in the address (for example `?pid=DEMO&profile=1`) a **Style** tag next to the title of the component list opens the profile with two numbers: **Evidence** (how much there is to go on; it only grows with the operations and is full at four) and **Style strength** (how much the writer's changes point the same way; it can go down when they change very different texts, even if they keep taking recommended cards). The card the profile is clear about says which of the writer's picks it matches. Without it the page looks as before: participants never see anything about the preference model.

**How the style profile is calculated** (all in `model_service/style_profile.py`, `model.py` and `config.py`; every number below is a setting there):

- **What a change is.** A used card, an accepted AI rewrite and a hand edit after a card are *changes*; a display that ends without taking a card (the cards passed over) is a *rejection*. For a change the profile keeps the length ratio `log(length after / length before)` and the sentence analysis. The analysis splits both texts into sentences (a bracket such as `[state your reason, e.g., an illness. Or another]` is never split) and compares each new sentence with the old ones by the cosine of their MiniLM embeddings: 0.9 or more is *kept*, 0.55 or more is *reworded*, anything else is *added*; an old sentence that no new one reaches 0.55 with is *removed*. At most 5 sentences of 300 characters are listed.
- **Values taken and passed over.** A used card adds 1.0 to the weight of its value; an AI rewrite adds 1.0 to the value its prompt matched (cosine of the prompt with `dimension: value` of 0.40 or more, and ahead of the second best by 0.05). The cards shown next to a used one add 0.3 each to the values passed over, Regenerate adds 0.5 and leaving adds 0.2 for each card shown. The top five of each are kept; the page sends the values passed over only from a weight of 0.5.
- **Operations and evidence.** `operations = changes + rejections` (a used card is one change, plus one rejection when other cards were shown, so it counts as two). `evidence = min(1, operations / 4)`: it only grows.
- **Statements.** A statement needs at least 2 changes behind it. A change is *shorter* or *longer* when its length ratio is at least 5% either way. "Tends to make texts shorter / longer" needs 2 such changes, at least half of all changes, and an average of at least 10% (`exp(mean log ratio) - 1`, shown as a percentage). "Often adds new sentences" and "Often removes sentences" need 2 changes and at least half of all changes. "Mostly changes the wording only" counts the changes that added and removed nothing and only reworded, and needs 2 of them and at least 60% of all changes. Each statement lists the values of the changes it counts.
- **Style strength.** The state of the style (`style.py`) is a sum `p` of feature vectors with a weight each: `+1.0` for a used card, `-0.3` for each card shown next to it, `-0.5` for each card regenerated, `-0.2` for each card left, `+1.0` for an accepted AI rewrite. The feature of a card is `[(embedding of its text - embedding of the current text) / 0.65, 0.5 × embedding of its value words]`. `mass` is the sum of the absolute weights, and `strength = min(1, mass / 2) × |p| / mass`. It measures how much the changes point the same way, so it falls when the writer changes very different texts, whose directions are nearly orthogonal; it is not an accuracy. The ranking also uses it: the style term is `1.5 × strength × the relative style score of the card`.
- **Profile term of the ranking.** For each card: `raw = 1.0 × (closeness to the values taken - closeness to the values passed over) + 0.1 × (-|log(length of the card / length of the current text) - mean log length ratio of the writer|)`, where the closeness to a group is the weighted mean of the cosines of the embeddings of the value words, weighted by the weights above. The raw scores of the cards shown are made relative: `clip((raw - mean) / (standard deviation + 0.05), -2, 2) / 2`, a number from -1 to 1. The score of the card is `Beta sample + style term + 1.0 × evidence × relative profile score`. The length term is 0 until the writer has made a change.
- **Recommended card.** The card with the highest relative profile score is called recommended when that score is at least 0.3, the evidence is at least 0.5, and it has a value taken that it is close to (the one the page names in "Matches your picks").
- **What the rewriter gets.** The statements (at most 5), the values taken (at most 5), the values passed over with weight 0.5 or more, and a length to aim for: the average length change, only when there is a "shorter" or "longer" statement and it is at least 10%. In the propagation window it also gets the last 3 used cards of the same intent with their sentence analysis.
- **How the numbers were chosen.** The thresholds above were set by hand. Only the weight of the profile term (and the small length weight) was compared on the study logs: see `docs/ARCHITECTURE.md`, which also says what that comparison did and did not show.

The style representation uses only the MiniLM model already used by the service: the rewritten text minus the current text, plus the words of the value.

**Endpoints**

| Endpoint | Purpose |
|---|---|
| `POST /rank` | Rank candidates for a display; returns the order, scores, `ordering` and `style_strength` |
| `POST /update` | Record the outcome of a display (`pick`, `regenerate`, `leave`), an AI rewrite the writer used (`ai_edit`) or a hand edit after a card (`manual_edit`) |
| `POST /profile` | The style profile of one email (see "Style profile"): values taken and passed over, statistics, statements with their evidence, the latest operations |
| `POST /analyze-change` | Which sentences a used card added or removed, and how many were only reworded (sentence embeddings; no model writes anything) |
| `POST /reject-check` | Decide whether to regenerate the intent values instead of the versions |
| `POST /reset-session` | Clear the style state of one email |
| `GET /stats`, `GET /health` | Counters and liveness |

CORS allows `localhost:3000` and `127.0.0.1:3000`. If the service is unreachable the front end waits at most 2 seconds, falls back to random order and logs `model_unavailable`.

### Experiment logs

The backend writes one JSON line per event to `src/data/logs/{pid}.jsonl` through `POST /log-event` (ignored by git).

- Options: `factors_auto_selected` (the factors and values the model chose), `factors_auto_select_failed`.
- Versions: `cards_shown` (context, ordering, `mmr_used`, trigger, `style_strength`, filtered candidates), `pick`, `regenerate`, `leave`, `edit_done` (text edited after Use, for analysis only), `values_regenerated`, `versions_regenerated`, `regenerate_failed`, `model_unavailable`, `consistency_checked` (the units checked and the ones that did not fit, `check_failed`), `propagation_prompted` (the window opened; the units listed), `intent_propagated` (after the user answered: `accepted_units`, `skipped_units`, failed units and their reasons).
- Editor: `unit_click_select` (a unit was selected by clicking it), `selection_rewrite_requested`, `selection_rewrite_applied`, `selection_rewrite_discarded`, `selection_rewrite_undone`, `selection_rewrite_redone` (the Describe changes box; `trigger` is `click` or `selection`), `copy_section` (subject or body copied), `placeholders_applied` (the labels of the filled fields and of the ones that were not used; the typed values are not logged), `placeholder_deleted` (the label of a placeholder removed from the email with its trash icon).
- Learning: `card_change_analyzed` (the sentences a used card added or removed), `ai_edit_learned` (an AI rewrite taken in by the model, with the value its prompt matched, and `learned`), `profile_updated` (the statements, the values taken and passed over, after each operation); `cards_shown` also carries `profile_scores` and `recommended`.

`model_service/build_priors.py --pids P01 P02` turns logs into `priors.json`, and `convert_legacy_data.py` converts counts from the older three-outcome format.

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/linzizhen0504-rgb/PersonaMail-Prototype.git
cd PersonaMail-Prototype
npm install
```

The `main` and `prototype2` branches are this version. The earlier interface-only prototype is kept on the `prototype1` branch.

### 2. Add your Gemini API key

Create a file named `.env` in the project root:

```
GEMINI_API_KEY=your_gemini_api_key
```

The `.env` file is ignored by git, so your key stays on your machine.

Optional: to run on a local [Ollama](https://ollama.com) model instead of Gemini, also add `OLLAMA_MODEL=<model name>` and start `ollama serve`. Leave it out to use Gemini. Local 7B models rewrite less reliably than Gemini; we used `qwen2.5:7b` for testing only.

### 3. Set up the preference model service

Python 3.10 or newer is needed.

```bash
cd model_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows, use `python -m venv .venv` and activate with `.venv\Scripts\activate` (PowerShell: `.venv\Scripts\Activate.ps1`) instead of `source .venv/bin/activate`. This applies every time the guide says to activate the environment.

The first start downloads `all-MiniLM-L6-v2` once.

### 4. Run

Open three terminals in the project root.

```bash
# Terminal 1: frontend, http://localhost:3000
npm start
```

```bash
# Terminal 2: backend, port 3001
npm run server        # the same as: node server/index.js (the old command, node src/pages/serverGM.js, still works)
```

```bash
# Terminal 3: preference model service, port 3003
cd model_service && source .venv/bin/activate
uvicorn app:app --port 3003
```

Restart the backend after changing code in `server/` or the `.env` file. The settings you can change are listed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#settings).

When all three are running, open **http://localhost:3000/?pid=P01** in the browser.

### 5. Tests

```bash
npm run test:server    # backend: every endpoint against a fake model, every module, the architecture rules (no services needed)
npm test               # page: src/api against the contract, src/domain
cd model_service && source .venv/bin/activate
pytest                 # preference model, fast tests with a fake embedder
pytest -m slow         # also loads the real MiniLM model
```

The end-to-end scripts (a real browser and the real model, slow) are in `tests/e2e/`; see `tests/e2e/README.md`.

## Project structure

```
src/pages, src/App.js   screens and the editor
src/domain/             pure logic of the page (finding a unit in the email, checking a rewrite, placeholders)
src/api/                the only place the page calls the backend from
contracts/schemas/      the http contract: one JSON Schema file per endpoint
server/                 the backend: modules behind written interfaces (llm, prompts, session, preference, logging, email, http)
model_service/          the preference model (Python)
public/data/Prompts/    the prompt files
tests/e2e/              end-to-end scripts
docs/ARCHITECTURE.md    how the parts fit, the rules, how to replace a model provider or a store, what is still to do
```

## Using the Prototype

Open `http://localhost:3000/?pid=P01` (`pid` identifies the participant in the logs).

1. Enter a username at the top right.
2. Describe the email you need and send.
3. Wait while the model chooses the factor options (shown in the sidebar under **Tone Factors**) and writes the email; the email and its components appear together.
4. If the options or the email are not what you want, change the options and click **Regenerate with These Options**.
5. Edit the text directly, or fill in the information table; the values also go into a new draft when you regenerate.
6. Click a unit to see its intents (the first one opens at once), click an intent pill to switch, and **Use** one of the cards or **Regenerate** it. Click the highlighted unit, or select text, to ask the AI for a change in your own words. After editing the email by hand, click **Regenerate** next to Email Components to rebuild the components.

## Notes

- Drafts and session data are written to `src/data/SessionData/`, and API logs to `src/pages/api_logs/`. Both stay local and are ignored by git.
- Making the components takes several model calls (the email, the components, the intents and their links) and can take a while, especially with a local model. The rewrites in the propagation window can take 30 to 120 seconds with a local model; each one appears as soon as it is ready.
- Model counts and style state live in `model_service/data/` (`counts.json`, `stats.json`, `styles.json`), also ignored by git. Delete them to reset the model.
- The study data of each participant are kept under their `pid`. Use a separate `pid` such as `PT01` for testing.

## Credits

- Bot icon by [Icons8](https://icons8.com).
