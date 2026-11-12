"""The style profile of one email: what the user changed with each operation, added up, with the evidence for every statement.
Plain data and rules (no model, no files): the model service feeds it and stores it."""
import math

MIN_EVIDENCE = 2          # a statement about the user needs at least this many changes behind it
MAX_OPS = 8               # operations kept for display
MAX_VALUES = 5            # liked / disliked values listed
MAX_EVIDENCE = 12
LENGTH_STEP = 0.05        # a change of 5% in length counts as shorter / longer
LENGTH_TRAIT = 0.10       # the average has to be at least 10% for "shorter" / "longer"
SHARE_TRAIT = 0.5         # "often adds / removes": at least half of the changes
SHARE_REWORD = 0.6        # "mostly rewords": at least 60% of the changes


class Profile:
    def __init__(self):
        self.ops = []                   # newest last
        self.liked = {}                 # (dimension, value) -> weight
        self.disliked = {}
        self.changes = 0
        self.rejections = 0
        self.sum_log = 0.0
        self.evidence = {"shorter": [], "longer": [], "adds": [], "removes": [], "rewords": []}

    # ----- feeding -----
    def record_change(self, kind, dimension, value, before, after, analysis):
        """A text was changed by the user: a used card (pick), an AI rewrite (ai_edit) or a hand edit after a card (manual_edit)."""
        added = list((analysis or {}).get("added") or [])
        removed = list((analysis or {}).get("removed") or [])
        reworded = int((analysis or {}).get("reworded") or 0)
        log_ratio = math.log(max(1, len(after or "")) / max(1, len(before or "")))
        self.changes += 1
        self.sum_log += log_ratio
        label = value or dimension
        if log_ratio <= -LENGTH_STEP:
            self._note("shorter", label)
        elif log_ratio >= LENGTH_STEP:
            self._note("longer", label)
        if added:
            self._note("adds", label)
        if removed:
            self._note("removes", label)
        if not added and not removed and reworded > 0:
            self._note("rewords", label)
        self.ops.append({
            "kind": kind, "dimension": dimension, "value": value,
            "added": len(added), "removed": len(removed), "reworded": reworded,
            "length_change_pct": round((math.exp(log_ratio) - 1) * 100),
        })
        self.ops = self.ops[-MAX_OPS:]
        if kind in ("pick", "ai_edit") and value:
            self.liked[(dimension, value)] = self.liked.get((dimension, value), 0.0) + 1.0

    def record_rejection(self, dimension, values, weight):
        """Cards that were shown and not taken (regenerated, left, or shown next to the one that was taken)."""
        self.rejections += 1
        for value in values:
            self.disliked[(dimension, value)] = self.disliked.get((dimension, value), 0.0) + abs(weight)

    def _note(self, kind, label):
        self.evidence[kind] = (self.evidence[kind] + [label])[-MAX_EVIDENCE:]

    # ----- reading -----
    def _traits(self):
        n = self.changes
        if n < MIN_EVIDENCE:
            return []
        mean_log = self.sum_log / n
        pct = round((math.exp(mean_log) - 1) * 100)
        traits = []
        shorter, longer = self.evidence["shorter"], self.evidence["longer"]
        if len(shorter) >= MIN_EVIDENCE and len(shorter) / n >= SHARE_TRAIT and mean_log <= -LENGTH_TRAIT:
            traits.append({"kind": "shorter", "text": f"Tends to make texts shorter (about {abs(pct)}% on average)", "evidence": shorter})
        if len(longer) >= MIN_EVIDENCE and len(longer) / n >= SHARE_TRAIT and mean_log >= LENGTH_TRAIT:
            traits.append({"kind": "longer", "text": f"Tends to make texts longer (about {pct}% on average)", "evidence": longer})
        for kind, text in (("adds", "Often adds new sentences"), ("removes", "Often removes sentences")):
            marked = self.evidence[kind]
            if len(marked) >= MIN_EVIDENCE and len(marked) / n >= SHARE_TRAIT:
                traits.append({"kind": kind, "text": f"{text} ({len(marked)} of {n} changes)", "evidence": marked})
        rewords = self.evidence["rewords"]
        if len(rewords) >= MIN_EVIDENCE and len(rewords) / n >= SHARE_REWORD:
            traits.append({"kind": "rewords", "text": f"Mostly changes the wording only ({len(rewords)} of {n} changes)", "evidence": rewords})
        return traits

    @staticmethod
    def _listed(weights):
        ranked = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:MAX_VALUES]
        return [{"dimension": dimension, "value": value, "weight": round(weight, 4)} for (dimension, value), weight in ranked]

    def summary(self, strength):
        n = self.changes
        return {
            "ops_count": self.changes + self.rejections,
            "strength": round(float(strength), 4),
            "liked": self._listed(self.liked),
            "disliked": self._listed(self.disliked),
            "stats": {
                "changes": n,
                "mean_length_change_pct": round((math.exp(self.sum_log / n) - 1) * 100) if n else 0,
                "with_added": len(self.evidence["adds"]),
                "with_removed": len(self.evidence["removes"]),
                "only_reworded": len(self.evidence["rewords"]),
            },
            "traits": self._traits(),
            "recent": list(reversed(self.ops)),
        }

    # ----- saving -----
    def to_dict(self):
        return {
            "ops": self.ops, "changes": self.changes, "rejections": self.rejections, "sum_log": self.sum_log, "evidence": self.evidence,
            "liked": [{"dimension": d, "value": v, "weight": w} for (d, v), w in self.liked.items()],
            "disliked": [{"dimension": d, "value": v, "weight": w} for (d, v), w in self.disliked.items()],
        }

    @classmethod
    def from_dict(cls, data):
        profile = cls()
        profile.ops = list(data.get("ops", []))
        profile.changes = int(data.get("changes", 0))
        profile.rejections = int(data.get("rejections", 0))
        profile.sum_log = float(data.get("sum_log", 0.0))
        profile.evidence.update({k: list(v) for k, v in (data.get("evidence") or {}).items() if k in profile.evidence})
        profile.liked = {(i["dimension"], i["value"]): i["weight"] for i in data.get("liked", [])}
        profile.disliked = {(i["dimension"], i["value"]): i["weight"] for i in data.get("disliked", [])}
        return profile
