# Booking.com Review Insights - Azzurro Hotels

Collects public Booking.com guest reviews for four Azzurro properties in Sydney, tags each review
with the topics guests talk about, and shows the result in a dashboard that hotel operations staff
can use without technical knowledge.

## Architecture

```
                    daily (GitHub Actions, or a local scheduled task)
                                     |
  Booking.com hotel page  --->  scraper (Python + Playwright)
   (reviews panel, JS)            browser.py   open page, open reviews, sort newest, paginate
                                  parser.py    review cards -> clean rows, dedup key, quality checks
                                  classify.py  keyword rules -> topics per review
                                  store.py     upsert
                                     |
                                     v
                           Supabase Postgres
              properties / reviews / review_topics / scrape_runs
                     view: reviews_with_topics (read-only)
                                     |
                      publishable key + row level security
                                     v
                     dashboard (Next.js 14, Recharts)
```

## Folder structure

| Path | What it is |
|---|---|
| `scraper/config.py` | Properties, URLs, delays, and **all page selectors** in one place |
| `scraper/browser.py` | Playwright navigation (no parsing) |
| `scraper/parser.py` | Pure HTML -> review rows (unit tested offline) |
| `scraper/classify.py` | Topic rules (one dict at the top) and the classifier |
| `scraper/store.py` | Supabase store, or a local file store when no keys are set |
| `scraper/export_sample.py` | Writes `data/sample_reviews.csv` / `.json` |
| `scraper/tests/` | pytest tests for parser and classifier |
| `supabase/schema.sql` | Tables, seed data for the 4 properties, read-only policies |
| `supabase/migrations/` | `002_quality.sql` (skipped count), `003_views.sql` (dashboard view) |
| `dashboard/` | Next.js dashboard; all calculations in `dashboard/lib/metrics.ts` |
| `data/` | Sample review data exported from a real run |
| `.github/workflows/scrape.yml` | Daily scheduled scrape |

## Setup

**Database (once).** In Supabase -> SQL Editor, paste and run, in this order:
`supabase/schema.sql`, `supabase/migrations/002_quality.sql`, `supabase/migrations/003_views.sql`.

**Keys.** Copy `.env.example` to `.env` in the repo root and fill in `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_...` key - scraper only, never commit it).
Copy `dashboard/.env.local.example` to `dashboard/.env.local` and fill in the URL and the
publishable `sb_publishable_...` key.

**Scraper - Windows (PowerShell)**

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
```

**Scraper - macOS / Linux**

```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

**Dashboard (any OS)**

```bash
cd dashboard
npm install
```

## Running

```bash
# scraper (from scraper/, venv active)
python main.py --full                 # first backfill: every page of every property
python main.py                        # daily run: stops at the first page it has already stored
python main.py --only paddington      # one property
python classify.py --all              # re-tag every review (also runs at the end of main.py)
python export_sample.py               # write data/sample_reviews.csv and .json
pytest -q                             # parser + classifier tests (offline)

# dashboard (from dashboard/)
npm run dev                           # http://localhost:3000
npm test                              # metrics tests (vitest)
npm run build                         # production build
```

A Chromium window opens while the scraper runs - that is expected (see "Collection method").

Without `SUPABASE_*` in `.env` the scraper stores to `data/reviews.jsonl` and the dashboard reads
`data/sample_reviews.json`, so everything can be tried without a database.

## Data model

| Table | Purpose | Key columns |
|---|---|---|
| `properties` | The 4 hotels | `id`, `name`, `booking_slug` |
| `reviews` | One row per review | `review_key` (PK, dedup hash), `property_id`, `score` (1-10), `title`, `liked_text`, `disliked_text`, `traveller_type`, `room_type`, `nights`, `stay_month`, `review_date`, `sentiment`, `first_seen_at`, `last_seen_at` |
| `review_topics` | Topics per review | `review_key`, `topic`, `polarity` (positive / negative) |
| `scrape_runs` | One row per property per run | `status` (ok / partial / failed), `pages_fetched`, `reviews_seen`, `reviews_new`, `reviews_skipped`, `error` |
| `reviews_with_topics` (view) | What the dashboard reads | review columns + `positive_topics text[]` + `negative_topics text[]` |

Row level security allows anyone with the publishable key to **read** only. Writes need the secret key.

## Collection method

- **Why a browser.** Booking.com has no public review API and retired the old `/reviewlist.html`
  endpoint. Reviews are loaded by JavaScript inside the hotel page, so the scraper drives a real
  Chromium with Playwright: open the hotel page, click "Read all reviews", choose "Newest first",
  read the 10 review cards, click "Next page", repeat.
- **Why a visible window.** Booking returns an empty review panel to headless Chromium. The scraper
  runs an ordinary, unmodified browser window instead (`HEADLESS=1` switches it back). It does not
  disguise itself.
- **Selectors.** Booking's CSS class names are random and change often, so every selector uses a
  `data-testid` attribute and they all live in `scraper/config.py`.
- **No duplicates.** The cards carry no review id, so `review_key` is a SHA-256 hash of property +
  reviewer + date + title + text. It is the primary key and every write is an upsert, so re-running
  never creates duplicates.
- **Incremental.** Reviews are sorted newest first, so a normal run stops at the first page where
  every review is already stored. `--full` walks everything.
- **Retries.** Opening the page and each "Next page" click retry with a growing wait. One property
  failing does not stop the others; a run that got some reviews is `partial`, none is `failed`.
- **Quality checks.** Cards without a usable date or score are skipped and counted in
  `scrape_runs.reviews_skipped`; "Nothing" / "N/A" answers are dropped; scores must be 1-10.
- **Layout-change detection.** If review markup is present but no card (or nothing inside the
  cards) can be read, the run is marked `LAYOUT CHANGED`, the HTML is saved to `data/debug/`, and
  nothing is stored - rather than silently saving zero reviews.
- **No CAPTCHA bypass.** If Booking shows a bot check the run stops and records it. Requests are
  one at a time with a 2-4 second pause between pages.

## Classification method

`scraper/classify.py` holds one dictionary, `TOPIC_RULES`, mapping each topic to keyword patterns:
cleanliness, check_in, staff, noise, facilities, location, room_condition, value_for_money,
aircon_heating, wifi. Remote check-in wording ("greeted by zoom call", "check in outsourced") is
under check_in.

- A topic found in the **liked** text is a positive mention; in the **disliked** text, a negative one.
- Simple negation in the liked text ("not clean", "wasn't quiet") flips the mention to negative.
- Results are written by deleting and re-inserting the topics for each review, so re-running is safe.

**Limitations**

- Keywords cannot read sarcasm ("great, another cold shower") or tone.
- Mixed sentences are tagged by the section they sit in, not by what they say ("clean but tiny"
  in the liked box counts both as positive).
- Negation only looks a few words back within the same clause, and only in the liked text.
- Review titles are not classified (they have no liked / disliked side).
- Non-English reviews are mostly missed - the keywords are English.
- One word can trigger two topics ("dirty bathroom" -> cleanliness and room condition). That is intended.

## Dashboard guide (for operations staff)

- **Top right:** choose a time period and a property. The page address changes with your choices,
  so you can bookmark or share exactly what you are looking at.
- **Cards:** the average rating this week, how it moved against last week, how many reviews came in,
  what share were negative (below 6), and how many need attention (5 or lower). If no reviews have
  arrived this week, the cards say so and show the last 30 days instead.
- **Colours:** green = 8 or above, amber = 6 to 7.9, red = below 6. Each badge also says Good / OK / Poor.
- **How each property is doing:** this week against last week, plus all-time figures and the most
  common complaint.
- **Charts:** average rating per week and number of reviews per week for the last 12 weeks.
- **What guests complain about:** the topics mentioned in negative reviews for the chosen period,
  with counts. With fewer than 3 negative reviews it says "Not enough reviews to judge".
- **Guest reviews:** the actual reviews. Filter by negative / neutral / positive, by topic, or search
  for a word such as "shower". Sort by newest or lowest score.
- **Bottom of the page:** when the data was last updated. A red banner at the top appears if the
  last update failed or is more than 48 hours old.

## Known limitations and assumptions

- **Terms of use.** Automated collection may conflict with Booking.com's terms. Only public review
  content is read, slowly, from an ordinary browser, and no bot check is bypassed. Get Booking's
  agreement (or use a partner API / export) before relying on this in production.
- **Reviews with text only.** The reviews panel lists fewer reviews than the headline count on the
  hotel page (for example 74 collected vs "129 reviews" for Paddington); score-only ratings without
  a card are not available to collect.
- **Review date, not stay date.** Weekly figures use the day the review was posted. Only the stay
  *month* is published.
- **Week boundaries.** Weeks run Monday-Sunday in Australia/Sydney time. Booking shows review dates
  without a time zone; they are treated as Sydney dates.
- **Small numbers.** A property may get only a handful of reviews a week, so weekly averages and
  percentages swing a lot. Counts are always shown next to percentages.
- **Edited reviews.** If a guest edits a review its hash changes and it is stored as a new row.
- **Reviewer names** are stored as publicly shown (first name).
- **Datacenter IPs.** Booking may block or challenge cloud IPs such as GitHub Actions runners. If the
  scheduled workflow comes back `partial` / `failed`, run the scraper from an office PC instead:
  Windows Task Scheduler -> daily ->
  `C:\path\to\repo\scraper\.venv\Scripts\python.exe main.py` (start in `scraper\`), or cron on macOS/Linux.

## Automation

`.github/workflows/scrape.yml` runs daily and on demand ("Run workflow"). Add two repository secrets:
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Deploying the dashboard to Vercel

1. vercel.com -> Add New -> Project -> import this GitHub repository.
2. Set **Root Directory** to `dashboard` (framework: Next.js is detected).
3. Add environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (the publishable key - never the secret key).
4. Deploy. The page re-reads the database at most every 5 minutes.

## What I'd do next

- Alert (email / Teams) when a review scoring 5 or lower arrives, or when a run fails.
- Replace keyword rules with an LLM or a small trained classifier, keeping the keywords as a fallback,
  and measure accuracy on a hand-labelled sample.
- Capture management responses and the per-category scores (staff, cleanliness, ...) from the page.
- Track reviews that disappear (`last_seen_at` stops moving) and detect edited reviews.
- Add other sources (Google, Tripadvisor, Expedia) behind the same schema.
- Put a login in front of the dashboard if the data should not be publicly readable.
