"""Autolist scraper using requests + JSON/HTML parsing."""

import asyncio
import json
import logging
import re

from bs4 import BeautifulSoup

from .base import (
    SEARCH, VEHICLE, fetch_with_retry, get_session, is_captcha_page,
    parse_mileage, parse_price, parse_year,
)

logger = logging.getLogger("gx470_scraper")

SOURCE_NAME = "Autolist"


def build_url() -> str:
    return (
        f"https://www.autolist.com/lexus-gx+470"
        f"?zip={SEARCH['zip_code']}"
        f"&radius={SEARCH['radius_miles']}"
        f"&year_min={VEHICLE['year_min']}"
        f"&year_max={VEHICLE['year_max']}"
        f"&price_max={VEHICLE['max_price']}"
        f"&mileage_max={VEHICLE['max_mileage']}"
    )


async def scrape() -> list[dict]:
    return await asyncio.to_thread(_scrape_sync)


def _scrape_sync() -> list[dict]:
    url = build_url()
    logger.info(f"[{SOURCE_NAME}] Starting scrape: {url}")

    session = get_session()
    resp = fetch_with_retry(url, session=session)

    if not resp:
        logger.error(f"[{SOURCE_NAME}] Failed to fetch page")
        return []

    if is_captcha_page(resp.text):
        logger.warning(f"[{SOURCE_NAME}] CAPTCHA detected — skipping")
        return []

    # Try to extract JSON data embedded in page
    listings = _extract_from_json(resp.text)

    if not listings:
        soup = BeautifulSoup(resp.text, "html.parser")
        listings = _extract_from_html(soup)

    logger.info(f"[{SOURCE_NAME}] Scraped {len(listings)} raw listings")
    return listings


def _extract_from_json(html: str) -> list[dict]:
    """Extract listing data from embedded JSON."""
    listings = []

    patterns = [
        r'window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*</script>',
        r'"listings"\s*:\s*(\[[\s\S]*?\])\s*[,}]',
        r'"records"\s*:\s*(\[[\s\S]*?\])\s*[,}]',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, html)
        for match in matches:
            try:
                data = json.loads(match)
                items = []
                if isinstance(data, dict):
                    items = (
                        data.get("listings") or
                        data.get("records") or
                        data.get("results") or
                        []
                    )
                elif isinstance(data, list):
                    items = data

                for item in items:
                    listing = _parse_json_item(item)
                    if listing:
                        listings.append(listing)

                if listings:
                    return listings
            except (json.JSONDecodeError, TypeError):
                continue

    return listings


def _parse_json_item(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None

    listing = {"source": SOURCE_NAME}

    listing["title"] = (
        item.get("title") or
        f"{item.get('year', '')} {item.get('make', '')} {item.get('model', '')}".strip()
    )
    if not listing["title"]:
        return None

    price = item.get("price")
    if isinstance(price, (int, float)):
        listing["price"] = float(price)
    elif isinstance(price, str):
        listing["price"] = parse_price(price)
    else:
        listing["price"] = None

    mileage = item.get("mileage")
    if isinstance(mileage, (int, float)):
        listing["mileage"] = int(mileage)
    elif isinstance(mileage, str):
        listing["mileage"] = parse_mileage(mileage)
    else:
        listing["mileage"] = None

    listing["year"] = item.get("year") or parse_year(listing["title"])

    url = item.get("url") or item.get("link") or ""
    if url and not url.startswith("http"):
        url = f"https://www.autolist.com{url}"
    listing["url"] = url

    listing["city"] = item.get("city") or ""
    listing["state"] = item.get("state") or ""
    listing["seller_type"] = item.get("seller_type") or "dealer"

    photos = item.get("photos") or item.get("images") or []
    listing["photo_url"] = None
    if photos and isinstance(photos, list):
        first = photos[0]
        if isinstance(first, dict):
            listing["photo_url"] = first.get("url") or first.get("src")
        elif isinstance(first, str):
            listing["photo_url"] = first

    listing["date_posted"] = item.get("first_seen") or item.get("created_at")
    listing["posted_date_unknown"] = listing["date_posted"] is None

    return listing


def _extract_from_html(soup: BeautifulSoup) -> list[dict]:
    """Fallback HTML parsing."""
    listings = []

    cards = soup.select(
        '[class*="ListingCard"], '
        '[class*="listing-card"], '
        '[data-testid="listing"], '
        'article'
    )

    for card in cards:
        try:
            listing = {"source": SOURCE_NAME}

            title_el = card.select_one("h2, h3, [class*='title'], [class*='Title']")
            if title_el:
                listing["title"] = title_el.get_text(strip=True)
            else:
                text = card.get_text(strip=True)
                first_line = text.split('\n')[0].strip()
                if first_line and len(first_line) > 5:
                    listing["title"] = first_line
                else:
                    continue

            if not listing.get("title"):
                continue

            link = card.select_one("a[href]")
            if link:
                href = link.get("href", "")
                listing["url"] = (
                    href if href.startswith("http")
                    else f"https://www.autolist.com{href}"
                )
            else:
                listing["url"] = ""

            price_el = card.select_one("[class*='price'], [class*='Price']")
            if price_el:
                listing["price"] = parse_price(price_el.get_text())

            text = card.get_text()
            mi_match = re.search(r'([\d,]+)\s*mi', text, re.I)
            if mi_match:
                listing["mileage"] = parse_mileage(mi_match.group(1))

            listing["year"] = parse_year(listing.get("title", ""))

            loc_el = card.select_one("[class*='location'], [class*='Location']")
            if loc_el:
                loc_text = loc_el.get_text(strip=True)
                parts = loc_text.rsplit(",", 1)
                listing["city"] = parts[0].strip()
                listing["state"] = parts[1].strip() if len(parts) > 1 else ""
            else:
                listing["city"] = ""
                listing["state"] = ""

            listing["seller_type"] = "dealer"

            img = card.select_one("img")
            listing["photo_url"] = None
            if img:
                listing["photo_url"] = img.get("src") or img.get("data-src")

            listing["date_posted"] = None
            listing["posted_date_unknown"] = True

            listings.append(listing)
        except Exception as e:
            logger.debug(f"[{SOURCE_NAME}] Failed to parse card: {e}")

    return listings
