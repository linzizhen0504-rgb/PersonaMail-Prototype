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
- **Ask AI to add content.** A box under the editor takes a description of what is missing. The AI returns a revised email as a preview, which the user applies or discards.
- **Header and icons.** The navigation sidebar is replaced by a header with the logo, a New Task button and a user menu with Log out.

**Intent pipeline**

- Intent options keep their position when one is selected.
- Every component is linked to at least one intent. The original prompt deliberately avoids over-linking, which often left components with no intent to adjust.
- Model output that is not valid JSON is repaired or requested again instead of failing silently.

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/linzizhen0504-rgb/PersonaMail-Prototype.git
cd PersonaMail-Prototype
npm install
```

### 2. Add your Gemini API key

Create a file named `.env` in the project root:

```
GEMINI_API_KEY=your_gemini_api_key
```

The `.env` file is ignored by git, so your key stays on your machine.

Optional: to run on a local [Ollama](https://ollama.com) model instead of Gemini, also add `OLLAMA_MODEL=<model name>`. Leave it out to use Gemini.

### 3. Run

Open two terminals in the project root.

```bash
# Terminal 1: frontend, http://localhost:3000
npm start
```

```bash
# Terminal 2: backend, port 3001
node src/pages/serverGM.js
```

Restart the backend after changing `serverGM.js` or `.env`.

## Using the Prototype

1. Enter a username at the top right.
2. Describe the email you need and send.
3. Choose a saved template or select the factors that matter, then click **Generate Email Draft**.
4. In the editor, edit the text directly, use **Ask AI** to add content, or change the factors in the sidebar and regenerate.
5. Click **Generate Components** to split the email into components. Select a component to see its intents, choose another value to preview a rewrite, and apply it.

## Notes

- Templates are stored in the browser's local storage, per username. They are not shared between browsers or machines.
- Drafts and session data are written to `src/data/SessionData/`, and API logs to `src/pages/api_logs/`. Both stay local and are ignored by git.
- Generating components makes three model calls and can take a while, especially with a local model.

## Credits

- Bot icon by [Icons8](https://icons8.com).
