"""Shared utilities for all scrapers — HTTP-based (no Playwright)."""

import logging
import random
import re
import time

import requests

from gx470_scraper.config import USER_AGENTS, load_config

logger = logging.getLogger("gx470_scraper")

CONFIG = load_config()
VEHICLE = CONFIG["vehicle"]
SEARCH = CONFIG["search"]
SCRAPING = CONFIG["scraping"]


def random_delay() -> float:
    return random.uniform(SCRAPING["delay_min"], SCRAPING["delay_max"])


def random_user_agent() -> str:
    return random.choice(USER_AGENTS)


def get_session() -> requests.Session:
    """Create a requests.Session with realistic browser headers."""
    session = requests.Session()
    ua = random_user_agent()
    session.headers.update({
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    })
    return session


def fetch_with_retry(url: str, session: requests.Session | None = None,
                     max_retries: int | None = None,
                     timeout: int = 30) -> requests.Response | None:
    """Fetch a URL with retry and backoff. Returns Response or None."""
    if session is None:
        session = get_session()
    if max_retries is None:
        max_retries = SCRAPING.get("max_retries", 3)

    backoff = SCRAPING.get("backoff_seconds", [10, 30])

    for attempt in range(max_retries):
        try:
            resp = session.get(url, timeout=timeout, allow_redirects=True)

            if resp.status_code in (429, 503):
                wait = backoff[min(attempt, len(backoff) - 1)]
                logger.warning(
                    f"Rate limited (HTTP {resp.status_code}) on {url}. Waiting {wait}s..."
                )
                time.sleep(wait)
                continue

            if resp.status_code == 403:
                logger.warning(f"Access denied (HTTP 403) for {url}")
                return None

            resp.raise_for_status()
            return resp

        except requests.RequestException as e:
            if attempt < max_retries - 1:
                wait = backoff[min(attempt, len(backoff) - 1)]
                logger.warning(f"Request failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                logger.error(f"All {max_retries} attempts failed for {url}: {e}")

    return None


def is_captcha_page(content: str) -> bool:
    """Check if page content looks like a CAPTCHA challenge."""
    captcha_indicators = [
        "captcha", "recaptcha", "hcaptcha", "challenge-platform",
        "verify you are human", "are you a robot", "bot detection",
        "press & hold", "cf-challenge", "challenge-form",
    ]
    lower = content.lower()
    return any(indicator in lower for indicator in captcha_indicators)


class CaptchaDetectedError(Exception):
    pass


class RateLimitError(Exception):
    pass


def parse_price(text: str | None) -> float | None:
    if not text:
        return None
    cleaned = re.sub(r'[^\d.]', '', text)
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def parse_mileage(text: str | None) -> int | None:
    if not text:
        return None
    numbers = re.findall(r'[\d,]+', text)
    if numbers:
        try:
            return int(numbers[0].replace(",", ""))
        except ValueError:
            return None
    return None


def parse_year(text: str | None) -> int | None:
    if not text:
        return None
    match = re.search(r'(200[3-9])', text)
    if match:
        return int(match.group(1))
    return None
