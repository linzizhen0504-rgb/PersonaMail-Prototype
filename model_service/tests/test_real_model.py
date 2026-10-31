import pytest

from embedding import Embedder, cosine

pytestmark = pytest.mark.slow


def test_real_embedder_places_paraphrases_closer_than_unrelated_values():
    embedder = Embedder()
    a = embedder.embed("Reason for Extension: Technical difficulties")
    b = embedder.embed("Reason for Extension: technical problems")
    c = embedder.embed("Reason for Extension: Personal emergency in the family")
    d = embedder.embed("Closing tone: Warm and friendly")
    assert len(a) == 384
    assert cosine(a, b) > cosine(a, c) > cosine(a, d)
    assert cosine(a, b) >= 0.75
