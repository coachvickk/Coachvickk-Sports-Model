"""Craigslist scraper using requests + BeautifulSoup.

Searches all metro areas defined in config.yaml.
"""

import logging
import re
import time

from bs4 import BeautifulSoup

from .base import (
    SCRAPING, VEHICLE, fetch_with_retry, get_session, is_captcha_page,
    parse_mileage, parse_price, parse_year, random_delay,
)
from ..config import load_config

logger = logging.getLogger("gx470_scraper")

SOURCE_NAME = "Craigslist"

CONFIG = load_config()
SEARCH = CONFIG["search"]
METROS = CONFIG.get("craigslist_metros", [])


def build_url(subdomain: str) -> str:
    return (
        f"https://{subdomain}.craigslist.org/search/cta"
        f"?auto_make_model=lexus+gx+470"
        f"&min_auto_year={VEHICLE['year_min']}"
        f"&max_auto_year={VEHICLE['year_max']}"
        f"&max_price={VEHICLE['max_price']}"
        f"&max_auto_miles={VEHICLE['max_mileage']}"
        f"&sort=date"
    )


def _scrape_metro(session, url: str, metro_name: str) -> list[dict]:
    listings = []

    resp = fetch_with_retry(url, session=session)

    if not resp:
        logger.warning(f"[{SOURCE_NAME}] {metro_name}: Failed to fetch")
        return []

    if is_captcha_page(resp.text):
        logger.warning(f"[{SOURCE_NAME}] {metro_name}: CAPTCHA detected — skipping")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Handle both old and new Craigslist layouts
    results = soup.select(
        "li.cl-static-search-result, "
        "li.cl-search-result, "
        ".result-row, "
        "li.cl-search-result-item"
    )

    for result in results:
        try:
            listing = _parse_result(result, metro_name)
            if listing:
                listings.append(listing)
        except Exception as e:
            logger.debug(f"[{SOURCE_NAME}] Failed to parse result: {e}")

    return listings


def _parse_result(result, metro_name: str) -> dict | None:
    listing = {"source": SOURCE_NAME}

    # Title — try multiple selectors for old/new layouts
    title_el = result.select_one(
        ".title, .titlestring, a.titlestring, .result-title, "
        "a.posting-title .label, a.posting-title, .cl-app-anchor"
    )
    if title_el:
        listing["title"] = title_el.get_text(strip=True)
    else:
        # Last resort: grab all text from the element
        text = result.get_text(strip=True)
        if text and len(text) > 5:
            listing["title"] = text.split('\n')[0][:120]
        else:
            return None

    if not listing.get("title"):
        return None

    # URL
    link_el = result.select_one("a[href]")
    if link_el:
        href = link_el.get("href", "")
        listing["url"] = href if href.startswith("http") else f"https://craigslist.org{href}"
    else:
        listing["url"] = ""

    # Price
    price_el = result.select_one(".priceinfo, .result-price, .price")
    if price_el:
        listing["price"] = parse_price(price_el.get_text(strip=True))
    else:
        # Try to find price in text
        text = result.get_text()
        price_match = re.search(r'\$[\d,]+', text)
        if price_match:
            listing["price"] = parse_price(price_match.group())

    # Mileage — often in metadata
    meta_el = result.select_one(".meta, .result-meta, .details")
    if meta_el:
        meta_text = meta_el.get_text()
        mileage_match = re.search(r"([\d,]+)\s*mi", meta_text)
        if mileage_match:
            listing["mileage"] = parse_mileage(mileage_match.group(1))

    if not listing.get("mileage"):
        full_text = result.get_text()
        mileage_match = re.search(r"([\d,]+)\s*mi", full_text)
        if mileage_match:
            listing["mileage"] = parse_mileage(mileage_match.group(1))

    # Year
    listing["year"] = parse_year(listing.get("title", ""))

    # Location
    loc_el = result.select_one(
        ".meta .location, .result-hood, .nearby, .subreddit"
    )
    if loc_el:
        listing["city"] = loc_el.get_text(strip=True).strip("()")
    else:
        listing["city"] = metro_name

    listing["state"] = ""
    listing["seller_type"] = "private"

    # Photo
    img_el = result.select_one("img")
    if img_el:
        listing["photo_url"] = img_el.get("src") or img_el.get("data-src")
    else:
        listing["photo_url"] = None

    # Posted date
    time_el = result.select_one("time, [datetime]")
    if time_el:
        dt_str = time_el.get("datetime") or time_el.get("title")
        if dt_str:
            listing["date_posted"] = dt_str[:10]  # YYYY-MM-DD
            listing["posted_date_unknown"] = False
        else:
            listing["date_posted"] = None
            listing["posted_date_unknown"] = True
    else:
        listing["date_posted"] = None
        listing["posted_date_unknown"] = True

    return listing


def scrape_sync() -> list[dict]:
    """Synchronous scrape of all Craigslist metros."""
    all_listings = []
    session = get_session()

    for metro in METROS:
        name = metro["name"]
        subdomain = metro["subdomain"]
        url = build_url(subdomain)
        logger.info(f"[{SOURCE_NAME}] Scraping {name}: {url}")

        try:
            listings = _scrape_metro(session, url, name)
            all_listings.extend(listings)
            logger.info(f"[{SOURCE_NAME}] {name}: {len(listings)} listings found")
        except Exception as e:
            logger.error(f"[{SOURCE_NAME}] {name} failed: {e}", exc_info=True)

        time.sleep(random_delay())

    logger.info(f"[{SOURCE_NAME}] Total: {len(all_listings)} raw listings")
    return all_listings


async def scrape() -> list[dict]:
    """Async wrapper around the synchronous Craigslist scraper."""
    import asyncio
    return await asyncio.to_thread(scrape_sync)
