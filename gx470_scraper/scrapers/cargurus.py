"""CarGurus scraper using requests + HTML/JSON parsing."""

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

SOURCE_NAME = "CarGurus"


def build_url() -> str:
    return (
        f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action"
        f"?zip={SEARCH['zip_code']}"
        f"&showNegotiable=true"
        f"&sortDir=ASC"
        f"&sourceContext=carGurusHomePageModel"
        f"&distance={SEARCH['radius_miles']}"
        f"&entitySelectingHelper.selectedEntity=d333"
        f"&maxPrice={VEHICLE['max_price']}"
        f"&maxMileage={VEHICLE['max_mileage']}"
        f"&startYear={VEHICLE['year_min']}"
        f"&endYear={VEHICLE['year_max']}"
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

    # Try JSON extraction first, then HTML fallback
    listings = _extract_from_json(resp.text)

    if not listings:
        soup = BeautifulSoup(resp.text, "html.parser")
        listings = _extract_from_html(soup)

    logger.info(f"[{SOURCE_NAME}] Scraped {len(listings)} raw listings")
    return listings


def _extract_from_json(html: str) -> list[dict]:
    """Extract listing data from embedded JSON in script tags."""
    listings = []

    # CarGurus embeds listing data in various patterns
    patterns = [
        r'"listings"\s*:\s*(\[[\s\S]*?\])\s*[,}]',
        r'"results"\s*:\s*(\[[\s\S]*?\])\s*[,}]',
        r'cg\.listing\.data\s*=\s*(\[[\s\S]*?\]);',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, html)
        for match in matches:
            try:
                items = json.loads(match)
                if not isinstance(items, list):
                    continue

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
        item.get("listingTitle") or
        item.get("title") or
        item.get("vehicleTitle") or
        ""
    )

    if not listing["title"]:
        year = item.get("year", "")
        make = item.get("makeName", item.get("make", ""))
        model = item.get("modelName", item.get("model", ""))
        listing["title"] = f"{year} {make} {model}".strip()

    if not listing["title"]:
        return None

    price = item.get("price") or item.get("expectedPrice") or item.get("listingPrice")
    if isinstance(price, (int, float)):
        listing["price"] = float(price)
    elif isinstance(price, str):
        listing["price"] = parse_price(price)
    else:
        listing["price"] = None

    mileage = item.get("mileage") or item.get("miles")
    if isinstance(mileage, (int, float)):
        listing["mileage"] = int(mileage)
    elif isinstance(mileage, str):
        listing["mileage"] = parse_mileage(mileage)
    else:
        listing["mileage"] = None

    listing["year"] = item.get("year") or parse_year(listing["title"])

    listing_id = item.get("id") or item.get("listingId") or ""
    if listing_id:
        listing["url"] = (
            f"https://www.cargurus.com/Cars/inventorylisting/"
            f"viewDetailsFilterViewInventoryListing.action?listingId={listing_id}"
        )
    else:
        listing["url"] = item.get("url") or item.get("listingUrl") or ""

    listing["city"] = item.get("city") or item.get("dealerCity") or ""
    listing["state"] = item.get("state") or item.get("dealerState") or ""
    listing["seller_type"] = "dealer"
    listing["photo_url"] = (
        item.get("photoUrl") or
        item.get("mainPictureUrl") or
        item.get("imageUrl") or
        item.get("pictureUrl")
    )
    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing


def _extract_from_html(soup: BeautifulSoup) -> list[dict]:
    """Fallback: parse listing cards from the HTML."""
    listings = []

    cards = soup.select(
        'div[data-listing-id], '
        'a[data-cg-ft="car-blade-link"], '
        '.pazLpc, '
        'a[href*="/listing/"]'
    )

    for card in cards:
        try:
            listing = {"source": SOURCE_NAME}

            # Title
            title_el = card.select_one("h4, h3, h2, [data-cg-ft='car-blade-title']")
            if title_el:
                listing["title"] = title_el.get_text(strip=True)
            else:
                text = card.get_text(strip=True)
                if text and len(text) > 5:
                    listing["title"] = text.split('\n')[0][:120]
                else:
                    continue

            if not listing.get("title"):
                continue

            # URL
            href = card.get("href") or ""
            if not href:
                link = card.select_one("a[href]")
                if link:
                    href = link.get("href", "")
            if href and not href.startswith("http"):
                href = f"https://www.cargurus.com{href}"
            listing["url"] = href

            # Price
            price_el = card.select_one(
                "[data-cg-ft='car-blade-price'], .price, [class*='price']"
            )
            if price_el:
                listing["price"] = parse_price(price_el.get_text())

            # Mileage
            text = card.get_text()
            mi_match = re.search(r'([\d,]+)\s*mi', text, re.I)
            if mi_match:
                listing["mileage"] = parse_mileage(mi_match.group(1))

            listing["year"] = parse_year(listing.get("title", ""))

            # Location
            loc_el = card.select_one(
                "[data-cg-ft='car-blade-location'], .seller-location"
            )
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
