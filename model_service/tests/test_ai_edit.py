"""The user did not take a card but changed the text with the AI (a prompt such as "make it more formal") and used the result.
The prompt is matched with the values the part can move to; a clear match counts as a pick of that value. The style of the change
is learned either way."""
import numpy as np
import pytest

from conftest import unit_with_cosine

CANDIDATES = [
    {"dimension": "Tone", "value": "Direct and formal"},
    {"dimension": "Tone", "value": "Warm and casual"},
    {"dimension": "Length", "value": "Short and concise"},
]


@pytest.fixture
def prompt_vectors(embedder):
    """The prompt 'make it more formal' is close to the first value, far from the others."""
    base = np.zeros(64)
    base[10] = 1.0
    embedder.set("Tone: Direct and formal", base)
    embedder.set("make it more formal", unit_with_cosine(base, 0.8))
    embedder.set("Tone: Warm and casual", unit_with_cosine(base, 0.1, axis=11))
    embedder.set("Length: Short and concise", unit_with_cosine(base, 0.0, axis=12))
    embedder.set("fix this", unit_with_cosine(base, 0.05, axis=13))


def post(client, prompt, candidates=CANDIDATES, session="s1", current="Dear Professor Zhang,", new="Respected Professor Zhang,"):
    return client.post("/update", json={
        "pid": "P01", "context": "c1", "intent_dimension": "Tone", "event": "ai_edit", "prompt": prompt,
        "candidates": candidates, "session_id": session, "current_text": current, "new_text": new}).json()


def test_a_clear_match_counts_as_a_pick_of_that_value(client, prompt_vectors):
    result = post(client, "make it more formal")
    assert result["counts"] == {"Direct and formal": [1, 0]}
    assert result["tally"] == {"reject_all_shows": 0, "chosen_shows": 1}
    assert result["matched"]["dimension"] == "Tone" and result["matched"]["value"] == "Direct and formal"


def test_a_prompt_that_matches_no_value_leaves_the_counts_alone(client, model, prompt_vectors):
    result = post(client, "fix this")
    assert result["matched"] is None
    assert result["counts"] == {}
    assert model.store.load_counts()["records"] == []


def test_two_values_that_match_about_equally_are_not_guessed(client, embedder, prompt_vectors):
    base = np.zeros(64)
    base[10] = 1.0
    embedder.set("Tone: Warm and casual", base)   # as close to the prompt as "Direct and formal"
    result = post(client, "make it more formal")
    assert result["matched"] is None


def test_the_value_is_counted_under_its_own_dimension(client, model, embedder, prompt_vectors):
    base = np.zeros(64)
    base[12] = 1.0
    embedder.set("Length: Short and concise", base)
    embedder.set("shorter please", unit_with_cosine(base, 0.8))
    result = post(client, "shorter please")
    assert result["matched"]["dimension"] == "Length"
    record = model.store.load_counts()["records"][0]
    assert (record["intent_dimension"], record["value"], record["counts"]) == ("Length", "Short and concise", [1, 0])


def test_the_style_of_the_change_is_learned_even_without_a_match(client, model, prompt_vectors):
    post(client, "fix this")
    state = model.style_state("P01", "s1")
    assert state.mass == pytest.approx(1.0)
    assert state.strength > 0


def test_without_a_session_nothing_is_learned_about_style_and_nothing_breaks(client, model, prompt_vectors):
    result = post(client, "make it more formal", session=None)
    assert result["counts"] == {"Direct and formal": [1, 0]}
    assert model.style_state("P01", "s1").mass == 0


def test_without_candidates_only_the_style_is_learned(client, model, prompt_vectors):
    result = post(client, "make it more formal", candidates=[])
    assert result["matched"] is None and result["counts"] == {}
    assert model.style_state("P01", "s1").mass == pytest.approx(1.0)


def test_an_empty_prompt_is_not_matched(client, prompt_vectors):
    assert post(client, "   ")["matched"] is None
