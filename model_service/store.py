"""JSON persistence. Files are written to a temporary file in the same folder and then swapped in."""
import json
import os
import tempfile
import threading
from pathlib import Path


def write_json_atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def convert_legacy_record(record):
    """Old records had three outcomes [pick, edit, reject]; now they are [accept, reject].
    counts: accept = pick + edit. A stored prior drops the old extra base 1 so a flat [1,1,1] becomes [1,1]."""
    if len(record.get("counts", [])) == 3:
        pick, edit, reject = record["counts"]
        record["counts"] = [pick + edit, reject]
    if len(record.get("prior", [])) == 3:
        pick, edit, reject = record["prior"]
        record["prior"] = [max(pick + edit - 1, 0.01), reject]
    return record


def read_json(path, default):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


class Store:
    """counts.json: {"records": [...], "shows": [...]}; each record has counts [accept, reject]; priors.json: {"records": [...]}; stats.json: {pid: {...}}."""

    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.lock = threading.RLock()
        self.counts_path = self.data_dir / "counts.json"
        self.priors_path = self.data_dir / "priors.json"
        self.stats_path = self.data_dir / "stats.json"

    def load_counts(self):
        data = read_json(self.counts_path, {})
        data.setdefault("records", [])
        data.setdefault("shows", [])
        data["records"] = [convert_legacy_record(r) for r in data["records"]]
        return data

    def save_counts(self, data):
        write_json_atomic(self.counts_path, data)

    def load_priors(self):
        records = read_json(self.priors_path, {"records": []}).get("records", [])
        return [convert_legacy_record(r) for r in records]

    def save_priors(self, records):
        write_json_atomic(self.priors_path, {"records": records})

    def load_stats(self):
        return read_json(self.stats_path, {})

    def save_stats(self, data):
        write_json_atomic(self.stats_path, data)
