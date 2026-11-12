"""The style profile of one email: what the user changed with each operation, accumulated, with the evidence for every statement.
Pure logic first (Profile), then through the events of the model service."""
import math

import numpy as np
import pytest

from style_profile import Profile, MIN_EVIDENCE

NO_ANALYSIS = {"added": [], "removed": [], "reworded": 1, "kept": 0}


def change(profile, value, before, after, analysis=None, kind="pick", dimension="Tone"):
    profile.record_change(kind, dimension, value, before, after, analysis or NO_ANALYSIS)


class TestAccumulation:
    def test_a_new_profile_has_nothing_to_say(self):
        summary = Profile().summary(strength=0.0)
        assert summary["ops_count"] == 0 and summary["traits"] == [] and summary["liked"] == [] and summary["disliked"] == []

    def test_a_pick_makes_its_value_liked_and_is_remembered_with_what_it_changed(self):
        profile = Profile()
        change(profile, "Direct and formal", "Hi Prof, could I get more time?", "I request a two-day extension.",
               {"added": ["I request a two-day extension."], "removed": ["Hi Prof, could I get more time?"], "reworded": 0, "kept": 0})
        summary = profile.summary(strength=0.5)
        assert summary["liked"][0]["value"] == "Direct and formal" and summary["liked"][0]["weight"] == pytest.approx(1.0)
        recent = summary["recent"][0]
        assert recent["kind"] == "pick" and recent["added"] == 1 and recent["removed"] == 1
        assert recent["length_change_pct"] == round((math.exp(math.log(len("I request a two-day extension.") / len("Hi Prof, could I get more time?"))) - 1) * 100)

    def test_rejections_make_values_disliked_with_the_weight_of_the_event(self):
        profile = Profile()
        profile.record_rejection("Tone", ["Apologetic", "Warm"], -0.5)
        profile.record_rejection("Tone", ["Apologetic"], -0.2)
        disliked = {item["value"]: item["weight"] for item in profile.summary(0.3)["disliked"]}
        assert disliked == {"Apologetic": pytest.approx(0.7), "Warm": pytest.approx(0.5)}

    def test_a_value_that_is_picked_after_being_passed_over_counts_for_both(self):
        profile = Profile()
        profile.record_rejection("Tone", ["Direct"], -0.5)
        change(profile, "Direct", "a b c", "a b c d e")
        summary = profile.summary(0.4)
        assert summary["liked"][0]["value"] == "Direct" and summary["disliked"][0]["value"] == "Direct"

    def test_only_the_last_eight_operations_are_kept_but_all_of_them_count_in_the_statistics(self):
        profile = Profile()
        for n in range(12):
            change(profile, f"V{n}", "one two three four", "one two")
        summary = profile.summary(0.9)
        assert len(summary["recent"]) == 8 and summary["recent"][0]["value"] == "V11"
        assert summary["stats"]["changes"] == 12

    def test_it_survives_being_saved_and_loaded(self):
        profile = Profile()
        change(profile, "Direct", "a b c d", "a b")
        profile.record_rejection("Tone", ["Warm"], -0.5)
        assert Profile.from_dict(profile.to_dict()).summary(0.5) == profile.summary(0.5)


class TestTraits:
    def short(self, profile, n):
        for k in range(n):
            change(profile, f"Short {k}", "this is a fairly long sentence with many words in it", "this is short")

    def test_nothing_is_claimed_from_less_than_the_minimum_evidence(self):
        profile = Profile()
        self.short(profile, MIN_EVIDENCE - 1)
        assert profile.summary(0.5)["traits"] == []

    def test_it_says_the_user_shortens_texts_with_the_average_and_the_evidence(self):
        profile = Profile()
        self.short(profile, 3)
        traits = profile.summary(0.5)["traits"]
        shorter = next(t for t in traits if t["kind"] == "shorter")
        assert "shorter" in shorter["text"].lower() and "%" in shorter["text"]
        assert shorter["evidence"] == ["Short 0", "Short 1", "Short 2"]

    def test_it_says_the_user_lengthens_texts(self):
        profile = Profile()
        for k in range(3):
            change(profile, f"Long {k}", "short text", "a much longer text with a lot more words in it")
        assert any(t["kind"] == "longer" for t in profile.summary(0.5)["traits"])

    def test_it_says_the_user_often_adds_new_sentences(self):
        profile = Profile()
        for k in range(3):
            change(profile, f"Add {k}", "same", "same plus", {"added": ["A new sentence."], "removed": [], "reworded": 0, "kept": 1})
        assert any(t["kind"] == "adds" and "3 of 3" in t["text"] for t in profile.summary(0.5)["traits"])

    def test_it_says_the_user_often_removes_sentences(self):
        profile = Profile()
        for k in range(3):
            change(profile, f"Cut {k}", "same plus", "same", {"added": [], "removed": ["An old sentence."], "reworded": 0, "kept": 1})
        assert any(t["kind"] == "removes" for t in profile.summary(0.5)["traits"])

    def test_it_says_the_user_mostly_rewords(self):
        profile = Profile()
        for k in range(3):
            change(profile, f"Word {k}", "aaa bbb ccc", "aaa bbb ddd")
        assert any(t["kind"] == "rewords" for t in profile.summary(0.5)["traits"])

    def test_a_length_that_does_not_move_in_one_direction_is_not_a_trait(self):
        profile = Profile()
        change(profile, "A", "one two three four five six", "one two")
        change(profile, "B", "one two", "one two three four five six")
        change(profile, "C", "one two three four", "one two three four")
        assert not any(t["kind"] in ("shorter", "longer") for t in profile.summary(0.5)["traits"])

    def test_edits_after_a_card_count_as_changes_too_and_say_where_they_come_from(self):
        profile = Profile()
        for k in range(3):
            change(profile, f"Manual {k}", "this is a fairly long sentence with many words in it", "this is short", kind="manual_edit")
        shorter = next(t for t in profile.summary(0.5)["traits"] if t["kind"] == "shorter")
        assert shorter["evidence"] == ["Manual 0", "Manual 1", "Manual 2"]
