import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from classify import classify_review, classify_text  # noqa: E402


@pytest.mark.parametrize("text,polarity,expected", [
    ("Dirty bathroom", "negative", {("cleanliness", "negative"), ("room_condition", "negative")}),
    ("Aircon very loud", "negative", {("aircon_heating", "negative"), ("noise", "negative")}),
    ("greeted by zoom call", "negative", {("check_in", "negative")}),
    ("check in outsourced overseas", "negative", {("check_in", "negative")}),
    ("clean and quiet", "positive", {("cleanliness", "positive"), ("noise", "positive")}),
    ("staff were rude", "negative", {("staff", "negative")}),
    ("great location", "positive", {("location", "positive")}),
    ("expensive for what it is", "negative", {("value_for_money", "negative")}),
    ("The wifi kept dropping", "negative", {("wifi", "negative")}),
])
def test_tricky_phrases(text, polarity, expected):
    assert classify_text(text, polarity) == expected


@pytest.mark.parametrize("text,expected", [
    ("not clean", {("cleanliness", "negative")}),
    ("It wasn't quiet", {("noise", "negative")}),
    ("Room was not very clean", {("cleanliness", "negative")}),
    ("Not far from the station, clean", {("location", "positive"), ("cleanliness", "positive")}),
])
def test_negation_in_liked_text(text, expected):
    assert classify_text(text, "positive") == expected


def test_review_combines_both_sections():
    review = {"liked_text": "Great location", "disliked_text": "Aircon very loud."}
    assert classify_review(review) == [
        ("aircon_heating", "negative"), ("location", "positive"), ("noise", "negative")]


def test_empty_review_has_no_topics():
    assert classify_review({"liked_text": None, "disliked_text": None}) == []
