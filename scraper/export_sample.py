"""Exports every stored review (with its topics) to data/sample_reviews.csv and .json.

  python export_sample.py
"""
from __future__ import annotations

import csv
import json

from store import DATA_DIR, get_store


def build_rows(reviews: list[dict], topics: dict[str, list[list[str]]]) -> list[dict]:
    """Same shape as the reviews_with_topics database view."""
    rows = []
    for r in sorted(reviews, key=lambda r: (r["review_date"], r["review_key"]), reverse=True):
        pairs = topics.get(r["review_key"], [])
        rows.append({
            **r,
            "positive_topics": sorted(t for t, p in pairs if p == "positive"),
            "negative_topics": sorted(t for t, p in pairs if p == "negative"),
        })
    return rows


def main() -> None:
    store = get_store()
    rows = build_rows(store.all_reviews(), store.topics())
    if not rows:
        raise SystemExit("No reviews stored yet - run main.py first")
    (DATA_DIR / "sample_reviews.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(DATA_DIR / "sample_reviews.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows({**r, "positive_topics": "|".join(r["positive_topics"]),
                     "negative_topics": "|".join(r["negative_topics"])} for r in rows)
    print(f"Exported {len(rows)} reviews to {DATA_DIR / 'sample_reviews.csv'} and .json")


if __name__ == "__main__":
    main()
