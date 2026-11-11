#!/bin/sh
# Runs every end-to-end script one after another and prints its result line. Needs the app running (see README.md).
# Usage: PYTHONPATH=<folder with playwright> ./run_all.sh
cd "$(dirname "$0")" || exit 1
for script in "journey.py ?pid=zz_e2e after" selection_rewrite.py placeholders_live.py placeholders_live2.py placeholders_delete.py \
              placeholders_table.py placeholders_examples.py propagation_window.py propagation_multi_paragraph.py \
              placeholders_tab.py placeholders_ampersand.py window_centered.py; do
    echo "== $script"
    python3 $script 2>&1 | grep -E "^FAIL|^RESULT|^[0-9]+ / [0-9]+|Traceback|Error|centre offset" | cut -c1-220 | head -8
done
