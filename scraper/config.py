"""Scraper configuration. Everything that is likely to change lives here."""
import os

PROPERTIES = [
    {"id": "paddington",      "name": "Olympic Hotel Paddington", "slug": "olympic-paddington"},
    {"id": "potts_point",     "name": "Potts Point",              "slug": "venus-potts-point-sydney"},
    {"id": "central_sydney",  "name": "Central Sydney",           "slug": "venus-surry-hills"},
    {"id": "darling_harbour", "name": "Darling Harbour",          "slug": "chateau-de-venus"},
]

# Booking.com loads the review list from this endpoint (same one the "See all reviews" panel uses).
REVIEW_LIST_URL = "https://www.booking.com/reviewlist.html"
PAGE_SIZE = 25
MAX_PAGES_PER_PROPERTY = int(os.getenv("MAX_PAGES", "40"))   # 40 x 25 = up to 1000 reviews

# Politeness / reliability
MIN_DELAY_S = 3.0
MAX_DELAY_S = 7.0
MAX_RETRIES = 4
TIMEOUT_S = 30
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)

# CSS selectors - kept in ONE place so a Booking.com layout change is a one-file fix.
SELECTORS = {
    "review_item":   "li.review_list_new_item_block",
    "score":         ".bui-review-score__badge",
    "title":         ".c-review-block__title",
    "review_date":   ".c-review-block__right .c-review-block__date",
    "reviewer_name": ".bui-avatar-block__title",
    "country":       ".bui-avatar-block__subtitle",
    "room_type":     ".c-review-block__room-link .bui-list__body",
    "stay_info":     ".c-review-block__stay-date .c-review-block__date",
    "nights":        ".c-review-block__stay-date",
    "traveller":     ".review-panel-wide__traveller_type .bui-list__body",
    "review_rows":   ".c-review__row",
    "review_text":   ".c-review__body",
    "negative_row_class": "lalala",          # Booking marks the "disliked" row with this class
}

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
