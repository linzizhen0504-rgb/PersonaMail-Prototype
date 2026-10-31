import numpy as np
import pytest


def post(client, event, chosen="A", shown=("A", "B", "C"), pid="P01", context="c1", dim="Tone"):
    return client.post("/update", json={"pid": pid, "context": context, "intent_dimension": dim,
                                        "event": event, "chosen_value": chosen,
                                        "shown_values": list(shown)}).json()


def test_pick_accepts_chosen_and_rejects_others(client):
    result = post(client, "pick")
    assert result["counts"] == {"A": [1, 0], "B": [0, 1], "C": [0, 1]}
    assert result["tally"] == {"reject_all_shows": 0, "chosen_shows": 1}


@pytest.mark.parametrize("event", ["regenerate", "leave"])
def test_regenerate_and_leave_reject_every_shown_value(client, event):
    result = post(client, event, chosen=None)
    assert result["counts"] == {"A": [0, 1], "B": [0, 1], "C": [0, 1]}
    assert result["tally"] == {"reject_all_shows": 1, "chosen_shows": 0}


def test_legacy_events_map_to_the_new_rules(client):
    assert post(client, "edit", pid="P1")["counts"] == {"A": [1, 0], "B": [0, 1], "C": [0, 1]}   # edit == pick
    assert post(client, "reject_all", chosen=None, pid="P2")["counts"] == {"A": [0, 1], "B": [0, 1], "C": [0, 1]}


def test_other_events_do_not_update(client, model):
    for event in ("edit_done", "cards_shown", "values_regenerated"):
        assert post(client, event)["updated"] is False
    assert model.store.load_counts()["records"] == []
    assert model.store.load_counts()["shows"] == []


def test_counts_accumulate_on_the_same_record(client):
    post(client, "pick")
    result = post(client, "pick")
    assert result["counts"]["A"] == [2, 0]


def test_beta_score_is_a_probability(model):
    scores = model.sample_scores([np.array([1.0, 1.0]), np.array([30.0, 2.0]), np.array([1.0, 40.0])])
    assert all(0 < score < 1 for score in scores)


def test_accepted_values_score_higher_than_rejected_ones(model):
    accepted, rejected = np.array([41.0, 1.0]), np.array([1.0, 41.0])
    wins = sum(model.sample_scores([accepted])[0] > model.sample_scores([rejected])[0] for _ in range(200))
    assert wins > 190
