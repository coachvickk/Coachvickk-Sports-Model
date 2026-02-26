"""Cars.com scraper using requests + BeautifulSoup."""

import asyncio
import logging
import re

from bs4 import BeautifulSoup

from .base import (
    SEARCH, VEHICLE, fetch_with_retry, get_session, is_captcha_page,
    parse_mileage, parse_price, parse_year,
)

logger = logging.getLogger("gx470_scraper")

SOURCE_NAME = "Cars.com"


def build_url() -> str:
    return (
        f"https://www.cars.com/shopping/results/"
        f"?stock_type=used"
        f"&makes[]=lexus"
        f"&models[]=lexus-gx_470"
        f"&year_min={VEHICLE['year_min']}"
        f"&year_max={VEHICLE['year_max']}"
        f"&list_price_max={VEHICLE['max_price']}"
        f"&maximum_distance={SEARCH['radius_miles']}"
        f"&mileage_max={VEHICLE['max_mileage']}"
        f"&zip={SEARCH['zip_code']}"
        f"&sort=list_price"
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

    soup = BeautifulSoup(resp.text, "html.parser")
    listings = _extract_from_html(soup)

    logger.info(f"[{SOURCE_NAME}] Scraped {len(listings)} raw listings")
    return listings


def _extract_from_html(soup: BeautifulSoup) -> list[dict]:
    listings = []

    cards = soup.select(
        ".vehicle-card, "
        "[class*='listing-row'], "
        ".shop-srp-listings__listing, "
        "[class*='vehicle-card']"
    )

    for card in cards:
        try:
            listing = {"source": SOURCE_NAME}

            # Title
            title_el = card.select_one(
                "h2, .vehicle-card-title, .title, a.vehicle-card-link"
            )
            if title_el:
                listing["title"] = title_el.get_text(strip=True)
            else:
                continue

            if not listing.get("title"):
                continue

            # URL
            link = card.select_one(
                "a[href*='/vehicledetail/'], a[href*='vehicle/'], a.vehicle-card-link"
            )
            if link:
                href = link.get("href", "")
                listing["url"] = (
                    href if href.startswith("http")
                    else f"https://www.cars.com{href}"
                )
            else:
                listing["url"] = ""

            # Price
            price_el = card.select_one(
                ".primary-price, [class*='price'], .vehicle-card-price"
            )
            if price_el:
                listing["price"] = parse_price(price_el.get_text())

            # Mileage
            mileage_el = card.select_one(".mileage, [class*='mileage']")
            if mileage_el:
                listing["mileage"] = parse_mileage(mileage_el.get_text())
            else:
                text = card.get_text()
                mi_match = re.search(r'([\d,]+)\s*mi', text, re.I)
                if mi_match:
                    listing["mileage"] = parse_mileage(mi_match.group(1))

            listing["year"] = parse_year(listing.get("title", ""))

            # Dealer/Location
            dealer_el = card.select_one(".dealer-name, [class*='dealer']")
            if dealer_el:
                listing["city"] = dealer_el.get_text(strip=True)
                listing["seller_type"] = "dealer"
            else:
                listing["city"] = ""
                listing["seller_type"] = "unknown"
            listing["state"] = ""

            # Photo
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
