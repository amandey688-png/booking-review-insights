"""Polite HTTP fetching with retries and backoff."""
from __future__ import annotations

import logging
import random
import time

import httpx

import config

log = logging.getLogger("fetcher")


class BlockedError(Exception):
    """Booking.com returned a CAPTCHA / bot-check page. We stop instead of trying to bypass it."""


def _headers() -> dict:
    return {
        "User-Agent": config.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
    }


def polite_sleep() -> None:
    time.sleep(random.uniform(config.MIN_DELAY_S, config.MAX_DELAY_S))


def fetch_review_page(client: httpx.Client, slug: str, offset: int) -> str:
    params = {
        "pagename": slug,
        "cc1": "au",
        "type": "total",
        "lang": "en-gb",
        "sort": "f_recent_desc",   # newest first -> lets incremental runs stop early
        "rows": config.PAGE_SIZE,
        "offset": offset,
    }
    last_err: Exception | None = None
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            r = client.get(config.REVIEW_LIST_URL, params=params, headers=_headers(),
                           timeout=config.TIMEOUT_S, follow_redirects=True)
            if r.status_code == 200:
                body = r.text
                if "captcha" in body.lower() or "px-captcha" in body.lower():
                    raise BlockedError(f"Bot-check page for {slug} (offset {offset})")
                return body
            if r.status_code in (429, 500, 502, 503, 504):
                last_err = httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
            else:
                r.raise_for_status()
        except (httpx.TransportError, httpx.TimeoutException) as e:
            last_err = e
        wait = (2 ** attempt) + random.uniform(0, 2)
        log.warning("%s offset=%s attempt %s failed (%s); retrying in %.1fs",
                    slug, offset, attempt, last_err, wait)
        time.sleep(wait)
    raise RuntimeError(f"Giving up on {slug} offset={offset}: {last_err}")
