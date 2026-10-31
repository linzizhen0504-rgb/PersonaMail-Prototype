"""Local text embeddings (sentence-transformers all-MiniLM-L6-v2); no external API is called at runtime."""
import numpy as np

import config


class Embedder:
    def __init__(self, model_name=config.EMBEDDING_MODEL):
        self.model_name = model_name
        self._model = None
        self._cache = {}

    def load(self):
        """Load the model once; the first call downloads it if it is not cached locally."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
        return self._model

    def embed(self, text):
        """L2-normalised embedding of one text (cached)."""
        if text not in self._cache:
            vector = self.load().encode(text, normalize_embeddings=True)
            self._cache[text] = np.asarray(vector, dtype=np.float32)
        return self._cache[text]


def cosine(a, b):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)
