"""Preference model: a Beta-Bernoulli bandit per intent value (counts = [accept, reject]), with an
empirical-Bayes prior borrowed from semantically similar values, MMR diversification and
randomised ordering."""
import re

import numpy as np

import config
from embedding import cosine
from style import StyleState, relative_scores

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
            "style_weight": config.STYLE_WEIGHT,
            "style_value_weight": config.STYLE_VALUE_WEIGHT,
            "style_delta_scale": config.STYLE_DELTA_SCALE,
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

    # ----- style preference (per participant and email session) -----
    @staticmethod
    def _style_key(pid, session_id):
        return f"{pid}|{session_id}"

    def style_state(self, pid, session_id):
        """A copy of the style state of this email session (empty if none)."""
        with self.store.lock:
            data = self.store.load_styles().get(self._style_key(pid, session_id))
        return StyleState.from_dict(data) if data else StyleState()

    def reset_session(self, pid, session_id):
        with self.store.lock:
            styles = self.store.load_styles()
            if styles.pop(self._style_key(pid, session_id), None) is not None:
                self.store.save_styles(styles)

    def style_feature(self, value, text, current_text):
        """What a card says about style: how its text differs from the current text (content cancels out), plus the
        words of its value. Without texts only the value words are used."""
        value_part = self.cfg["style_value_weight"] * np.asarray(self.embedder.embed(value), dtype=float)
        if text and current_text:
            change = np.asarray(self.embedder.embed(text), dtype=float) - np.asarray(self.embedder.embed(current_text), dtype=float)
            change_part = change / self.cfg["style_delta_scale"]
        else:
            change_part = np.zeros_like(value_part)
        return np.concatenate([change_part, value_part])

    def _update_style(self, pid, session_id, event, chosen_value, shown_values, shown_texts, current_text):
        shown = list(shown_values or [])
        texts = list(shown_texts or [])
        chosen_key = normalize(chosen_value)
        with self.store.lock:
            styles = self.store.load_styles()
            key = self._style_key(pid, session_id)
            state = StyleState.from_dict(styles[key]) if key in styles else StyleState()
            for index, value in enumerate(shown):
                text = texts[index] if index < len(texts) else None
                if event == "pick":
                    weight = config.STYLE_PICK_WEIGHT if normalize(value) == chosen_key else config.STYLE_SIBLING_WEIGHT
                elif event == "regenerate":
                    weight = config.STYLE_REGENERATE_WEIGHT
                else:
                    weight = config.STYLE_LEAVE_WEIGHT
                state.add(self.style_feature(value, text, current_text), weight)
            styles[key] = state.to_dict()
            self.store.save_styles(styles)
        return state

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

    def rank(self, pid, context, dimension, candidates, k=None, session_id=None, current_text=None):
        k = k or self.cfg["default_k"]
        with self.store.lock:
            counts = self.store.load_counts()
            params_list, lookups = [], []
            for candidate in candidates:
                params, lookup = self.params_for(counts, pid, context, dimension, candidate["value"])
                params_list.append(params)
                lookups.append(lookup)
            scores = self.sample_scores(params_list)

            # Style term: how well each card matches what this user took / passed over so far in this email
            style_scores = {c["value"]: 0.0 for c in candidates}
            style_strength = 0.0
            if session_id:
                state = self.style_state(pid, session_id)
                style_strength = state.strength
                if style_strength > 0:
                    features = [self.style_feature(c["value"], c.get("text"), current_text) for c in candidates]
                    relative = relative_scores(features, state.p)
                    for i, c in enumerate(candidates):
                        style_scores[c["value"]] = relative[i]
                        scores[i] += self.cfg["style_weight"] * style_strength * relative[i]

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
            "style_scores": style_scores,
            "style_strength": style_strength,
        }

    # ----- updates -----
    def update(self, pid, context, dimension, event, chosen_value, shown_values=None,
               session_id=None, current_text=None, shown_texts=None):
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

        style_strength = None
        if session_id:
            style_strength = self._update_style(pid, session_id, event, chosen_value, shown_values, shown_texts, current_text).strength
        return {
            "updated": True,
            "counts": {record["value"]: record["counts"] for record in touched.values()},
            "tally": {"reject_all_shows": tally["reject_all_shows"], "chosen_shows": tally["chosen_shows"]},
            "style_strength": style_strength,
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
