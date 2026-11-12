"""What a used card changed, in sentences: which are new, which are gone, which were only reworded. Checked on real data
(64 chosen cards of the study logs) before it was built; see docs/ARCHITECTURE.md."""
import numpy as np
import pytest

from conftest import unit_with_cosine
from change import analyze_change


@pytest.fixture
def base():
    vector = np.zeros(64)
    vector[20] = 1.0
    return vector


def set_sentences(embedder, base, **cosines):
    """Each sentence gets a vector with the given cosine to the base sentence (the key is only a label)."""
    for index, (text, cosine) in enumerate(cosines.items()):
        embedder.set(text, unit_with_cosine(base, cosine, axis=30 + index))


def test_identical_text_is_all_kept(embedder, base):
    embedder.set("I need two more days.", base)
    result = analyze_change(embedder, "I need two more days.", "I need two more days.")
    assert result == {"added": [], "removed": [], "reworded": 0, "kept": 1}


def test_a_sentence_that_is_not_like_any_old_one_is_added(embedder, base):
    embedder.set("I need two more days.", base)
    embedder.set("I hope your week is going well!", np.eye(64)[40])
    result = analyze_change(embedder, "I need two more days.", "I hope your week is going well! I need two more days.")
    assert result["added"] == ["I hope your week is going well!"]
    assert result["kept"] == 1 and result["removed"] == []


def test_an_old_sentence_that_is_not_like_any_new_one_is_removed(embedder, base):
    embedder.set("I need two more days.", base)
    embedder.set("I will send my draft today.", np.eye(64)[41])
    result = analyze_change(embedder, "I need two more days. I will send my draft today.", "I need two more days.")
    assert result["removed"] == ["I will send my draft today."]
    assert result["added"] == []


def test_a_sentence_with_other_wording_but_the_same_meaning_is_only_reworded(embedder, base):
    embedder.set("I need two more days.", base)
    embedder.set("Could I please have two additional days?", unit_with_cosine(base, 0.7))
    result = analyze_change(embedder, "I need two more days.", "Could I please have two additional days?")
    assert result == {"added": [], "removed": [], "reworded": 1, "kept": 0}


def test_a_bracket_with_e_g_is_not_split_into_sentences(embedder):
    old = "Because of [state your reason, e.g., an illness. Or a family matter.] I am late."
    result = analyze_change(embedder, old, old)
    assert result["kept"] == 1


def test_a_whole_new_text_replaces_everything(embedder):
    embedder.set("Old sentence here.", np.eye(64)[42])
    embedder.set("Completely different text.", np.eye(64)[43])
    result = analyze_change(embedder, "Old sentence here.", "Completely different text.")
    assert result["added"] == ["Completely different text."] and result["removed"] == ["Old sentence here."]


def test_empty_texts_give_nothing_and_do_not_break(embedder):
    assert analyze_change(embedder, "", "") == {"added": [], "removed": [], "reworded": 0, "kept": 0}
    assert analyze_change(embedder, None, "New.")["added"] == ["New."]


def test_no_more_than_five_sentences_are_listed_and_a_long_one_is_cut(embedder):
    new = " ".join(f"Sentence number {n} " + "x" * 400 + "." for n in range(8))
    result = analyze_change(embedder, "Old.", new)
    assert len(result["added"]) == 5
    assert all(len(sentence) <= 301 for sentence in result["added"])


def test_the_http_endpoint_gives_the_same_answer(client, embedder, base):
    embedder.set("I need two more days.", base)
    embedder.set("I hope your week is going well!", np.eye(64)[40])
    answer = client.post("/analyze-change", json={"before": "I need two more days.", "after": "I hope your week is going well! I need two more days."}).json()
    assert answer["added"] == ["I hope your week is going well!"] and answer["kept"] == 1
