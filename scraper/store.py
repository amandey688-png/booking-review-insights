"""Storage layer. Uses Supabase if credentials are set, otherwise a local JSONL file.

Local mode means the scraper can be tested without any database account.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import config

log = logging.getLogger("store")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class LocalStore:
    def __init__(self, path: Path = DATA_DIR / "reviews.jsonl"):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.rows: dict[str, dict] = {}
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    r = json.loads(line)
                    self.rows[r["review_key"]] = r

    def existing_keys(self, property_id: str) -> set[str]:
        return {k for k, r in self.rows.items() if r["property_id"] == property_id}

    def upsert_reviews(self, reviews: list[dict]) -> int:
        now = datetime.now(timezone.utc).isoformat()
        new = 0
        for r in reviews:
            if r["review_key"] in self.rows:
                self.rows[r["review_key"]]["last_seen_at"] = now
            else:
                self.rows[r["review_key"]] = {**r, "first_seen_at": now, "last_seen_at": now}
                new += 1
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in self.rows.values()) + "\n",
                       encoding="utf-8")
        tmp.replace(self.path)   # atomic write - a crash never leaves a half-written file
        return new

    def start_run(self, property_id: str) -> int | None:
        return None

    def finish_run(self, run_id, **fields) -> None:
        log.info("run summary: %s", fields)


class SupabaseStore:
    def __init__(self):
        from supabase import create_client
        self.db = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

    def existing_keys(self, property_id: str) -> set[str]:
        keys, start = set(), 0
        while True:
            res = (self.db.table("reviews").select("review_key")
                   .eq("property_id", property_id).range(start, start + 999).execute())
            keys.update(r["review_key"] for r in res.data)
            if len(res.data) < 1000:
                return keys
            start += 1000

    def upsert_reviews(self, reviews: list[dict]) -> int:
        if not reviews:
            return 0
        known = self.existing_keys(reviews[0]["property_id"])
        now = datetime.now(timezone.utc).isoformat()
        rows = [{**r, "last_seen_at": now} for r in reviews]
        self.db.table("reviews").upsert(rows, on_conflict="review_key").execute()
        return sum(1 for r in reviews if r["review_key"] not in known)

    def start_run(self, property_id: str) -> int:
        res = self.db.table("scrape_runs").insert({"property_id": property_id}).execute()
        return res.data[0]["id"]

    def finish_run(self, run_id, **fields) -> None:
        fields["finished_at"] = datetime.now(timezone.utc).isoformat()
        self.db.table("scrape_runs").update(fields).eq("id", run_id).execute()


def get_store():
    if config.SUPABASE_URL and config.SUPABASE_SERVICE_KEY:
        log.info("Using Supabase store")
        return SupabaseStore()
    log.info("SUPABASE_* env vars not set - using local file data/reviews.jsonl")
    return LocalStore()
