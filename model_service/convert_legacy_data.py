"""Convert counts.json / priors.json written with three outcomes [pick, edit, reject]
to the binary [accept, reject] format (accept = pick + edit, reject unchanged).

    python convert_legacy_data.py [--data data]

A .bak copy of each converted file is written first. Files that are already binary are left alone.
"""
import argparse
import shutil
import sys
from pathlib import Path

import config
from store import convert_legacy_record, read_json, write_json_atomic


def is_legacy(records):
    return any(len(r.get("counts", [])) == 3 or len(r.get("prior", [])) == 3 for r in records)


def convert_file(path, log=print):
    path = Path(path)
    if not path.exists():
        log(f"{path.name}: not found, skipped")
        return 0
    data = read_json(path, {})
    records = data.get("records", [])
    if not is_legacy(records):
        log(f"{path.name}: already binary, left unchanged")
        return 0
    shutil.copyfile(path, str(path) + ".bak")
    converted = sum(1 for r in records if len(r.get("counts", [])) == 3 or len(r.get("prior", [])) == 3)
    data["records"] = [convert_legacy_record(r) for r in records]
    write_json_atomic(path, data)
    log(f"{path.name}: converted {converted} record(s) (backup: {path.name}.bak)")
    return converted


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default=str(config.DATA_DIR))
    args = parser.parse_args(argv)
    for name in ("counts.json", "priors.json"):
        convert_file(Path(args.data) / name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
