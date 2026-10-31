import numpy as np

from conftest import unit_with_cosine


def test_mmr_never_selects_two_near_duplicates(make_model, embedder, monkeypatch):
    base = embedder.embed("dup")
    embedder.set("cand A", base)
    embedder.set("cand B", unit_with_cosine(base, 0.99))           # near duplicate of A
    embedder.set("cand C", unit_with_cosine(base, 0.1, axis=2))
    embedder.set("cand D", unit_with_cosine(base, 0.0, axis=3))
    candidates = [{"value": v, "text": f"cand {v}"} for v in "ABCD"]
    for seed in range(10):
        model = make_model()
        # the two duplicates score highest, so only the diversity term can keep them apart
        monkeypatch.setattr(model, "sample_scores", lambda params: [0.50, 0.48, 0.45, 0.10])
        result = model.rank("P01", "c1", "Reason", candidates, k=3)
        assert result["mmr_used"] is True
        assert len(result["values"]) == 3
        assert not {"A", "B"} <= set(result["values"])


def test_no_mmr_when_candidates_do_not_exceed_k(model):
    candidates = [{"value": v, "text": v} for v in "ABC"]
    result = model.rank("P01", "c1", "Reason", candidates, k=3)
    assert result["mmr_used"] is False
    assert sorted(result["values"]) == ["A", "B", "C"]
    assert result["ordering"] == "ranked"


def test_ranked_order_is_by_score_and_random_order_is_flagged(make_model, monkeypatch):
    candidates = [{"value": v, "text": v} for v in "ABC"]
    ranked = make_model()
    monkeypatch.setattr(ranked, "sample_scores", lambda params: [0.2, 0.5, 0.3])
    assert ranked.rank("P01", "c1", "Reason", candidates)["values"] == ["B", "C", "A"]
    shuffled = make_model(random_order_prob=1.0)
    result = shuffled.rank("P01", "c1", "Reason", candidates)
    assert result["ordering"] == "random" and sorted(result["values"]) == ["A", "B", "C"]


def test_learned_preference_raises_scores(make_model):
    model = make_model()
    for _ in range(40):
        model.update("P01", "c1", "Reason", "pick", "Liked", ["Liked", "Disliked"])
    wins = 0
    candidates = [{"value": "Liked", "text": "l"}, {"value": "Disliked", "text": "d"}]
    for _ in range(50):
        wins += model.rank("P01", "c1", "Reason", candidates)["values"][0] == "Liked"
    assert wins >= 45


def reject_check(client, dim="Tone", pid="P01", context="c1"):
    return client.post("/reject-check", json={"pid": pid, "context": context, "intent_dimension": dim}).json()


def update(client, event, chosen, shown, dim="Tone"):
    client.post("/update", json={"pid": "P01", "context": "c1", "intent_dimension": dim,
                                 "event": event, "chosen_value": chosen, "shown_values": shown})


def test_reject_check_mean_is_computed_over_displays(client):
    assert reject_check(client)["reject_mean"] == 0.5          # no data: (1+0)/(2+0)
    update(client, "reject_all", None, ["A", "B", "C"])
    update(client, "reject_all", None, ["A", "B", "C"])
    update(client, "pick", "A", ["A", "B", "C"])
    result = reject_check(client)
    assert result["reject_mean"] == (1 + 2) / (2 + 3)           # R=2, C=1
    assert result["exceeds"] is True and result["reject_all_shows"] == 2 and result["chosen_shows"] == 1


def test_always_picking_never_exceeds(client):
    for _ in range(10):
        update(client, "pick", "A", ["A", "B", "C"])          # 1 pick + 2 rejects per display
    result = reject_check(client)
    assert result["reject_mean"] == 1 / 12 and result["exceeds"] is False


def test_reject_check_pools_similar_dimensions_only(client, embedder):
    base = embedder.embed("Tone")
    embedder.set("Tone", base)
    embedder.set("Register", unit_with_cosine(base, 0.9))
    embedder.set("Length", unit_with_cosine(base, 0.1, axis=2))
    update(client, "reject_all", None, ["A"], dim="Register")
    update(client, "reject_all", None, ["A"], dim="Length")
    result = reject_check(client, dim="Tone")
    assert result["n_dimensions"] == 1 and result["reject_all_shows"] == 1
    assert result["reject_mean"] == (1 + 1) / (2 + 1)


def test_reject_check_is_per_participant_and_context(client):
    update(client, "reject_all", None, ["A"])
    assert reject_check(client, pid="P02")["n_dimensions"] == 0
    assert reject_check(client, context="c2")["n_dimensions"] == 0


def test_cors_allows_both_local_origins(client):
    for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        response = client.options("/rank", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        assert response.headers["access-control-allow-origin"] == origin
    blocked = client.options("/rank", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in blocked.headers
