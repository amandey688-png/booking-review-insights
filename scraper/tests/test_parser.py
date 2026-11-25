import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from parser import LayoutChangedError, parse_review_date, parse_reviews, parse_score  # noqa: E402

FIXTURE = (Path(__file__).parent / "fixtures" / "sample_page.html").read_text(encoding="utf-8")


def test_parses_all_fields():
    reviews, skipped = parse_reviews(FIXTURE, "paddington")
    assert len(reviews) == 2
    assert skipped == 1                     # the card without a date
    r = reviews[0]
    assert r["review_key"].startswith("h:")
    assert r["score"] == 8.0
    assert r["title"] == "Great location"
    assert r["liked_text"] == "Friendly staff and close to the station."
    assert "not clean" in r["disliked_text"]
    assert r["review_date"] == "2026-11-12"
    assert r["nights"] == 2
    assert r["stay_month"] == "November 2026"
    assert r["reviewer_name"] == "Alex"
    assert r["reviewer_country"] == "Australia"
    assert r["room_type"] == "Superior Double Room (Ensuite)"
    assert r["traveller_type"] == "Couple"
    assert r["sentiment"] == "positive"


def test_nothing_is_filtered():
    r = parse_reviews(FIXTURE, "paddington")[0][1]
    assert r["liked_text"] is None          # "Nothing" is dropped
    assert r["sentiment"] == "negative"


def test_dedup_key_is_stable_and_duplicates_collapse():
    a, _ = parse_reviews(FIXTURE, "paddington")
    b, _ = parse_reviews(FIXTURE + FIXTURE, "paddington")
    assert [x["review_key"] for x in a] == [x["review_key"] for x in b]


def test_empty_page_returns_nothing():
    assert parse_reviews("<html><body></body></html>", "paddington") == ([], 0)


def test_layout_change_detected():
    with pytest.raises(LayoutChangedError):   # review markup, but the card selector no longer matches
        parse_reviews('<div data-testid="review-card-v2">new markup</div>', "paddington")
    with pytest.raises(LayoutChangedError):   # cards match, but nothing inside them can be read
        parse_reviews('<div data-testid="review-card"><p>new markup</p></div>', "paddington")


def test_helpers():
    assert parse_review_date("Reviewed: 1 March 2026").isoformat() == "2026-03-01"
    assert parse_review_date("garbage") is None
    assert parse_score("Scored 9,5") == 9.5
    assert parse_score("Scored 10 10") == 10
    assert parse_score("42") is None
