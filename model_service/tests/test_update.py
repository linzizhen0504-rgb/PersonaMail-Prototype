def post(client, event, chosen="A", shown=("A", "B", "C"), pid="P01", context="c1", dim="Tone"):
    return client.post("/update", json={"pid": pid, "context": context, "intent_dimension": dim,
                                        "event": event, "chosen_value": chosen,
                                        "shown_values": list(shown)}).json()


def test_pick_counts_chosen_and_rejects_others(client):
    result = post(client, "pick")
    assert result["counts"] == {"A": [1, 0, 0], "B": [0, 0, 1], "C": [0, 0, 1]}


def test_edit_counts_chosen_edit_and_rejects_others(client):
    result = post(client, "edit")
    assert result["counts"] == {"A": [0, 1, 0], "B": [0, 0, 1], "C": [0, 0, 1]}


def test_reject_all_rejects_every_shown_value(client):
    result = post(client, "reject_all", chosen=None)
    assert result["counts"] == {"A": [0, 0, 1], "B": [0, 0, 1], "C": [0, 0, 1]}


def test_other_events_do_not_update(client, model):
    for event in ("leave", "edit_done", "cards_shown"):
        assert post(client, event)["updated"] is False
    assert model.store.load_counts()["records"] == []


def test_counts_accumulate_on_the_same_record(client):
    post(client, "pick")
    result = post(client, "pick")
    assert result["counts"]["A"] == [2, 0, 0]
