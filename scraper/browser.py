"""Drives a real Chromium window (Playwright) through a hotel's review panel.

Booking.com loads reviews with JavaScript inside the hotel page, so plain HTTP requests see
nothing. This module only navigates and hands back HTML; parsing lives in parser.py.
"""
from __future__ import annotations

import logging
import random
import time
from collections.abc import Iterator

from playwright.sync_api import Browser, Page, TimeoutError as PWTimeout, sync_playwright

import config
from config import SELECTORS as S

log = logging.getLogger("browser")


class BlockedError(Exception):
    """Booking.com showed a CAPTCHA / bot check. We stop instead of trying to get around it."""


class PanelNotFoundError(Exception):
    """The review panel could not be opened - usually a slow load, sometimes a layout change."""


def polite_sleep() -> None:
    time.sleep(random.uniform(config.MIN_DELAY_S, config.MAX_DELAY_S))


def launch(pw) -> Browser:
    return pw.chromium.launch(headless=config.HEADLESS)


def _check_blocked(page: Page, slug: str) -> None:
    if "captcha" in page.content().lower():
        raise BlockedError(f"Bot-check page shown for {slug}")


def _first_card_text(page: Page) -> str:
    # Read in one step inside the page: the list is re-rendered while a new page of reviews loads.
    return page.evaluate("sel => document.querySelector(sel)?.innerText ?? ''", S["review_item"])


def _wait_for_list_change(page: Page, before: str, timeout_s: float) -> bool:
    """True once the first review card differs from `before`."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        page.wait_for_timeout(300)
        if _first_card_text(page) != before:
            return True
    return False


def _open_panel(page: Page, slug: str) -> None:
    page.goto(config.HOTEL_URL.format(slug=slug), wait_until="domcontentloaded", timeout=60_000)
    try:
        page.wait_for_selector(", ".join(S["open_reviews"]), timeout=60_000)
    except PWTimeout:
        _check_blocked(page, slug)
        raise PanelNotFoundError(f"{slug}: 'read all reviews' button not found")
    page.wait_for_timeout(3000)   # let the page's own scripts attach click handlers
    for sel in S["open_reviews"]:
        try:
            page.locator(sel).first.click(timeout=8000)
            page.wait_for_selector(S["review_item"], timeout=15_000)
            return
        except PWTimeout:
            continue
    _check_blocked(page, slug)
    raise PanelNotFoundError(f"{slug}: review panel opened without any review cards")


def _sort_newest_first(page: Page) -> None:
    before = _first_card_text(page)
    page.select_option(S["sorter"], S["sort_newest"], timeout=config.TIMEOUT_MS)
    # The newest review may already be on top, so no change within 6s is fine.
    _wait_for_list_change(page, before, timeout_s=6)


def _go_next(page: Page) -> bool:
    """Clicks 'Next page'. False when there is no further page."""
    nxt = page.locator(S["next_page"])
    if not nxt.count() or nxt.first.is_disabled():
        return False
    before = _first_card_text(page)
    for _ in range(config.MAX_RETRIES):
        nxt.first.click(timeout=config.TIMEOUT_MS)
        if _wait_for_list_change(page, before, timeout_s=15):
            return True
        log.warning("page did not change after clicking next; retrying")
    raise RuntimeError("Next page did not load")


def iter_review_pages(browser: Browser, slug: str) -> Iterator[str]:
    """Yields the HTML of each page of reviews, newest first."""
    page = browser.new_page(locale="en-GB", viewport={"width": 1366, "height": 900})
    try:
        for attempt in range(1, config.MAX_RETRIES + 1):
            try:
                _open_panel(page, slug)
                break
            except (PanelNotFoundError, PWTimeout) as e:
                if attempt == config.MAX_RETRIES:
                    raise
                wait = 2 ** attempt * 3
                log.warning("%s attempt %s failed (%s); retrying in %ss", slug, attempt, e, wait)
                time.sleep(wait)
        _sort_newest_first(page)
        while True:
            html = page.locator(S["review_item"]).evaluate_all(
                "els => els.map(e => e.outerHTML).join('')")
            yield html
            polite_sleep()
            if not _go_next(page):
                return
    finally:
        page.close()


__all__ = ["BlockedError", "PanelNotFoundError", "iter_review_pages", "launch", "polite_sleep",
           "sync_playwright"]
