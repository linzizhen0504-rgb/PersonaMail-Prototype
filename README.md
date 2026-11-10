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
| The prompt templates in `public/data/Prompts/` and the Express backend `src/pages/serverGM.js` | Kept, with new prompts (version values, factor selection, consistency check) and new or changed endpoints (`/select-factors`, `/intent-consistency-check`, `/intent-regenerate-values`). |

### What we do not use

- **Persona-Situation Anchors** (Section 4.3.1), including the anchor-adaptation agent and the anchor image generation. We replaced them with the factor options chosen by the model, described below.
- **The Doubao API.** It was only used to generate anchor images, so it is no longer needed. You do not need a Doubao key, and `serverDB.js` does not need to run.

## What We Redesigned

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

The app has one interface. Each intent is a pill; clicking a pill shows up to three cards, with the sentences that differ from the current text in green. **Use** applies a card; **Regenerate** asks for new versions. Add `?pid=P01` to the URL to identify the participant in the logs. Participants never see anything about the preference model.

### Version Cards behaviour

- The current value is always excluded. Up to three of the remaining values are shown; their order comes from the preference model (see below) and falls back to random if the model service is down.
- Each card shows the new text of the unit as plain text. Sentences that are not in the current text are marked in green.
- Each display ends exactly once: **Use**, **Regenerate**, or leaving (selecting another unit or intent, regenerating the components, New Task). Each ending writes one log line and sends one update to the model.
- **Regenerate** (the one in the version area) asks the model service whether the shown values were rejected often enough to be replaced. If so, it generates three new intent values (`/intent-regenerate-values`); otherwise it generates new versions for the same values. The Regenerate button of the component list is a different button: it rebuilds the components and counts as leaving.
- **Intent propagation.** Several units can share one intent. After **Use**, the other units that share it are checked against the new value (`POST /intent-consistency-check`, prompt `19intent_consistency_check.prompt.md`): the model reads their texts and says, with a one-sentence reason, which ones no longer agree with it. If none does, nothing is shown (the notice says they already fit). Otherwise the window "Apply this change to other parts?" lists only the ones that do not fit, with the reason; their rewrites for the new value are made in parallel and shown as they arrive, with the changed sentences in green. The user ticks the ones that should follow and clicks **Apply selected** (Cmd/Ctrl+Z takes them back), or clicks **Skip**; nothing is written before that, and a unit that is skipped keeps its text and its intent value. If the check itself fails, every unit that shares the intent is offered. A rewrite is rejected if it contains other units' text, is far longer than the original, or creates repeated sentences; it is retried once and then skipped.
- **Version filtering.** Versions that would duplicate or swallow other parts of the email are dropped before display. If none survive after a retry, the user sees "Couldn't generate versions. Try again."
- **Label check.** The rewriter prompt receives the real intent values, and the reply must match them one to one, with up to three retries. Otherwise the request fails instead of showing a mislabeled card.
- Highlighting marks the selected unit in the editor with a background colour only. A unit is located in the email by its text; if it cannot be found exactly, a looser search inside a single paragraph is used. Before the components are made, the draft file is updated with what is in the editor, so hand edits do not break this.

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

The style representation uses only the MiniLM model already used by the service: the rewritten text minus the current text, plus the words of the value.

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

- Options: `factors_auto_selected` (the factors and values the model chose), `factors_auto_select_failed`.
- Versions: `cards_shown` (context, ordering, `mmr_used`, trigger, `style_strength`, filtered candidates), `pick`, `regenerate`, `leave`, `edit_done` (text edited after Use, for analysis only), `values_regenerated`, `versions_regenerated`, `regenerate_failed`, `model_unavailable`, `consistency_checked` (the units checked and the ones that did not fit, `check_failed`), `propagation_prompted` (the window opened; the units listed), `intent_propagated` (after the user answered: `accepted_units`, `skipped_units`, failed units and their reasons).
- Editor: `unit_click_select` (a unit was selected by clicking it), `selection_rewrite_requested`, `selection_rewrite_applied`, `selection_rewrite_discarded`, `selection_rewrite_undone`, `selection_rewrite_redone` (the Describe changes box; `trigger` is `click` or `selection`), `copy_section` (subject or body copied), `placeholders_applied` (the labels of the filled fields and of the ones that were not used; the typed values are not logged), `placeholder_deleted` (the label of a placeholder removed from the email with its trash icon).

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
node src/pages/serverGM.js
```

```bash
# Terminal 3: preference model service, port 3003
cd model_service && source .venv/bin/activate
uvicorn app:app --port 3003
```

Restart the backend after changing `serverGM.js` or `.env`.

When all three are running, open **http://localhost:3000/?pid=P01** in the browser.

### 5. Test the model service

```bash
cd model_service && source .venv/bin/activate
pytest            # fast tests with a fake embedder
pytest -m slow    # also loads the real MiniLM model
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
