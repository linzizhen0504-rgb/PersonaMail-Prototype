import hashlib
import re

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

    AXES = ["plain", "formal", "casual", "concise"]

    def embed(self, text):
        if text in self.fixed:
            return self.fixed[text]
        # Style grammar for the style tests: "content:xx style:yy" = content part + style axis; a bare axis word
        # ("Formal") is the style axis itself. Subtracting two texts with the same content leaves only style.
        style = re.search(r"style:(\w+)", text)
        word = text.strip().lower()
        if style or word in self.AXES:
            vector = np.zeros(64)
            content = re.search(r"content:(\w+)", text)
            if content:
                vector[8 + int(hashlib.md5(content.group(1).encode()).hexdigest()[:4], 16) % 40] = 2.0
            vector[self.AXES.index(style.group(1) if style else word)] = 1.0
            return vector
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
    def factory(seed=0, **overrides):
        overrides.setdefault("random_order_prob", 0.0)
        overrides.setdefault("style_delta_scale", 1.0)   # the fake vectors are not MiniLM-sized
        return PreferenceModel(Store(tmp_path), embedder, rng=np.random.default_rng(seed), **overrides)
    return factory


@pytest.fixture
def model(make_model):
    return make_model()


@pytest.fixture
def client(model):
    return TestClient(create_app(model))
