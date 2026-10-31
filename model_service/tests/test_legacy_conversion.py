import json

import convert_legacy_data
from store import Store, convert_legacy_record


def legacy_record(counts, prior=None, **extra):
    record = {"context": "c1", "intent_dimension": "Reason", "value": "A", "embedding": [0.1, 0.2], "counts": counts}
    if prior is not None:
        record["prior"] = prior
    record.update(extra)
    return record


def test_counts_convert_to_accept_and_reject():
    assert convert_legacy_record(legacy_record([3, 2, 4]))["counts"] == [5, 4]   # accept = pick + edit


def test_flat_old_prior_becomes_flat_binary_prior():
    assert convert_legacy_record(legacy_record([0, 0, 0], prior=[1, 1, 1]))["prior"] == [1, 1]
    assert convert_legacy_record(legacy_record([0, 0, 0], prior=[2.8, 1.0, 1.9]))["prior"] == [2.8, 1.9]


def test_binary_records_are_left_alone():
    record = legacy_record([2, 5], prior=[1.5, 1.0])
    assert convert_legacy_record(dict(record)) == record


def test_store_converts_legacy_files_when_loading(tmp_path):
    (tmp_path / "counts.json").write_text(json.dumps({"records": [dict(legacy_record([1, 1, 2], prior=[1, 1, 1]), pid="P01")]}))
    (tmp_path / "priors.json").write_text(json.dumps({"records": [legacy_record([4, 0, 1])]}))
    store = Store(tmp_path)
    assert store.load_counts()["records"][0]["counts"] == [2, 2]
    assert store.load_counts()["records"][0]["prior"] == [1, 1]
    assert store.load_priors()[0]["counts"] == [4, 1]


def test_convert_script_rewrites_files_and_keeps_a_backup(tmp_path):
    original = {"records": [legacy_record([1, 2, 3], prior=[1, 1, 1], pid="P01")], "shows": []}
    (tmp_path / "counts.json").write_text(json.dumps(original))
    messages = []
    assert convert_legacy_data.convert_file(tmp_path / "counts.json", log=messages.append) == 1
    converted = json.loads((tmp_path / "counts.json").read_text())
    assert converted["records"][0]["counts"] == [3, 3] and converted["records"][0]["prior"] == [1, 1]
    assert converted["shows"] == []
    assert json.loads((tmp_path / "counts.json.bak").read_text()) == original
    # running it again changes nothing
    assert convert_legacy_data.convert_file(tmp_path / "counts.json", log=messages.append) == 0
    assert json.loads((tmp_path / "counts.json").read_text()) == converted
    assert convert_legacy_data.convert_file(tmp_path / "missing.json", log=messages.append) == 0
