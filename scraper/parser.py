"""Turns a Booking.com review-list HTML page into clean review dicts.

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


def _review_sections(item: Node) -> tuple[str | None, str | None]:
    """Returns (liked_text, disliked_text)."""
    liked, disliked = [], []
    for row in item.css(S["review_rows"]):
        body = row.css_first(S["review_text"])
        if body is None:
            continue
        text = re.sub(r"\s+", " ", body.text(separator=" ")).strip()
        # Booking prefixes like "Liked ·" / "Disliked ·"
        text = re.sub(r"^(Liked|Disliked)\s*[·:]\s*", "", text)
        if not text or text.lower() in {"nothing", "n/a", "na", "-"}:
            continue
        classes = (row.attributes.get("class") or "").split()
        (disliked if S["negative_row_class"] in classes else liked).append(text)
    return (" ".join(liked) or None, " ".join(disliked) or None)


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


def parse_reviews(html: str, property_id: str) -> list[dict]:
    tree = HTMLParser(html)
    items = tree.css(S["review_item"])

    if not items:
        # Real "no more reviews" page vs. layout change / block page
        if tree.css_first(".c-review-block") or "review_list" in html and len(html) > 50_000:
            raise LayoutChangedError(f"{property_id}: review blocks present but selectors matched nothing")
        return []

    out: list[dict] = []
    for item in items:
        review_url = item.attributes.get("data-review-url") or ""
        booking_id = review_url or None

        title = _text(item, S["title"])
        if title:
            title = title.strip("“”\"")
        liked, disliked = _review_sections(item)
        rdate = parse_review_date(_text(item, S["review_date"]))
        name = _text(item, S["reviewer_name"])
        score = parse_score(_text(item, S["score"]))

        if rdate is None:
            # Without a date the review is useless for weekly KPIs - skip, but don't crash.
            continue

        nights = None
        n = re.search(r"(\d+)\s+nights?", _text(item, S["nights"]) or "")
        if n:
            nights = int(n.group(1))

        stay = _text(item, S["stay_info"])
        stay_month = None
        if stay:
            sm = re.search(r"([A-Za-z]+ \d{4})", stay)
            stay_month = sm.group(1) if sm else None

        out.append({
            "review_key": make_review_key(property_id, booking_id, name, rdate, title, liked, disliked),
            "property_id": property_id,
            "score": score,
            "title": title,
            "liked_text": liked,
            "disliked_text": disliked,
            "reviewer_name": name,
            "reviewer_country": _text(item, S["country"]),
            "traveller_type": _text(item, S["traveller"]),
            "room_type": _text(item, S["room_type"]),
            "nights": nights,
            "stay_month": stay_month,
            "review_date": rdate.isoformat(),
            "sentiment": derive_sentiment(score),
        })
    return out
