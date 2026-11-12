"""The profile is fed by the events the page already sends (pick, regenerate, leave, ai_edit) and by hand edits after a card (manual_edit)."""
import numpy as np
import pytest

from conftest import unit_with_cosine

BEFORE = "I was wondering if I could possibly have a little more time for the project."
SHORT = "Could I have two more days?"


def update(client, event, **extra):
    body = {"pid": "P01", "context": "c1", "intent_dimension": "Tone", "event": event, "session_id": "s1"}
    body.update(extra)
    return client.post("/update", json=body).json()


def profile(client, session="s1", pid="P01"):
    return client.post("/profile", json={"pid": pid, "session_id": session}).json()


def pick(client, value="Direct", shown=("Direct", "Warm", "Formal"), texts=(SHORT, "Hello!", "Dear Sir."), session="s1"):
    return update(client, "pick", chosen_value=value, shown_values=list(shown), shown_texts=list(texts), current_text=BEFORE, session_id=session)


def test_a_session_without_operations_has_an_empty_profile(client):
    summary = profile(client)
    assert summary["ops_count"] == 0 and summary["traits"] == [] and summary["liked"] == []


def test_a_pick_is_added_up_with_what_it_changed(client):
    pick(client)
    summary = profile(client)
    assert [item["value"] for item in summary["liked"]] == ["Direct"]
    recent = summary["recent"][0]
    assert recent["kind"] == "pick" and recent["value"] == "Direct"
    assert recent["added"] >= 1 and recent["removed"] >= 1          # a different sentence replaced the old one
    assert recent["length_change_pct"] < 0                          # and it is shorter


def test_the_cards_shown_next_to_the_picked_one_become_disliked(client):
    pick(client)
    disliked = {item["value"] for item in profile(client)["disliked"]}
    assert disliked == {"Warm", "Formal"}


@pytest.mark.parametrize("event, weight", [("regenerate", 0.5), ("leave", 0.2)])
def test_regenerating_or_leaving_makes_every_shown_card_disliked(client, event, weight):
    update(client, event, shown_values=["A", "B"], shown_texts=["a", "b"], current_text=BEFORE)
    summary = profile(client)
    assert {item["value"]: item["weight"] for item in summary["disliked"]} == {"A": pytest.approx(weight), "B": pytest.approx(weight)}
    assert summary["liked"] == [] and summary["stats"]["changes"] == 0


def test_an_ai_edit_is_a_change_of_its_own_kind_and_likes_the_value_its_prompt_matched(client, embedder):
    base = np.zeros(64)
    base[10] = 1.0
    embedder.set("Tone: Direct and formal", base)
    embedder.set("make it more formal", unit_with_cosine(base, 0.8))
    update(client, "ai_edit", prompt="make it more formal", candidates=[{"dimension": "Tone", "value": "Direct and formal"}],
           current_text="Hi Prof,", new_text="Dear Professor,")
    summary = profile(client)
    assert summary["recent"][0]["kind"] == "ai_edit"
    assert [item["value"] for item in summary["liked"]] == ["Direct and formal"]


def test_a_hand_edit_after_a_card_is_a_change_too_and_does_not_touch_the_counts(client, model):
    result = update(client, "manual_edit", chosen_value="Direct", current_text=SHORT, new_text="Could I have two more days, please? Thank you.")
    assert result["updated"] is True and result["counts"] == {}
    assert model.store.load_counts()["records"] == []
    recent = profile(client)["recent"][0]
    assert recent["kind"] == "manual_edit" and recent["length_change_pct"] > 0


def test_three_short_picks_say_so_with_their_values_as_evidence(client):
    for n in range(3):
        pick(client, value=f"Direct {n}", shown=(f"Direct {n}", f"Warm {n}", f"Formal {n}"))
    shorter = next(t for t in profile(client)["traits"] if t["kind"] == "shorter")
    assert shorter["evidence"] == ["Direct 0", "Direct 1", "Direct 2"]


def test_the_strength_is_the_one_of_the_style_state(client, model):
    pick(client)
    assert profile(client)["strength"] == pytest.approx(model.style_state("P01", "s1").strength, abs=1e-3)


def test_sessions_and_participants_do_not_mix(client):
    pick(client, session="s1")
    assert profile(client, session="s2")["ops_count"] == 0
    assert profile(client, pid="P02")["ops_count"] == 0


def test_resetting_the_session_clears_the_profile(client):
    pick(client)
    client.post("/reset-session", json={"pid": "P01", "session_id": "s1"})
    assert profile(client)["ops_count"] == 0


def test_without_a_session_nothing_is_kept_and_nothing_breaks(client):
    result = client.post("/update", json={"pid": "P01", "context": "c1", "intent_dimension": "Tone", "event": "pick", "chosen_value": "Direct",
                                          "shown_values": ["Direct", "Warm"], "shown_texts": [SHORT, "Hello"], "current_text": BEFORE}).json()
    assert result["updated"] is True
    assert profile(client, session="none")["ops_count"] == 0


def test_a_pick_without_texts_still_counts_the_cards_passed_over(client):
    update(client, "pick", chosen_value="Direct", shown_values=["Direct", "Warm"])
    summary = profile(client)
    assert summary["stats"]["changes"] == 0
    assert [item["value"] for item in summary["disliked"]] == ["Warm"]


def test_the_evidence_only_grows_with_the_operations_and_is_full_at_four(client):
    seen = []
    for n in range(4):
        pick(client, value=f"Direct {n}", shown=(f"Direct {n}", f"Warm {n}", f"Formal {n}"))
        seen.append(profile(client)["evidence"])
    assert seen == sorted(seen) and seen[0] == pytest.approx(0.5) and seen[-1] == 1.0      # a pick is two operations: the card and the ones passed over
    assert profile(client)["ops_count"] == 8


def test_an_empty_profile_has_no_evidence(client):
    assert profile(client)["evidence"] == 0.0


def test_the_evidence_does_not_fall_when_the_changes_point_different_ways_but_the_strength_may(client):
    first = None
    for n in range(4):
        pick(client, value=f"Direct {n}", shown=(f"Direct {n}", f"Warm {n}", f"Formal {n}"), texts=(f"Short text number {n} about something else {n * 7}.", "Hello!", "Dear Sir."))
        summary = profile(client)
        first = first if first is not None else summary["evidence"]
        assert summary["evidence"] >= first
