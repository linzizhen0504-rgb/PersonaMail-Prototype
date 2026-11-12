"""The ranking also follows the style profile of the email: cards whose value is close to the values the writer took (and far from the ones
they passed over), and whose length change is the one the writer tends to make, are ranked higher, with a reason that can be shown."""
import numpy as np
import pytest

from conftest import unit_with_cosine

CURRENT = "I was wondering if I could possibly have a little more time for the project, if that is alright."
SHORT = "Could I have two more days?"
LONG = "I was wondering if I could possibly have a little more time for the project, if that is alright with you, and I am very sorry to ask."


@pytest.fixture
def quiet(model):
    """No luck in the ranking: only the style and the profile decide."""
    model.sample_scores = lambda params_list: [0.0] * len(params_list)
    return model


@pytest.fixture
def values(embedder):
    base = np.zeros(64)
    base[10] = 1.0
    embedder.set("Direct", base)
    embedder.set("Straight", unit_with_cosine(base, 0.9))
    embedder.set("Elaborate", unit_with_cosine(base, 0.05, axis=12))
    embedder.set("Apologetic", np.eye(64)[20])
    embedder.set("Sorry", unit_with_cosine(np.eye(64)[20], 0.9, axis=22))
    return base


def take(client, value="Direct", text=SHORT, shown=("Direct", "Warm", "Formal"), session="s1"):
    texts = [text] + ["Hello there!", "Dear Sir or Madam."][: len(shown) - 1]
    client.post("/update", json={"pid": "P01", "context": "c1", "intent_dimension": "Tone", "event": "pick", "chosen_value": value,
                                 "shown_values": list(shown), "shown_texts": texts, "current_text": CURRENT, "session_id": session})


def rank(client, candidates, session="s1", k=None):
    body = {"pid": "P01", "context": "c1", "intent_dimension": "Tone", "candidates": candidates, "session_id": session, "current_text": CURRENT}
    if k:
        body["k"] = k
    return client.post("/rank", json=body).json()


CANDS = [{"value": "Elaborate", "text": SHORT}, {"value": "Straight", "text": SHORT}]


def test_without_a_profile_the_profile_term_is_zero_and_nothing_is_recommended(client, quiet, values):
    result = rank(client, CANDS)
    assert result["profile_scores"] == {"Elaborate": 0.0, "Straight": 0.0}
    assert result["profile_confidence"] == 0.0 and result["reasons"] == {}


def test_a_value_close_to_a_value_the_writer_took_is_ranked_higher(client, quiet, values):
    take(client, "Direct", SHORT)
    result = rank(client, CANDS, k=2)
    assert result["values"][0] == "Straight"
    assert result["profile_scores"]["Straight"] > result["profile_scores"]["Elaborate"]


def test_the_reason_names_the_value_taken_that_it_is_close_to(client, quiet, values):
    take(client, "Direct", SHORT)
    reason = rank(client, CANDS, k=2)["reasons"]["Straight"]
    assert reason["nearest_liked"]["value"] == "Direct" and reason["nearest_liked"]["similarity"] > 0.8


def test_a_value_close_to_a_value_the_writer_passed_over_is_ranked_lower(client, quiet, values):
    client.post("/update", json={"pid": "P01", "context": "c1", "intent_dimension": "Tone", "event": "regenerate",
                                 "shown_values": ["Apologetic"], "shown_texts": ["I am so sorry."], "current_text": CURRENT, "session_id": "s1"})
    candidates = [{"value": "Sorry", "text": SHORT}, {"value": "Elaborate", "text": SHORT}]
    result = rank(client, candidates, k=2)
    assert result["values"][0] == "Elaborate"


def test_a_length_change_like_the_writers_is_ranked_higher(client, quiet, values):
    take(client, "Direct", SHORT)                       # the writer shortened the text
    take(client, "Straight", SHORT, shown=("Straight", "Warm", "Formal"))
    candidates = [{"value": "Elaborate", "text": LONG}, {"value": "Elaborate two", "text": SHORT}]
    result = rank(client, candidates, k=2)
    assert result["values"][0] == "Elaborate two"
    assert result["reasons"]["Elaborate two"]["length_change_pct"] < 0


def test_the_profile_counts_for_more_the_more_the_writer_has_done(client, quiet, values):
    take(client, "Direct", SHORT)
    one = rank(client, CANDS, k=2)["profile_confidence"]
    for n in range(3):
        take(client, "Direct", SHORT)
    assert rank(client, CANDS, k=2)["profile_confidence"] > one


def test_with_the_weight_at_zero_the_scores_are_the_style_term_only(make_model, embedder, values):
    from fastapi.testclient import TestClient
    from app import create_app
    model = make_model(profile_weight=0.0)
    model.sample_scores = lambda params_list: [0.0] * len(params_list)
    client = TestClient(create_app(model))
    take(client, "Direct", SHORT)
    result = rank(client, CANDS, k=2)
    for value, score in result["scores"].items():
        assert score == pytest.approx(model.cfg["style_weight"] * result["style_strength"] * result["style_scores"][value])


def test_the_top_card_is_recommended_only_when_the_profile_is_clear_about_it(client, quiet, values):
    take(client, "Direct", SHORT)
    take(client, "Straight", SHORT, shown=("Straight", "Warm", "Formal"))
    result = rank(client, CANDS, k=2)
    assert result["recommended"] == "Straight"
    fresh = rank(client, CANDS, session="another")
    assert fresh["recommended"] is None
