"""Tunable settings for the preference model service."""
from pathlib import Path

PORT = 3003
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DEFAULT_LOGS_DIR = BASE_DIR.parent / "src" / "data" / "logs"

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

# Prior for a new value (empirical Bayes over semantically similar values)
SIM_THRESHOLD = 0.75        # minimum cosine similarity for a record to count as similar
MAX_REFS = 5                # at most this many similar records are used
PRIOR_STRENGTH_CAP = 10.0   # the three prior parameters are scaled down to sum to this at most

# Ranking
DEFAULT_K = 3
MMR_LAMBDA = 0.7
RANDOM_ORDER_PROB = 0.25    # probability of returning a random order instead of the ranked one

# Reject check
REJECT_THRESHOLD = 0.5
DIMENSION_SIM_THRESHOLD = 0.75

UNKNOWN_CONTEXT = "unknown"
