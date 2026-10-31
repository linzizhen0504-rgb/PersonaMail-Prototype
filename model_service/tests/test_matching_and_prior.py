import numpy as np

from conftest import unit_with_cosine
from model import PreferenceModel, normalize, text_for


def update(model, value, event="pick", shown=None, context="c1", dim="Reason", pid="P01"):
    return model.update(pid, context, dim, event, value, shown or [value])


def test_normalize_strips_case_space_and_punctuation():
    assert normalize("  Technical difficulties. ") == normalize("technical difficulties")


def test_exact_match_ignores_case_and_trailing_punctuation(client, model):
    update(model, "Technical difficulties")
    update(model, "technical difficulties.")
    records = model.store.load_counts()["records"]
    assert len(records) == 1
    assert records[0]["counts"] == [2, 0]
    result = client.post("/rank", json={"pid": "P01", "context": "c1", "intent_dimension": "Reason",
                                        "candidates": [{"value": "technical difficulties.", "text": "x"}]}).json()
    assert result["lookups"]["technical difficulties."] == {"type": "exact"}


def seed_priors(model, embedder, entries, context="c1"):
    """entries: (value, counts, similarity to the query value)."""
    base = embedder.embed(text_for("Reason", "Query value"))
    records = []
    for i, (value, counts, similarity) in enumerate(entries):
        vector = unit_with_cosine(base, similarity, axis=1 + i)
        embedder.set(text_for("Reason", value), vector)
        records.append({"context": context, "intent_dimension": "Reason", "value": value,
                        "embedding": vector.tolist(), "counts": counts})
    model.store.save_priors(records)


def test_prior_is_similarity_weighted_sum(model, embedder):
    seed_priors(model, embedder, [("Near", [2, 1], 0.9), ("Far", [5, 5], 0.5)])
    prior, refs = model.compute_prior(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert np.allclose(prior, [1 + 0.9 * 2, 1 + 0.9 * 1], atol=1e-3)
    assert [r["value"] for r in refs] == ["Near"]            # below 0.75 is ignored
    assert refs[0]["similarity"] == 0.9


def test_prior_strength_is_capped_at_ten(model, embedder):
    seed_priors(model, embedder, [("Big", [30, 10], 0.9)])
    prior, _ = model.compute_prior(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert abs(sum(prior) - 10) < 1e-6
    raw = np.array([1 + 0.9 * 30, 1 + 0.9 * 10])
    assert np.allclose(prior, raw * 10 / raw.sum(), atol=1e-3)   # scaled proportionally


def test_prior_is_flat_without_similar_records(model, embedder):
    seed_priors(model, embedder, [("Unrelated", [9, 9], 0.2)])
    prior, refs = model.compute_prior(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert prior == [1.0, 1.0] and refs == []


def test_at_most_five_similar_records_are_used(model, embedder):
    seed_priors(model, embedder, [(f"V{i}", [1, 0], 0.95 - 0.01 * i) for i in range(7)])
    _, refs = model.compute_prior(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert len(refs) == 5
    assert [r["value"] for r in refs] == ["V0", "V1", "V2", "V3", "V4"]


def test_prior_also_uses_the_participants_own_similar_counts(model, embedder):
    base = embedder.embed(text_for("Reason", "Query value"))
    own = unit_with_cosine(base, 0.9, axis=3)
    embedder.set(text_for("Reason", "Own neighbour"), own)
    update(model, "Own neighbour")
    prior, refs = model.compute_prior(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert np.allclose(prior, [1 + 0.9, 1], atol=1e-3)
    assert refs[0]["source"] == "counts"
    # another participant's counts are not used
    other, _ = model.compute_prior(model.store.load_counts(), "P02", "c1", "Reason", "Query value")
    assert other == [1.0, 1.0]


def test_unknown_context_priors_serve_any_context(model, embedder):
    seed_priors(model, embedder, [("Pilot value", [3, 0], 0.9)], context="unknown")
    prior, refs = model.compute_prior(model.store.load_counts(), "P01", "some other context", "Reason", "Query value")
    assert refs and np.allclose(prior, [1 + 0.9 * 3, 1], atol=1e-3)


def test_priors_from_another_known_context_are_not_used(model, embedder):
    seed_priors(model, embedder, [("Other ctx", [3, 0], 0.9)], context="c2")
    prior, refs = model.compute_prior(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert prior == [1.0, 1.0] and refs == []


def test_stored_prior_is_frozen_after_creation(model, embedder):
    seed_priors(model, embedder, [("Near", [2, 0], 0.9)])
    update(model, "Query value")
    stored = model.store.load_counts()["records"][0]["prior"]
    assert np.allclose(stored, [1 + 0.9 * 2, 1], atol=1e-3)

    priors = model.store.load_priors()
    priors[0]["counts"] = [20, 20]                       # similar record changes later
    model.store.save_priors(priors)
    update(model, "Query value")

    record = model.store.load_counts()["records"][0]
    assert record["prior"] == stored                          # unchanged
    params, lookup = model.params_for(model.store.load_counts(), "P01", "c1", "Reason", "Query value")
    assert np.allclose(params, np.array(stored) + np.array(record["counts"]))
    assert lookup == {"type": "exact"}


def test_rank_reports_exact_similar_and_none(client, model, embedder):
    seed_priors(model, embedder, [("Near", [2, 0], 0.9)])
    update(model, "Known")
    body = {"pid": "P01", "context": "c1", "intent_dimension": "Reason", "k": 5,
            "candidates": [{"value": "Known", "text": "a"}, {"value": "Query value", "text": "b"},
                           {"value": "Something else entirely", "text": "c"}]}
    lookups = client.post("/rank", json=body).json()["lookups"]
    assert lookups["Known"]["type"] == "exact"
    assert lookups["Query value"]["type"] == "similar"
    assert lookups["Something else entirely"]["type"] == "none"
    stats = client.get("/stats", params={"pid": "P01"}).json()
    assert stats["rank_calls"] == 1 and stats["n_records"] == 1
    assert abs(stats["exact_ratio"] + stats["similar_ratio"] + stats["none_ratio"] - 1) < 1e-9
