import hashlib

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import create_app
from model import PreferenceModel
from store import Store


class FakeEmbedder:
    """Deterministic embeddings: pseudo-random unit vectors, with explicit vectors for chosen texts."""

    def __init__(self):
        self.fixed = {}

    def set(self, text, vector):
        vector = np.asarray(vector, dtype=float)
        self.fixed[text] = vector / np.linalg.norm(vector)

    def embed(self, text):
        if text in self.fixed:
            return self.fixed[text]
        seed = int(hashlib.md5(text.encode()).hexdigest()[:8], 16)
        vector = np.random.default_rng(seed).normal(size=64)
        return vector / np.linalg.norm(vector)


def unit_with_cosine(base, cosine, axis=1):
    """A unit vector whose cosine with `base` (a unit vector in R^64) is `cosine`."""
    other = np.zeros(64)
    other[axis] = 1.0
    other = other - np.dot(other, base) * base
    other = other / np.linalg.norm(other)
    return cosine * base + np.sqrt(1 - cosine ** 2) * other


@pytest.fixture
def embedder():
    return FakeEmbedder()


@pytest.fixture
def make_model(tmp_path, embedder):
    def factory(**overrides):
        overrides.setdefault("random_order_prob", 0.0)
        return PreferenceModel(Store(tmp_path), embedder, rng=np.random.default_rng(0), **overrides)
    return factory


@pytest.fixture
def model(make_model):
    return make_model()


@pytest.fixture
def client(model):
    return TestClient(create_app(model))
