# Booking.com Review Insights - Azzurro Hotels

Collects public Booking.com guest reviews for four Azzurro properties and turns them into a
dashboard that operations staff can use without technical knowledge.

> Work in progress - sections marked TODO will be filled in as the build continues.

## Architecture

```
scraper (Python)  --upsert-->  Supabase Postgres  <--read-only (RLS)--  dashboard (Next.js)
     ^ scheduled daily (GitHub Actions)
```

| Folder | What it is |
|---|---|
| `scraper/` | Fetches review pages, parses them, de-duplicates, stores them |
| `supabase/schema.sql` | Tables, indexes, seed data for the 4 properties, read-only policies |
| `data/` | Sample review data collected from the listed properties |
| `dashboard/` | TODO |

## Review collection method

- Booking.com has no public API, so we use the same paginated review-list endpoint the
  website's own "See all reviews" panel loads (`/reviewlist.html`), sorted newest first.
  This returns lightweight HTML fragments and is more stable than parsing the full hotel page.
- **No duplicates:** each review gets a `review_key` - Booking's own review id when present,
  otherwise a SHA-256 hash of property + reviewer + date + title + text. It is the primary key,
  and every write is an upsert.
- **Incremental updates:** newest-first sorting means a normal run stops as soon as it hits a
  page of reviews already stored. `--full` re-walks everything for a backfill.
- **Errors and temporary failures:** retries with exponential backoff on timeouts, 429 and 5xx;
  one property failing does not stop the others; every run is logged in `scrape_runs`.
- **Page changes:** all CSS selectors live in `scraper/config.py`. If a page clearly contains
  reviews but nothing parses, the run is marked `LAYOUT CHANGED` and the raw HTML is saved to
  `data/debug/` instead of silently storing zero reviews.
- **Politeness:** 3-7s random delay between requests, one request at a time. If Booking
  shows a CAPTCHA/bot check, the run stops - we never try to bypass it.

## Setup

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q                     # parser tests (offline)
python main.py --full         # first backfill
python main.py                # later runs: only new reviews
```

Without `SUPABASE_*` env vars, reviews are saved to `data/reviews.jsonl` (handy for testing).
With them set (see `.env.example`), data goes to Supabase. Run `supabase/schema.sql` once in
the Supabase SQL editor first.

## Known limitations (so far)

- Scraping depends on Booking.com's markup; selectors may need updating if it changes.
- Booking may rate-limit or block cloud IPs (e.g. GitHub Actions runners). Running from a
  residential/office IP is more reliable.
- Review date has day precision only; weekly KPIs use the review date, not the stay date.
- Only English-interface text is collected (`lang=en-gb`); reviews written in other languages
  appear as Booking shows them.
- Collecting data this way may conflict with Booking.com's terms of use; only public review
  content is collected, slowly, and reviewer names are stored as shown (first name only).
