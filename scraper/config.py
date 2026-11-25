"""Scraper configuration. Everything that is likely to change lives here."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PROPERTIES = [
    {"id": "paddington",      "name": "Olympic Hotel Paddington", "slug": "olympic-paddington"},
    {"id": "potts_point",     "name": "Potts Point",              "slug": "venus-potts-point-sydney"},
    {"id": "central_sydney",  "name": "Central Sydney",           "slug": "venus-surry-hills"},
    {"id": "darling_harbour", "name": "Darling Harbour",          "slug": "chateau-de-venus"},
]

HOTEL_URL = "https://www.booking.com/hotel/au/{slug}.en-gb.html"
PAGE_SIZE = 10                                               # Booking shows 10 reviews per page
MAX_PAGES_PER_PROPERTY = int(os.getenv("MAX_PAGES", "100"))  # 100 x 10 = up to 1000 reviews

# Booking serves an empty review panel to headless Chromium, so a visible window is the default.
# On a server without a display, run under xvfb (see .github/workflows/scrape.yml).
HEADLESS = os.getenv("HEADLESS", "0") == "1"

# Politeness / reliability
MIN_DELAY_S = 2.0
MAX_DELAY_S = 4.0
MAX_RETRIES = 3
TIMEOUT_MS = 30_000

# Selectors - kept in ONE place so a Booking.com layout change is a one-file fix.
# data-testid attributes are used because Booking's CSS class names are random and change often.
SELECTORS = {
    "open_reviews":  ['[data-testid="fr-read-all-reviews"]', '[data-testid="review-score-read-all"]'],
    "sorter":        '[data-testid="reviews-sorter-component"]',
    "sort_newest":   "NEWEST_FIRST",
    "next_page":     'button[aria-label="Next page"]',
    "review_item":   '[data-testid="review-card"]',
    "reviewer_name": '[data-testid="review-avatar"] h4',
    "country":       '[data-testid="review-avatar"] span',
    "room_type":     '[data-testid="review-room-name"]',
    "nights":        '[data-testid="review-num-nights"]',
    "stay_month":    '[data-testid="review-stay-date"]',
    "traveller":     '[data-testid="review-traveler-type"]',
    "review_date":   '[data-testid="review-date"]',
    "title":         '[data-testid="review-title"]',
    "score":         '[data-testid="review-score"]',
    "liked":         '[data-testid="review-positive-text"]',
    "disliked":      '[data-testid="review-negative-text"]',
}

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
