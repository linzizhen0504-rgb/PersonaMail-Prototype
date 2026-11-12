"""What a used card changed in a text, in sentences: which are new, which are gone, and how many were only reworded.
Only the sentence embeddings of the service are used: no model writes anything here."""
import re

import config
from embedding import cosine

_BRACKET = re.compile(r"\[[^\[\]]*\]")


def split_sentences(text):
    """Sentences of a text. A bracket, such as [state your reason, e.g., an illness. Or another], is never split."""
    text = str(text or "").strip()
    if not text:
        return []
    held = []

    def hold(match):
        held.append(match.group(0))
        return f"\u0000{len(held) - 1}\u0000"

    masked = _BRACKET.sub(hold, text)
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", masked) if part.strip()]
    return [re.sub("\u0000(\\d+)\u0000", lambda m: held[int(m.group(1))], part) for part in parts]


def _best(embedder, sentence, others):
    vector = embedder.embed(sentence)
    return max((cosine(vector, embedder.embed(other)) for other in others), default=0.0)


def _shown(sentences):
    limit = config.CHANGE_MAX_LENGTH
    return [s if len(s) <= limit else s[:limit] + "\u2026" for s in sentences[: config.CHANGE_MAX_SENTENCES]]


def analyze_change(embedder, before, after):
    """{added: [sentences], removed: [sentences], reworded: count, kept: count}"""
    old, new = split_sentences(before), split_sentences(after)
    added, reworded, kept = [], 0, 0
    for sentence in new:
        similarity = _best(embedder, sentence, old)
        if similarity >= config.CHANGE_KEPT_SIMILARITY:
            kept += 1
        elif similarity >= config.CHANGE_REWORDED_SIMILARITY:
            reworded += 1
        else:
            added.append(sentence)
    removed = [sentence for sentence in old if _best(embedder, sentence, new) < config.CHANGE_REWORDED_SIMILARITY]
    return {"added": _shown(added), "removed": _shown(removed), "reworded": reworded, "kept": kept}
