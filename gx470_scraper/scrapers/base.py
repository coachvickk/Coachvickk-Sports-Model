"""Shared utilities for all scrapers."""

import asyncio
import logging
import random
import time
from functools import wraps

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


def is_captcha_page(content: str) -> bool:
    captcha_indicators = [
        "captcha", "recaptcha", "hcaptcha", "challenge-platform",
        "verify you are human", "are you a robot", "bot detection",
        "press & hold", "cf-challenge", "challenge-form",
    ]
    lower = content.lower()
    return any(indicator in lower for indicator in captcha_indicators)


def is_rate_limited(status_code: int) -> bool:
    return status_code in (429, 503, 403)


async def retry_with_backoff(coro_func, max_retries: int = 3,
                              backoff_seconds: list[int] | None = None):
    """Retry an async callable with exponential backoff.

    coro_func should be a zero-argument async callable that returns a result.
    """
    if backoff_seconds is None:
        backoff_seconds = SCRAPING.get("backoff_seconds", [10, 30])

    last_error = None
    for attempt in range(max_retries):
        try:
            return await coro_func()
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                wait = backoff_seconds[min(attempt, len(backoff_seconds) - 1)]
                logger.warning(
                    f"Attempt {attempt + 1} failed: {e}. Retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
            else:
                logger.error(f"All {max_retries} attempts failed: {e}")
    raise last_error


async def setup_stealth_page(browser, url: str):
    """Create a new stealth page, navigate to url, and return (page, content).

    Raises on CAPTCHA detection or rate limiting.
    """
    context = await browser.new_context(
        user_agent=random_user_agent(),
        viewport={"width": 1920, "height": 1080},
        locale="en-US",
    )
    page = await context.new_page()

    # Add stealth scripts
    await page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
        window.chrome = {runtime: {}};
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({state: Notification.permission})
                : originalQuery(parameters);
    """)

    await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(random_delay())

    content = await page.content()

    if is_captcha_page(content):
        await context.close()
        raise CaptchaDetectedError(f"CAPTCHA detected on {url}")

    return page, context, content


class CaptchaDetectedError(Exception):
    pass


class RateLimitError(Exception):
    pass


def parse_price(text: str | None) -> float | None:
    if not text:
        return None
    cleaned = text.replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_mileage(text: str | None) -> int | None:
    if not text:
        return None
    import re
    numbers = re.findall(r"[\d,]+", text.replace(",", ""))
    if not numbers:
        # Try with commas
        numbers = re.findall(r"[\d]+", text.replace(",", ""))
    if numbers:
        try:
            return int(numbers[0].replace(",", ""))
        except ValueError:
            return None
    return None


def parse_year(text: str | None) -> int | None:
    if not text:
        return None
    import re
    match = re.search(r"(200[3-9])", text)
    if match:
        return int(match.group(1))
    return None
