"""Style preference learned within one email: a signed sum of card feature vectors (what the user took vs. passed
over). Cards are then scored by how well they point the same way, relative to the other candidates."""
import numpy as np

import config


class StyleState:
    def __init__(self, dim=0, p=None, mass=0.0):
        self.p = np.zeros(dim) if p is None else np.asarray(p, dtype=float)
        self.mass = float(mass)

    def add(self, vector, weight):
        vector = np.asarray(vector, dtype=float)
        if self.p.shape != vector.shape:
            self.p = np.zeros(vector.shape)
        self.p = self.p + weight * vector
        self.mass += abs(weight)

    @property
    def strength(self):
        """0 without evidence; grows with the total evidence; shrinks when taken and passed-over styles cancel."""
        if self.mass <= 0:
            return 0.0
        return min(1.0, self.mass / config.STYLE_MASS_FULL) * float(np.linalg.norm(self.p) / self.mass)

    def to_dict(self):
        return {"p": self.p.tolist(), "mass": self.mass}

    @classmethod
    def from_dict(cls, data):
        return cls(p=data.get("p", []), mass=data.get("mass", 0.0))


def relative_scores(vectors, preference):
    """Cosine of each candidate with the preference, centred and scaled within the candidate set to [-1, 1]
    (raw cosines of style words are squeezed into a narrow band, so only the differences between candidates count)."""
    preference = np.asarray(preference, dtype=float)
    norm = np.linalg.norm(preference)
    if norm == 0 or len(vectors) == 0:
        return [0.0] * len(vectors)
    sims = []
    for vector in vectors:
        vector = np.asarray(vector, dtype=float)
        length = np.linalg.norm(vector)
        sims.append(float(np.dot(vector, preference) / (length * norm)) if length > 0 else 0.0)
    sims = np.array(sims)
    z = (sims - sims.mean()) / (sims.std() + 0.05)
    return (np.clip(z, -2, 2) / 2).tolist()
