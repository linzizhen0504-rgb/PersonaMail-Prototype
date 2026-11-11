# End-to-end tests

Real browser (Chrome through Playwright) against the running app, with the real model. They are slow (about 20 to 30 minutes for all
of them) and are the safety net for the whole journey; the fast tests are `npm run test:server`, `npm test` and `pytest` in `model_service`.

## Before running
1. Start the three services as in the project README: backend (`node src/pages/serverGM.js`, port 3001), front end (`npm start`, port 3000),
   preference model (`uvicorn app:app --port 3003` in `model_service`).
2. Install Playwright for Python in a folder of your choice and point `PYTHONPATH` at it, e.g.
   `python3 -m pip install --target ~/pw/lib/python3.11/site-packages playwright` and `export PYTHONPATH=~/pw/lib/python3.11/site-packages`.
   The scripts use the installed Google Chrome (`channel='chrome'`).
3. Optional: `BASE_URL` (default `http://localhost:3000`) and `PROJECT_ROOT` (default: this repository).

## Running
```
cd tests/e2e
./run_all.sh                       # everything, one result line per script
python3 journey.py "?pid=zz_e2e" after   # one script (the full user journey, 44 checks)
```
| Script | What it checks |
|---|---|
| `journey.py` | the whole journey: request, automatic factors, email with components, version cards, propagation window, selection rewrite and undo, placeholders table |
| `selection_rewrite.py` | clicking a unit, "Describe changes", accept / discard, undo and redo (17 checks) |
| `placeholders_live.py`, `placeholders_live2.py` | typing in the table fills the email live (18 + 8 checks) |
| `placeholders_delete.py`, `placeholders_table.py`, `placeholders_examples.py`, `placeholders_tab.py`, `placeholders_ampersand.py` | delete icon, layout, "e.g." brackets, Tab between boxes, `A & B` brackets |
| `propagation_window.py`, `propagation_multi_paragraph.py` | the window that asks before a change reaches other parts (real model and stubbed answers) |
| `window_centered.py` | that window stays centred |

The scripts use throw-away users and pids that start with `zz` (`ZZ...` sessions, `zz_*.jsonl` logs). After a run delete them:
`rm -rf src/data/SessionData/ZZ* src/data/logs/zz_*.jsonl`. Never run them with the name of a real participant.
