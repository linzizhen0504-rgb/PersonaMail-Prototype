"""Cross-intent style preference: learned within one email (session) from picks / rejections, layered on Beta ranking."""
import numpy as np
import pytest

from style import StyleState, relative_scores
from model import PreferenceModel
from store import Store


def cands(content, *styles):
    return [{"value": s.title(), "text": f"content:{content} style:{s}"} for s in styles]


def current(content):
    return f"content:{content} style:plain"


def shown(content, *styles):
    return dict(shown_values=[s.title() for s in styles],
                shown_texts=[f"content:{content} style:{s}" for s in styles])


def pick(model, content, chosen, *styles, session="S1", dim="Tone"):
    return model.update("P1", "c", dim, "pick", chosen.title(), session_id=session,
                        current_text=current(content), **shown(content, *styles))


# ---- 1. weights -------------------------------------------------------------------------------------------
def test_state_accumulates_signed_weights():
    state = StyleState(dim=4)
    state.add(np.array([1, 0, 0, 0.]), +1.0)
    state.add(np.array([0, 1, 0, 0.]), -0.3)
    assert state.mass == pytest.approx(1.3)


def test_update_weights_per_event(make_model):
    model = make_model()
    pick(model, "c1", "formal", "formal", "casual", "concise")                      # +1.0, -0.3, -0.3
    assert model.style_state("P1", "S1").mass == pytest.approx(1.6)
    model.update("P1", "c", "Tone", "regenerate", None, session_id="S1", current_text=current("c1"),
                 **shown("c1", "formal", "casual"))                                  # -0.5 each
    assert model.style_state("P1", "S1").mass == pytest.approx(1.6 + 1.0)
    model.update("P1", "c", "Tone", "leave", None, session_id="S1", current_text=current("c1"),
                 **shown("c1", "formal"))                                            # -0.2
    assert model.style_state("P1", "S1").mass == pytest.approx(1.6 + 1.0 + 0.2)
    before = model.style_state("P1", "S1").mass
    model.update("P1", "c", "Tone", "edit_done", "Formal", session_id="S1")           # other events: no update
    assert model.style_state("P1", "S1").mass == before


# ---- 2. strength ------------------------------------------------------------------------------------------
def test_strength_is_zero_without_evidence(make_model):
    assert make_model().style_state("P1", "S1").strength == 0


def test_strength_grows_with_evidence_and_cancels():
    v = np.array([1.0, 0, 0, 0])
    grows = StyleState(dim=4)
    grows.add(v, 1.0)
    first = grows.strength
    grows.add(v, 1.0)
    assert grows.strength > first
    cancels = StyleState(dim=4)
    cancels.add(v, 1.0)
    cancels.add(v, -1.0)
    assert cancels.strength == pytest.approx(0)


# ---- 3. relative scores -----------------------------------------------------------------------------------
def test_relative_scores_are_centred_ordered_and_bounded():
    formal, casual, other = np.array([1., 0, 0]), np.array([-1., 0, 0]), np.array([0., 1, 0])
    scores = relative_scores([formal, casual, other], preference=np.array([1., 0, 0]))
    assert scores[0] > scores[2] > scores[1]
    assert all(-1 <= x <= 1 for x in scores)
    assert abs(np.mean(scores)) < 0.35


def test_relative_scores_identical_candidates_are_zero():
    assert relative_scores([np.ones(3)] * 3, preference=np.ones(3)) == pytest.approx([0, 0, 0])


# ---- 4. sessions ------------------------------------------------------------------------------------------
def test_sessions_are_isolated_and_can_be_reset(make_model):
    model = make_model()
    pick(model, "c1", "formal", "formal", "casual", session="A")
    assert model.style_state("P1", "A").strength > 0
    assert model.style_state("P1", "B").strength == 0
    model.reset_session("P1", "A")
    assert model.style_state("P1", "A").strength == 0


def test_style_is_not_applied_to_another_session(make_model):
    model = make_model()
    pick(model, "c1", "formal", "formal", "casual", "concise", session="A")
    out = model.rank("P1", "c", "Opening", cands("c2", "formal", "casual"), k=3,
                     session_id="B", current_text=current("c2"))
    assert out["style_strength"] == 0


# ---- 5. compatibility -------------------------------------------------------------------------------------
def test_without_session_scores_are_unchanged(make_model):
    candidates = cands("c2", "formal", "casual", "concise")
    plain = make_model().rank("P1", "c", "Other", candidates, k=3)
    seeded = make_model()
    pick(seeded, "c1", "formal", "formal", "casual", session="A")      # style evidence exists for session A only
    again = seeded.rank("P1", "c", "Other", candidates, k=3)             # ... but this call has no session_id
    assert plain["style_strength"] == 0 and again["style_strength"] == 0
    assert plain["scores"] == make_model().rank("P1", "c", "Other", candidates, k=3)["scores"]


# ---- 6. transfer across intents ---------------------------------------------------------------------------
def test_style_transfers_across_intents(make_model):
    wins = 0
    for seed in range(400):
        model = make_model(seed=seed)
        pick(model, "c1", "formal", "formal", "casual", "concise")                  # liked formal in one intent
        out = model.rank("P1", "c", "Opening", cands("c2", "formal", "casual", "concise"), k=3,
                         session_id="S1", current_text=current("c2"))               # a different intent / unit
        wins += out["values"].index("Formal") < out["values"].index("Casual")
    assert wins / 400 >= 0.75


def test_rejected_style_is_pushed_down(make_model):
    wins = 0
    for seed in range(400):
        model = make_model(seed=seed)
        for _ in range(2):
            model.update("P1", "c", "Tone", "regenerate", None, session_id="S1", current_text=current("c1"),
                         **shown("c1", "casual", "concise"))                        # never wanted casual / concise
        out = model.rank("P1", "c", "Opening", cands("c2", "formal", "casual", "concise"), k=3,
                         session_id="S1", current_text=current("c2"))
        wins += out["values"].index("Formal") < out["values"].index("Casual")
    assert wins / 400 >= 0.7


def test_style_rank_returns_k_unique_values(make_model):
    model = make_model()
    pick(model, "c1", "formal", "formal", "casual", "concise")
    out = model.rank("P1", "c", "Opening", cands("c2", "formal", "casual", "concise", "plain"), k=3,
                     session_id="S1", current_text=current("c2"))
    assert len(out["values"]) == 3 and len(set(out["values"])) == 3
    assert all(np.isfinite(score) for score in out["scores"].values())


# ---- 7. persistence, fallback, API ------------------------------------------------------------------------
def test_state_survives_a_new_store_instance(tmp_path, embedder):
    first = PreferenceModel(Store(tmp_path), embedder, rng=np.random.default_rng(0), style_delta_scale=1.0)
    pick(first, "c1", "formal", "formal", "casual")
    second = PreferenceModel(Store(tmp_path), embedder, rng=np.random.default_rng(0), style_delta_scale=1.0)
    assert second.style_state("P1", "S1").strength == pytest.approx(first.style_state("P1", "S1").strength)
    assert second.style_state("P1", "S1").strength > 0


def test_value_words_alone_still_work_when_texts_are_missing(make_model):
    model = make_model()
    model.update("P1", "c", "Tone", "pick", "Formal", ["Formal", "Casual"], session_id="S1")   # no texts at all
    assert model.style_state("P1", "S1").strength > 0
    out = model.rank("P1", "c", "Opening", [{"value": "Formal", "text": "x"}, {"value": "Casual", "text": "y"}],
                     k=3, session_id="S1")                                                   # no current_text
    assert out["style_strength"] > 0


def test_api_exposes_style_fields_and_reset(client):
    body = {"pid": "P1", "context": "c", "intent_dimension": "Tone", "session_id": "S1",
            "current_text": current("c1"), "candidates": cands("c1", "formal", "casual")}
    response = client.post("/rank", json=body).json()
    assert "style_strength" in response and set(response["style_scores"]) == {"Formal", "Casual"}
    update = client.post("/update", json={"pid": "P1", "context": "c", "intent_dimension": "Tone", "event": "pick",
                                          "chosen_value": "Formal", "session_id": "S1",
                                          "current_text": current("c1"), **shown("c1", "formal", "casual")}).json()
    assert update["updated"] is True
    assert client.post("/reset-session", json={"pid": "P1", "session_id": "S1"}).json() == {"ok": True}
