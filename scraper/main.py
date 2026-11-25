"""Entry point.

  python main.py                 # incremental: stop when we reach reviews we already have
  python main.py --full          # backfill: walk every page (up to MAX_PAGES)
  python main.py --only paddington
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import classify
import config
from browser import BlockedError, iter_review_pages, launch, polite_sleep, sync_playwright
from parser import LayoutChangedError, parse_reviews
from store import get_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("scraper")
DEBUG_DIR = Path(__file__).resolve().parent.parent / "data" / "debug"

# Incremental mode: once a whole page is already known, older pages will be too.
STOP_AFTER_KNOWN_PAGES = 1


def scrape_property(browser, store, prop: dict, full: bool) -> dict:
    pid = prop["id"]
    run_id = store.start_run(pid)
    known = store.existing_keys(pid)
    stats = {"pages_fetched": 0, "reviews_seen": 0, "reviews_new": 0, "reviews_skipped": 0}
    known_pages = 0
    status, error = "ok", None

    try:
        for page_no, html in enumerate(iter_review_pages(browser, prop["slug"]), start=1):
            stats["pages_fetched"] += 1
            try:
                reviews, skipped = parse_reviews(html, pid)
            except LayoutChangedError:
                DEBUG_DIR.mkdir(parents=True, exist_ok=True)
                (DEBUG_DIR / f"{pid}_page{page_no}.html").write_text(html, encoding="utf-8")
                raise

            stats["reviews_seen"] += len(reviews)
            stats["reviews_skipped"] += skipped
            stats["reviews_new"] += store.upsert_reviews(reviews)

            if not full and all(r["review_key"] in known for r in reviews):
                known_pages += 1
                if known_pages >= STOP_AFTER_KNOWN_PAGES:
                    log.info("%s: reached already-stored reviews, stopping (incremental)", pid)
                    break
            if page_no >= config.MAX_PAGES_PER_PROPERTY:
                log.warning("%s: hit MAX_PAGES=%s, stopping", pid, config.MAX_PAGES_PER_PROPERTY)
                break
    except BlockedError as e:
        status, error = "partial", str(e)
        log.error("%s", e)
    except LayoutChangedError as e:
        status, error = "failed", f"LAYOUT CHANGED: {e}"
        log.error("%s - raw HTML saved in data/debug/", e)
    except Exception as e:  # keep other properties running
        status = "partial" if stats["reviews_seen"] else "failed"
        error = str(e)
        log.exception("%s failed", pid)

    store.finish_run(run_id, status=status, error=error, **stats)
    log.info("%s: %s | pages=%s seen=%s new=%s skipped=%s", pid, status, stats["pages_fetched"],
             stats["reviews_seen"], stats["reviews_new"], stats["reviews_skipped"])
    return {"property": pid, "status": status, **stats}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="walk all pages instead of stopping early")
    ap.add_argument("--only", help="scrape a single property id")
    args = ap.parse_args()

    store = get_store()
    props = [p for p in config.PROPERTIES if not args.only or p["id"] == args.only]
    results = []
    with sync_playwright() as pw:
        browser = launch(pw)
        for p in props:
            results.append(scrape_property(browser, store, p, args.full))
            polite_sleep()
        browser.close()

    log.info("classified topics for %s reviews", classify.classify_all(store))

    failed = [r for r in results if r["status"] == "failed"]
    print("\nSUMMARY")
    for r in results:
        print(f"  {r['property']:<16} {r['status']:<8} new={r['reviews_new']:<4} seen={r['reviews_seen']:<4} "
              f"skipped={r['reviews_skipped']}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
