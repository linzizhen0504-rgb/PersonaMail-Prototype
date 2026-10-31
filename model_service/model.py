"""Preference model: a Beta-Bernoulli bandit per intent value (counts = [accept, reject]), with an
empirical-Bayes prior borrowed from semantically similar values, MMR diversification and
randomised ordering."""
import re

import numpy as np

import config
from embedding import cosine

ACCEPT, REJECT = 0, 1

# Older logs used 'edit' for a use followed by editing and 'reject_all' for regenerating
LEGACY_EVENTS = {"edit": "pick", "reject_all": "regenerate"}
CHOSEN_EVENTS = {"pick"}
UNCHOSEN_EVENTS = {"regenerate", "leave"}


def normalize(text):
    """Lowercase, collapse spaces and strip leading/trailing whitespace and punctuation."""
    text = re.sub(r"\s+", " ", str(text or "").lower()).strip()
    return re.sub(r"^[\W_]+|[\W_]+$", "", text)


def text_for(dimension, value):
    return f"{dimension}: {value}"


def canonical_event(event):
    return LEGACY_EVENTS.get(event, event)


def event_increments(event, chosen_value, shown_values):
    """The count rules shared by /update and build_priors.py:
    [(value, index into [accept, reject])]. pick: the chosen value is accepted and every other
    shown value rejected; regenerate / leave: every shown value is rejected."""
    event = canonical_event(event)
    shown = list(shown_values or [])
    if event == "pick":
        if not chosen_value:
            return []
        chosen_key = normalize(chosen_value)
        others = [v for v in shown if normalize(v) != chosen_key]
        return [(chosen_value, ACCEPT)] + [(v, REJECT) for v in others]
    if event in UNCHOSEN_EVENTS:
        return [(v, REJECT) for v in shown]
    return []


class PreferenceModel:
    def __init__(self, store, embedder, rng=None, **overrides):
        self.store = store
        self.embedder = embedder
        self.rng = rng if rng is not None else np.random.default_rng()
        self.cfg = {
            "sim_threshold": config.SIM_THRESHOLD,
            "max_refs": config.MAX_REFS,
            "prior_cap": config.PRIOR_STRENGTH_CAP,
            "mmr_lambda": config.MMR_LAMBDA,
            "random_order_prob": config.RANDOM_ORDER_PROB,
            "reject_threshold": config.REJECT_THRESHOLD,
            "dimension_sim_threshold": config.DIMENSION_SIM_THRESHOLD,
            "default_k": config.DEFAULT_K,
        }
        self.cfg.update(overrides)

    # ----- lookup -----
    @staticmethod
    def _key(pid, context, dimension, value):
        return (pid, context, normalize(dimension), normalize(value))

    def _find_exact(self, counts, pid, context, dimension, value):
        key = self._key(pid, context, dimension, value)
        for record in counts["records"]:
            if self._key(record["pid"], record["context"], record["intent_dimension"], record["value"]) == key:
                return record
        return None

    @staticmethod
    def _context_matches(record_context, query_context, source):
        # Pilot priors without a context ("unknown") can serve any context
        if source == "priors" and record_context == config.UNKNOWN_CONTEXT:
            return True
        return record_context == query_context

    def compute_prior(self, counts, pid, context, dimension, value):
        """Prior parameters for a value that has no record yet, plus the similar records used."""
        embedding = self.embedder.embed(text_for(dimension, value))
        own_key = normalize(dimension), normalize(value)
        candidates = []
        for source, records in (("priors", self.store.load_priors()),
                                ("counts", [r for r in counts["records"] if r["pid"] == pid])):
            for record in records:
                if not self._context_matches(record["context"], context, source):
                    continue
                if source == "counts" and (normalize(record["intent_dimension"]), normalize(record["value"])) == own_key:
                    continue
                similarity = cosine(embedding, record["embedding"])
                if similarity >= self.cfg["sim_threshold"]:
                    candidates.append((similarity, source, record))
        candidates.sort(key=lambda item: item[0], reverse=True)
        candidates = candidates[: self.cfg["max_refs"]]

        prior = np.ones(2)
        for similarity, _, record in candidates:
            prior = prior + similarity * np.asarray(record["counts"], dtype=float)
        total = prior.sum()
        if total > self.cfg["prior_cap"]:
            prior = prior * (self.cfg["prior_cap"] / total)
        refs = [{"value": record["value"], "intent_dimension": record["intent_dimension"],
                 "source": source, "similarity": round(similarity, 4)}
                for similarity, source, record in candidates]
        return prior.tolist(), refs

    def params_for(self, counts, pid, context, dimension, value):
        """Actual Dirichlet parameters = prior + own counts, and what the lookup found."""
        record = self._find_exact(counts, pid, context, dimension, value)
        if record is not None:
            params = np.asarray(record["prior"], dtype=float) + np.asarray(record["counts"], dtype=float)
            return params, {"type": "exact"}
        prior, refs = self.compute_prior(counts, pid, context, dimension, value)
        lookup = {"type": "similar", "refs": refs} if refs else {"type": "none"}
        return np.asarray(prior, dtype=float), lookup

    # ----- ranking -----
    def sample_scores(self, params_list):
        scores = []
        for params in params_list:
            scores.append(float(self.rng.beta(params[ACCEPT], params[REJECT])))
        return scores

    def mmr_select(self, scores, embeddings, k):
        lam = self.cfg["mmr_lambda"]
        selected, remaining = [], list(range(len(scores)))
        while remaining and len(selected) < k:
            best, best_value = None, None
            for i in remaining:
                diversity = max((cosine(embeddings[i], embeddings[j]) for j in selected), default=0.0)
                value = lam * scores[i] - (1 - lam) * diversity
                if best_value is None or value > best_value:
                    best, best_value = i, value
            selected.append(best)
            remaining.remove(best)
        return selected

    def rank(self, pid, context, dimension, candidates, k=None):
        k = k or self.cfg["default_k"]
        with self.store.lock:
            counts = self.store.load_counts()
            params_list, lookups = [], []
            for candidate in candidates:
                params, lookup = self.params_for(counts, pid, context, dimension, candidate["value"])
                params_list.append(params)
                lookups.append(lookup)
            scores = self.sample_scores(params_list)

            mmr_used = len(candidates) > k
            if mmr_used:
                embeddings = [self.embedder.embed(c["text"]) for c in candidates]
                chosen = self.mmr_select(scores, embeddings, k)
            else:
                chosen = list(range(len(candidates)))

            chosen.sort(key=lambda i: scores[i], reverse=True)
            ordering = "ranked"
            if self.rng.random() < self.cfg["random_order_prob"]:
                chosen = [chosen[i] for i in self.rng.permutation(len(chosen))]
                ordering = "random"

            stats = self.store.load_stats()
            entry = stats.setdefault(pid, {"rank_calls": 0, "candidates": 0, "exact": 0, "similar": 0, "none": 0})
            entry["rank_calls"] += 1
            for lookup in lookups:
                entry["candidates"] += 1
                entry[lookup["type"]] += 1
            self.store.save_stats(stats)

        values = [candidates[i]["value"] for i in chosen]
        return {
            "values": values,
            "scores": {candidates[i]["value"]: scores[i] for i in chosen},
            "lookups": {c["value"]: lookups[i] for i, c in enumerate(candidates)},
            "ordering": ordering,
            "mmr_used": mmr_used,
        }

    # ----- updates -----
    def update(self, pid, context, dimension, event, chosen_value, shown_values):
        event = canonical_event(event)
        increments = event_increments(event, chosen_value, shown_values)
        if not increments:
            return {"updated": False, "counts": {}, "tally": None}
        with self.store.lock:
            counts = self.store.load_counts()
            touched = {}
            # Find or create every record first, so priors come from data before this update
            for value, _ in increments:
                if normalize(value) in touched:
                    continue
                record = self._find_exact(counts, pid, context, dimension, value)
                if record is None:
                    prior, _ = self.compute_prior(counts, pid, context, dimension, value)
                    record = {
                        "pid": pid, "context": context, "intent_dimension": dimension, "value": value,
                        "embedding": [float(x) for x in self.embedder.embed(text_for(dimension, value))],
                        "counts": [0, 0], "prior": prior,
                    }
                    counts["records"].append(record)
                touched[normalize(value)] = record
            for value, index in increments:
                touched[normalize(value)]["counts"][index] += 1

            tally = self._find_tally(counts, pid, context, dimension)
            if tally is None:
                tally = {"pid": pid, "context": context, "intent_dimension": dimension,
                         "reject_all_shows": 0, "chosen_shows": 0}
                counts["shows"].append(tally)
            tally["chosen_shows" if event in CHOSEN_EVENTS else "reject_all_shows"] += 1
            self.store.save_counts(counts)

        return {
            "updated": True,
            "counts": {record["value"]: record["counts"] for record in touched.values()},
            "tally": {"reject_all_shows": tally["reject_all_shows"], "chosen_shows": tally["chosen_shows"]},
        }

    @staticmethod
    def _find_tally(counts, pid, context, dimension):
        for tally in counts["shows"]:
            if (tally["pid"], tally["context"], normalize(tally["intent_dimension"])) == (pid, context, normalize(dimension)):
                return tally
        return None

    def reject_check(self, pid, context, dimension):
        """Posterior mean of 'a display ends without a pick' over this and similar dimensions.
        (Tally keys keep their old names: chosen_shows = displays with a pick, reject_all_shows = without.)"""
        with self.store.lock:
            counts = self.store.load_counts()
        query = self.embedder.embed(dimension)
        reject_all = chosen = matched = 0
        for tally in counts["shows"]:
            if tally["pid"] != pid or tally["context"] != context:
                continue
            if cosine(query, self.embedder.embed(tally["intent_dimension"])) >= self.cfg["dimension_sim_threshold"]:
                reject_all += tally["reject_all_shows"]
                chosen += tally["chosen_shows"]
                matched += 1
        mean = (1 + reject_all) / (2 + reject_all + chosen)
        return {
            "reject_mean": mean,
            "exceeds": mean > self.cfg["reject_threshold"],
            "reject_all_shows": reject_all,
            "chosen_shows": chosen,
            "n_dimensions": matched,
        }

    def stats(self, pid):
        with self.store.lock:
            counts = self.store.load_counts()
            entry = self.store.load_stats().get(pid, {})
        n = entry.get("candidates", 0)
        ratio = lambda key: (entry.get(key, 0) / n) if n else 0.0  # noqa: E731
        return {
            "pid": pid,
            "n_records": sum(1 for r in counts["records"] if r["pid"] == pid),
            "rank_calls": entry.get("rank_calls", 0),
            "exact_ratio": ratio("exact"),
            "similar_ratio": ratio("similar"),
            "none_ratio": ratio("none"),
        }
