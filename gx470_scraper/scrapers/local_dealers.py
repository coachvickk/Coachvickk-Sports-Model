"""Local dealer inventory scraper using requests + BeautifulSoup."""

import asyncio
import logging
import re
import time
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .base import (
    fetch_with_retry, get_session, is_captcha_page,
    parse_mileage, parse_price, parse_year, random_delay,
)
from ..config import load_dealers

logger = logging.getLogger("gx470_scraper")

SOURCE_NAME = "Local Dealer"


async def scrape() -> list[dict]:
    return await asyncio.to_thread(_scrape_sync)


def _scrape_sync() -> list[dict]:
    dealers = load_dealers()
    all_listings = []

    session = get_session()

    for dealer in dealers:
        name = dealer["name"]
        url = dealer["url"]
        logger.info(f"[{SOURCE_NAME}] Scraping {name}: {url}")

        try:
            listings = _scrape_dealer(session, name, url)
            all_listings.extend(listings)
            logger.info(f"[{SOURCE_NAME}] {name}: {len(listings)} listings found")
        except Exception as e:
            logger.error(f"[{SOURCE_NAME}] {name} failed: {e}", exc_info=True)

        time.sleep(random_delay())

    logger.info(f"[{SOURCE_NAME}] Total: {len(all_listings)} raw listings")
    return all_listings


def _scrape_dealer(session, name: str, url: str) -> list[dict]:
    resp = fetch_with_retry(url, session=session)

    if not resp:
        logger.warning(f"[{SOURCE_NAME}] {name}: Failed to fetch {url}")
        return []

    if is_captcha_page(resp.text):
        logger.warning(f"[{SOURCE_NAME}] {name}: CAPTCHA detected — skipping")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    listings = []

    # Generic card detection for dealer sites
    cards = soup.select(
        '[class*="vehicle-card"], '
        '[class*="inventory-listing"], '
        '[class*="srp-listing"], '
        '[class*="vehicle_card"], '
        '[class*="VehicleCard"], '
        'div[class*="listing"]'
    )

    if not cards:
        # Broader fallback
        cards = soup.select(
            'a[href*="vehicle"], '
            'a[href*="inventory"], '
            'a[href*="VehicleDetail"], '
            'a[href*="used-"]'
        )

    for card in cards:
        try:
            listing = _parse_card(card, name, url)
            if listing:
                listings.append(listing)
        except Exception as e:
            logger.debug(f"[{SOURCE_NAME}] {name}: Failed to parse card: {e}")

    return listings


def _parse_card(card, dealer_name: str, base_url: str) -> dict | None:
    listing = {"source": f"{SOURCE_NAME} - {dealer_name}"}

    text = card.get_text(strip=True)
    if not text or len(text) < 5:
        return None

    # Title
    title_el = card.select_one(
        "h2, h3, h4, [class*='title'], [class*='Title'], "
        "[class*='name'], [class*='Name'], .vehicle-title"
    )
    if title_el:
        listing["title"] = title_el.get_text(strip=True)
    else:
        first_line = text.split('\n')[0].strip()
        if len(first_line) > 5:
            listing["title"] = first_line

    if not listing.get("title"):
        return None

    # Quick GX470 check
    title_lower = listing["title"].lower()
    if "gx" not in title_lower and "lexus" not in title_lower:
        return None

    # URL
    link = card.select_one("a[href]")
    if link:
        href = link.get("href", "")
        if href.startswith("http"):
            listing["url"] = href
        elif href.startswith("/"):
            parsed = urlparse(base_url)
            listing["url"] = f"{parsed.scheme}://{parsed.netloc}{href}"
        else:
            listing["url"] = f"{base_url.rstrip('/')}/{href}"
    else:
        listing["url"] = base_url

    # Price
    price_el = card.select_one(
        "[class*='price'], [class*='Price'], [class*='amount']"
    )
    if price_el:
        listing["price"] = parse_price(price_el.get_text())
    else:
        price_match = re.search(r'\$[\d,]+', text)
        if price_match:
            listing["price"] = parse_price(price_match.group())

    # Mileage
    mileage_el = card.select_one(
        "[class*='mileage'], [class*='Mileage'], [class*='miles']"
    )
    if mileage_el:
        listing["mileage"] = parse_mileage(mileage_el.get_text())
    else:
        mi_match = re.search(r'([\d,]+)\s*mi', text, re.I)
        if mi_match:
            listing["mileage"] = parse_mileage(mi_match.group(1))

    listing["year"] = parse_year(listing.get("title", ""))
    listing["city"] = dealer_name
    listing["state"] = ""
    listing["seller_type"] = "dealer"

    img = card.select_one("img")
    listing["photo_url"] = None
    if img:
        listing["photo_url"] = img.get("src") or img.get("data-src")

    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing
