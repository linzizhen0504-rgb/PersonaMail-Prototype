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

# Style preference (learned within one email; layered on top of the Beta score)
# Decided by an offline comparison: MiniLM only, using "rewritten text minus current text" plus the value words.
STYLE_WEIGHT = 1.5            # how far the style term can move a card's score (strength 1, relative score 1)
STYLE_VALUE_WEIGHT = 0.5      # weight of the value-word block next to the text-change block
STYLE_DELTA_SCALE = 0.65      # typical length of a MiniLM text-change vector, so both blocks are comparable
STYLE_MASS_FULL = 2.0         # total evidence at which the style term reaches full strength
STYLE_PICK_WEIGHT = 1.0       # chosen card
STYLE_SIBLING_WEIGHT = -0.3   # cards shown next to the chosen one
STYLE_REGENERATE_WEIGHT = -0.5
STYLE_LEAVE_WEIGHT = -0.2

# The user changed the text with the AI instead of taking a card (event "ai_edit"): the prompt is matched with the values the part can move to
AI_EDIT_MATCH_THRESHOLD = 0.40   # minimum cosine between the prompt and "dimension: value" to count as that value
AI_EDIT_MATCH_MARGIN = 0.05      # the best value must beat the second best by this much, otherwise it is not guessed
STYLE_AI_EDIT_WEIGHT = 1.0       # the AI text the user used counts like a chosen card
