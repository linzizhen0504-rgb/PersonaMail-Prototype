import json

import build_priors


def log_line(**fields):
    base = {"timestamp": "t", "pid": "P01", "cond": "cards", "unit_id": "u1", "unit_title": "Statement of Purpose",
            "intent_dimension": "Reason", "shown_values": None, "positions": None, "chosen_value": None,
            "edit_distance": None, "duration_ms": None}
    base.update(fields)
    return json.dumps(base)


def write_log(folder, pid, lines):
    (folder / f"{pid}.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")


SHOWN = ["Technical difficulties", "Personal emergency", "Scheduled appointment"]


def counts_of(records):
    return {r["value"].lower().rstrip("."): r["counts"] for r in records}


def run(tmp_path, embedder, pids=("P01",)):
    messages = []
    out = tmp_path / "priors.json"
    records = build_priors.build(tmp_path, list(pids), embedder, out, log=messages.append)
    return records, messages, out


def test_builds_binary_counts_from_stage_one_log(tmp_path, embedder):
    write_log(tmp_path, "P01", [
        log_line(event="cards_shown", shown_values=SHOWN),
        log_line(event="pick", shown_values=SHOWN, chosen_value="Technical difficulties"),
        log_line(event="cards_shown", shown_values=SHOWN),
        log_line(event="regenerate", shown_values=SHOWN),
        log_line(event="cards_shown", shown_values=SHOWN),
        log_line(event="leave", shown_values=SHOWN),
        log_line(event="edit_done", shown_values=SHOWN, chosen_value="Technical difficulties"),
        log_line(event="pick", cond="baseline", shown_values=SHOWN, chosen_value="Personal emergency"),
    ])
    records, messages, out = run(tmp_path, embedder)
    assert counts_of(records) == {"technical difficulties": [1, 2], "personal emergency": [0, 3],
                                  "scheduled appointment": [0, 3]}
    assert all(r["context"] == "unknown" and "pid" not in r and len(r["embedding"]) == 64 for r in records)
    assert any("no 'ordering' field" in m for m in messages)
    assert json.loads(out.read_text())["records"] == records


def test_legacy_reject_all_counts_as_regenerate_and_edit_as_pick(tmp_path, embedder):
    write_log(tmp_path, "P01", [
        log_line(event="reject_all", shown_values=SHOWN),
        log_line(event="edit", shown_values=SHOWN, chosen_value="Personal emergency"),
    ])
    records, _, _ = run(tmp_path, embedder)
    assert counts_of(records) == {"technical difficulties": [0, 2], "personal emergency": [1, 1],
                                  "scheduled appointment": [0, 2]}


def test_exact_matches_merge_across_participants(tmp_path, embedder):
    write_log(tmp_path, "P01", [log_line(event="pick", shown_values=["Technical difficulties", "B"],
                                         chosen_value="Technical difficulties")])
    write_log(tmp_path, "P02", [log_line(pid="P02", event="pick", shown_values=["technical difficulties.", "B"],
                                         chosen_value="technical difficulties.")])
    records, _, _ = run(tmp_path, embedder, pids=("P01", "P02"))
    assert counts_of(records) == {"technical difficulties": [2, 0], "b": [0, 2]}


def display(ordering, unit="u1", chosen=None, ending="pick", shown=("A", "B")):
    shown = list(shown)
    return [log_line(event="cards_shown", unit_id=unit, shown_values=shown, ordering=ordering, trigger="intent_click"),
            log_line(event=ending, unit_id=unit, shown_values=shown, chosen_value=chosen)]


def test_ordering_comes_from_the_preceding_cards_shown(tmp_path, embedder):
    # "random" and "fallback_random" both count as random order; "ranked" is excluded.
    # Ending events carry no ordering themselves, so it is looked up from the display they close.
    write_log(tmp_path, "P01",
              display("random", unit="u1", chosen="A")
              + display("fallback_random", unit="u2", chosen="B")
              + display("ranked", unit="u3", chosen="A")
              + display("ranked", unit="u4", ending="leave"))
    records, messages, _ = run(tmp_path, embedder)
    assert counts_of(records) == {"a": [1, 1], "b": [1, 1]}     # only the u1 and u2 displays
    assert not any("no 'ordering' field" in m for m in messages)


def test_legacy_pick_then_edit_pair_counts_as_one_pick(tmp_path, embedder):
    write_log(tmp_path, "P01", [
        # old logs: Use and edit wrote a pick and then an edit for the same display
        log_line(event="pick", shown_values=SHOWN, chosen_value="Technical difficulties"),
        log_line(event="edit", shown_values=SHOWN, chosen_value="Technical difficulties"),
        log_line(event="edit_done", shown_values=SHOWN, chosen_value="Technical difficulties", edit_distance=4),
        # a plain pick followed by something else is not merged
        log_line(event="pick", shown_values=SHOWN, chosen_value="Personal emergency"),
        log_line(event="cards_shown", shown_values=SHOWN),
        # a pick followed by an edit of a different value is not merged either
        log_line(event="pick", shown_values=SHOWN, chosen_value="Personal emergency"),
        log_line(event="edit", shown_values=SHOWN, chosen_value="Scheduled appointment"),
    ])
    records, messages, _ = run(tmp_path, embedder)
    # display 1: one pick (merged); display 2: pick Personal; display 3: pick Personal; display 4: edit==pick Scheduled
    assert counts_of(records) == {"technical difficulties": [1, 3],
                                  "personal emergency": [2, 2],
                                  "scheduled appointment": [1, 3]}
    assert any(m.startswith("merged 1 pick+edit pair") for m in messages)
