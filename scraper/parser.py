"""Turns Booking.com review-card HTML into clean review dicts.

Pure functions, no network - so it can be unit-tested against saved HTML.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime

from selectolax.lexbor import LexborHTMLParser as HTMLParser, LexborNode as Node

from config import SELECTORS as S


class LayoutChangedError(Exception):
    """Raised when a page clearly has reviews but we cannot parse any - selectors are stale."""


def _text(node: Node | None, sel: str) -> str | None:
    if node is None:
        return None
    el = node.css_first(sel)
    if el is None:
        return None
    t = re.sub(r"\s+", " ", el.text(separator=" ")).strip()
    return t or None


def parse_review_date(raw: str | None) -> date | None:
    """'Reviewed: 12 November 2026' -> date(2026, 11, 12)."""
    if not raw:
        return None
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", raw)
    if not m:
        return None
    try:
        return datetime.strptime(" ".join(m.groups()), "%d %B %Y").date()
    except ValueError:
        return None


def parse_score(raw: str | None) -> float | None:
    if not raw:
        return None
    m = re.search(r"\d+(?:[.,]\d)?", raw)
    if not m:
        return None
    val = float(m.group().replace(",", "."))
    return val if 1 <= val <= 10 else None


def _clean_section(text: str | None) -> str | None:
    """Drops empty answers such as 'Nothing' so they are not counted as feedback."""
    if not text or text.lower().strip(" .!") in {"nothing", "n/a", "na", "none", "-", ""}:
        return None
    return text


def make_review_key(property_id: str, booking_id: str | None, name: str | None,
                    review_date: date | None, title: str | None,
                    liked: str | None, disliked: str | None) -> str:
    """Stable dedup key: Booking's own review id when available, else a content hash."""
    if booking_id:
        return f"bk:{booking_id}"
    raw = "|".join(str(x or "") for x in (property_id, name, review_date, title, liked, disliked))
    return "h:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def derive_sentiment(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 8:
        return "positive"
    if score >= 6:
        return "neutral"
    return "negative"


def parse_reviews(html: str, property_id: str) -> tuple[list[dict], int]:
    """Returns (reviews, skipped). Skipped = cards without a usable date or score."""
    tree = HTMLParser(html)
    items = tree.css(S["review_item"])

    if not items:
        # Real "no more reviews" page vs. layout change
        if 'data-testid="review' in html:
            raise LayoutChangedError(f"{property_id}: review markup present but no review cards matched")
        return [], 0

    out: dict[str, dict] = {}
    skipped = 0
    for item in items:
        title = _text(item, S["title"])
        if title:
            title = title.strip("“”\"")
        liked = _clean_section(_text(item, S["liked"]))
        disliked = _clean_section(_text(item, S["disliked"]))
        rdate = parse_review_date(_text(item, S["review_date"]))
        name = _text(item, S["reviewer_name"])
        score = parse_score(_text(item, S["score"]))

        if rdate is None or score is None:
            # Without a date or score the review is useless for weekly KPIs - skip, don't crash.
            skipped += 1
            continue

        n = re.search(r"(\d+)\s+nights?", _text(item, S["nights"]) or "")
        key = make_review_key(property_id, None, name, rdate, title, liked, disliked)
        out[key] = {   # dict keyed by review_key: a card repeated on the page is stored once
            "review_key": key,
            "property_id": property_id,
            "score": score,
            "title": title,
            "liked_text": liked,
            "disliked_text": disliked,
            "reviewer_name": name,
            "reviewer_country": _text(item, S["country"]),
            "traveller_type": _text(item, S["traveller"]),
            "room_type": _text(item, S["room_type"]),
            "nights": int(n.group(1)) if n else None,
            "stay_month": _text(item, S["stay_month"]),
            "review_date": rdate.isoformat(),
            "sentiment": derive_sentiment(score),
        }
    if not out:
        raise LayoutChangedError(f"{property_id}: {len(items)} review cards found but none could be read")
    return list(out.values()), skipped
