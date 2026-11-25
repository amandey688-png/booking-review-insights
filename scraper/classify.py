"""Tags each review with the topics it mentions, using plain keyword rules.

  python classify.py --all      # (re)classify every stored review

liked_text -> positive mention, disliked_text -> negative mention. A liked-text mention that is
negated nearby ("not clean", "wasn't quiet") is counted as negative instead.
"""
from __future__ import annotations

import argparse
import logging
import re

# ---- All rules live here. Each value is a list of regex fragments (word-boundary matched). ----
TOPIC_RULES: dict[str, list[str]] = {
    "cleanliness": [r"clean\w*", r"dirt\w*", r"filth\w*", r"stain\w*", r"mou?ld\w*", r"dust\w*",
                    r"smell\w*", r"stink\w*", r"stank", r"odou?rs?", r"hygien\w*", r"spotless",
                    r"cockroach\w*", r"bed ?bugs?", r"bugs?", r"hairs?", r"grubby", r"musty"],
    "check_in": [r"check(?:ed|ing)?[ -]?in", r"check(?:ed|ing)?[ -]?out", r"reception\w*",
                 r"front desk", r"zoom", r"video call\w*", r"outsourced", r"key ?cards?", r"keys?",
                 r"access(?:ing)? (?:the )?(?:building|room|hotel|property)", r"door codes?",
                 r"lock ?box", r"self[ -]check\w*", r"kiosk", r"early arrival", r"late arrival"],
    "staff": [r"staff\w*", r"receptionists?", r"manager\w*", r"management", r"host", r"service",
              r"rude\w*", r"unhelpful", r"helpful\w*", r"friendly", r"unfriendly", r"welcoming",
              r"polite", r"cleaners?", r"housekeep\w*", r"customer service"],
    "noise": [r"nois\w*", r"loud\w*", r"quiet\w*", r"sound ?proof\w*", r"thin walls", r"traffic",
              r"banging", r"peaceful", r"hear (?:everything|every|the|people|other)\w*"],
    "facilities": [r"facilit\w*", r"lifts?", r"elevators?", r"kitchen\w*", r"laundry", r"parking",
                   r"pool", r"gym", r"breakfast", r"fridge", r"kettle", r"microwave", r"tv",
                   r"television", r"amenit\w*", r"stairs", r"hot water", r"water pressure"],
    "location": [r"locat\w*", r"close to", r"near(?:by)?", r"walking distance", r"walk to",
                 r"station", r"transport", r"central", r"neighbou?rhood", r"convenient\w*",
                 r"bus stops?", r"stadium", r"cbd", r"area"],
    "room_condition": [r"rooms? (?:is|was|were|are)?\s*(?:very |really |quite |too |so )?"
                       r"(?:small|tiny|old|dated|run[ -]?down|cramped|spacious|comfortable|tired)",
                       r"(?:small|tiny|old|dated|cramped|spacious|comfortable|comfy|tired) rooms?",
                       r"beds?", r"mattress\w*", r"pillows?", r"bathrooms?", r"showers?", r"toilets?",
                       r"broken", r"run[ -]?down", r"dated", r"worn", r"carpets?", r"furniture",
                       r"curtains?", r"blinds?", r"windows?", r"leak\w*", r"linen", r"sheets",
                       r"towels?", r"maintenance", r"renovat\w*", r"shabby", r"cramped", r"spacious"],
    "value_for_money": [r"value", r"expensive", r"overpriced", r"pric\w+", r"cheap\w*", r"money",
                        r"worth", r"afford\w*", r"budget", r"cost\w*", r"rip[ -]?off", r"refund\w*",
                        r"charg\w+", r"fees?", r"deposit"],
    "aircon_heating": [r"air[ -]?con\w*", r"a/?c", r"heat(?:er|ing|ers)", r"too hot", r"too cold",
                       r"stuffy", r"fans?", r"ventilation", r"freezing", r"temperature"],
    "wifi": [r"wi[ -]?fi", r"internet", r"wireless"],
}

# Words that flip a liked-text mention to negative when they appear just before it.
NEGATION = r"(?:not|no|never|n't|nt|isnt|wasnt|werent|without|lack(?:ed|ing|s)?(?: of)?|hardly|barely)"
NEGATION_WINDOW_WORDS = 3   # "not very clean", "wasn't at all quiet"
# -------------------------------------------------------------------------------------------

_COMPILED = {t: re.compile(r"\b(?:" + "|".join(p) + r")\b", re.I) for t, p in TOPIC_RULES.items()}
_NEGATED_BEFORE = re.compile(NEGATION + r"(?:\s+\w+){0," + str(NEGATION_WINDOW_WORDS - 1) + r"}\s*$", re.I)


def _is_negated(text: str, match_start: int) -> bool:
    """True if a negation word sits within a few words before the match, in the same clause."""
    clause = re.split(r"[.,;!?]|\bbut\b|\band\b", text[:match_start])[-1]
    return bool(_NEGATED_BEFORE.search(clause))


def classify_text(text: str | None, default_polarity: str) -> set[tuple[str, str]]:
    """Topics mentioned in one section. Negation only flips positive -> negative."""
    found: set[tuple[str, str]] = set()
    if not text:
        return found
    for topic, rx in _COMPILED.items():
        for m in rx.finditer(text):
            negated = default_polarity == "positive" and _is_negated(text, m.start())
            found.add((topic, "negative" if negated else default_polarity))
    return found


def classify_review(review: dict) -> list[tuple[str, str]]:
    """[(topic, polarity), ...] for a review. The title is not used: it has no liked/disliked side."""
    found = classify_text(review.get("liked_text"), "positive")
    found |= classify_text(review.get("disliked_text"), "negative")
    return sorted(found)


def classify_all(store) -> int:
    reviews = store.all_reviews()
    store.replace_topics({r["review_key"]: classify_review(r) for r in reviews})
    return len(reviews)


if __name__ == "__main__":
    from store import get_store

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="classify every stored review (the default)")
    ap.parse_args()
    print(f"Classified {classify_all(get_store())} reviews")
