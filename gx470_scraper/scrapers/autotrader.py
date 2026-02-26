"""AutoTrader scraper using requests + JSON/HTML parsing."""

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

SOURCE_NAME = "AutoTrader"


def build_url() -> str:
    return (
        f"https://www.autotrader.com/cars-for-sale/all-cars/"
        f"lexus/gx-470/"
        f"{SEARCH['zip_code']}"
        f"?searchRadius={SEARCH['radius_miles']}"
        f"&startYear={VEHICLE['year_min']}"
        f"&endYear={VEHICLE['year_max']}"
        f"&maxPrice={VEHICLE['max_price']}"
        f"&maxMileage={VEHICLE['max_mileage']}"
        f"&isNewSearch=true"
        f"&sortBy=derivedpriceDESC"
    )


async def scrape() -> list[dict]:
    return await asyncio.to_thread(_scrape_sync)


def _scrape_sync() -> list[dict]:
    url = build_url()
    logger.info(f"[{SOURCE_NAME}] Starting scrape: {url}")

    session = get_session()
    session.headers.update({"Referer": "https://www.autotrader.com/"})
    resp = fetch_with_retry(url, session=session)

    if not resp:
        logger.error(f"[{SOURCE_NAME}] Failed to fetch page")
        return []

    if is_captcha_page(resp.text):
        logger.warning(f"[{SOURCE_NAME}] CAPTCHA detected — skipping")
        return []

    # Try to extract from embedded JSON data
    listings = _extract_from_json(resp.text)

    if not listings:
        soup = BeautifulSoup(resp.text, "html.parser")
        listings = _extract_from_html(soup)

    logger.info(f"[{SOURCE_NAME}] Scraped {len(listings)} raw listings")
    return listings


def _extract_from_json(html: str) -> list[dict]:
    """Extract listings from AutoTrader's embedded JSON data."""
    listings = []

    # AutoTrader embeds data in window.__BONNET_DATA__ or similar
    patterns = [
        r'window\.__BONNET_DATA__\s*=\s*({[\s\S]*?});\s*</script>',
        r'window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*</script>',
        r'"listings"\s*:\s*(\[[\s\S]*?\])\s*[,}]',
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
                        data.get("results") or
                        data.get("initialState", {}).get("listings") or
                        data.get("inventory", {}).get("listings") or
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
            except (json.JSONDecodeError, TypeError, AttributeError):
                continue

    return listings


def _parse_json_item(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None

    listing = {"source": SOURCE_NAME}

    listing["title"] = item.get("title") or item.get("heading") or ""
    if not listing["title"]:
        year = item.get("year", "")
        make = item.get("make", "")
        model = item.get("model", "")
        listing["title"] = f"{year} {make} {model}".strip()

    if not listing["title"]:
        return None

    # Price — may be nested
    price = item.get("price")
    if isinstance(price, dict):
        price = price.get("value") or price.get("amount")
    pricing = item.get("pricingDetail")
    if not price and isinstance(pricing, dict):
        price = pricing.get("primary") or pricing.get("salePrice")
    if isinstance(price, (int, float)):
        listing["price"] = float(price)
    elif isinstance(price, str):
        listing["price"] = parse_price(price)
    else:
        listing["price"] = None

    mileage = item.get("mileage") or item.get("miles")
    if isinstance(mileage, str):
        listing["mileage"] = parse_mileage(mileage)
    elif isinstance(mileage, (int, float)):
        listing["mileage"] = int(mileage)
    else:
        listing["mileage"] = None

    listing["year"] = item.get("year") or parse_year(listing["title"])

    listing_id = item.get("id") or item.get("listingId") or ""
    if listing_id:
        listing["url"] = (
            f"https://www.autotrader.com/cars-for-sale/"
            f"vehicledetails.xhtml?listingId={listing_id}"
        )
    else:
        listing["url"] = item.get("url") or item.get("link") or ""

    owner = item.get("owner") or {}
    if isinstance(owner, dict):
        listing["city"] = owner.get("city") or ""
        listing["state"] = owner.get("state") or ""
        listing["seller_type"] = "dealer" if owner.get("isDealerListing") else "private"
    else:
        listing["city"] = ""
        listing["state"] = ""
        listing["seller_type"] = "unknown"

    listing["photo_url"] = None
    images = item.get("images") or item.get("photos") or []
    if images and isinstance(images, list):
        first = images[0]
        if isinstance(first, dict):
            listing["photo_url"] = first.get("url") or first.get("src")
        elif isinstance(first, str):
            listing["photo_url"] = first

    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing


def _extract_from_html(soup: BeautifulSoup) -> list[dict]:
    """Fallback HTML parsing."""
    listings = []

    cards = soup.select(
        '[data-cmp="inventoryListing"], '
        '[data-cmp="listingCard"], '
        '.inventory-listing-body, '
        'div[id^="listing-"]'
    )

    for card in cards:
        try:
            listing = {"source": SOURCE_NAME}

            title_el = card.select_one("h2, [data-cmp='headingLink'], .text-bold")
            if title_el:
                listing["title"] = title_el.get_text(strip=True)
            else:
                continue

            if not listing.get("title"):
                continue

            link = card.select_one("a[href*='/cars-for-sale/']")
            if link:
                href = link.get("href", "")
                listing["url"] = (
                    href if href.startswith("http")
                    else f"https://www.autotrader.com{href}"
                )
            else:
                listing["url"] = ""

            price_el = card.select_one("[data-cmp='firstPrice'], .first-price")
            if price_el:
                listing["price"] = parse_price(price_el.get_text())

            text = card.get_text()
            mi_match = re.search(r'([\d,]+)\s*mi', text, re.I)
            if mi_match:
                listing["mileage"] = parse_mileage(mi_match.group(1))

            listing["year"] = parse_year(listing.get("title", ""))
            listing["city"] = ""
            listing["state"] = ""
            listing["seller_type"] = "unknown"

            img = card.select_one("img")
            listing["photo_url"] = img.get("src") if img else None
            listing["date_posted"] = None
            listing["posted_date_unknown"] = True

            listings.append(listing)
        except Exception as e:
            logger.debug(f"[{SOURCE_NAME}] Failed to parse card: {e}")

    return listings
