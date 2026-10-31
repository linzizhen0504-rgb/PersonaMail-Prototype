"""Build data/priors.json from the stage-1 experiment logs.

    python build_priors.py --pids P01 P02 [--logs ../src/data/logs] [--out data/priors.json]
"""
import argparse
import json
import sys
from pathlib import Path

import config
from model import event_increments, normalize, text_for
from store import write_json_atomic


def read_events(path):
    events = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def merge_pick_edit_pairs(events):
    """Older logs wrote a pick immediately followed by an edit for one 'Use and edit' display.
    Treat such a pair as a single edit. Returns (events, merged_pair_count)."""
    kept, merged, i = [], 0, 0
    while i < len(events):
        event = events[i]
        nxt = events[i + 1] if i + 1 < len(events) else None
        if (event.get("event") == "pick" and nxt is not None and nxt.get("event") == "edit"
                and event.get("unit_id") == nxt.get("unit_id")
                and event.get("intent_dimension") == nxt.get("intent_dimension")
                and event.get("chosen_value") == nxt.get("chosen_value")):
            merged += 1
            i += 1  # drop the pick, the edit that follows is counted
            continue
        kept.append(event)
        i += 1
    return kept, merged


def build(logs_dir, pids, embedder, out_path, log=print):
    selected, merged_total = [], 0
    for pid in pids:
        path = Path(logs_dir) / f"{pid}.jsonl"
        if not path.exists():
            log(f"warning: no log file for {pid} at {path}")
            continue
        events, merged = merge_pick_edit_pairs(read_events(path))
        merged_total += merged
        selected.extend(e for e in events if e.get("cond") == "cards")

    if any("ordering" in e for e in selected):
        selected = [e for e in selected if e.get("ordering") == "random"]
    else:
        log("notice: the logs have no 'ordering' field yet, using all cards records")
    log(f"merged {merged_total} pick+edit pair(s) into single edit events")

    records = {}
    for event in selected:
        context = event.get("context") or config.UNKNOWN_CONTEXT
        dimension = event.get("intent_dimension")
        for value, index in event_increments(event.get("event"), event.get("chosen_value"), event.get("shown_values")):
            key = (context, normalize(dimension), normalize(value))
            record = records.setdefault(key, {
                "context": context, "intent_dimension": dimension, "value": value, "counts": [0, 0, 0]})
            record["counts"][index] += 1

    output = []
    for record in records.values():
        record["embedding"] = [float(x) for x in embedder.embed(text_for(record["intent_dimension"], record["value"]))]
        output.append(record)
        log(f"{record['context']} | {record['intent_dimension']}: {record['value']} -> "
            f"[pick, edit, reject] = {record['counts']}")
    write_json_atomic(out_path, {"records": output})
    log(f"wrote {len(output)} record(s) to {out_path}")
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--logs", default=str(config.DEFAULT_LOGS_DIR), help="folder with {pid}.jsonl logs")
    parser.add_argument("--pids", nargs="+", required=True, help="participants to include")
    parser.add_argument("--out", default=str(config.DATA_DIR / "priors.json"))
    args = parser.parse_args(argv)
    from embedding import Embedder
    build(args.logs, args.pids, Embedder(), args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
