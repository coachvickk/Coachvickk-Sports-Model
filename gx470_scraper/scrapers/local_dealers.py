"""Local dealer inventory scraper using Playwright with stealth.

Loops through dealers.yaml entries and attempts generic extraction
of vehicle title, price, mileage, and detail page link.
"""

import asyncio
import logging
import re

from playwright.async_api import async_playwright

from .base import (
    CaptchaDetectedError, parse_mileage, parse_price, parse_year,
    random_delay, random_user_agent, retry_with_backoff, setup_stealth_page,
)
from ..config import load_dealers

logger = logging.getLogger("gx470_scraper")

SOURCE_NAME = "Local Dealer"


async def scrape() -> list[dict]:
    dealers = load_dealers()
    all_listings = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        for dealer in dealers:
            name = dealer["name"]
            url = dealer["url"]
            logger.info(f"[{SOURCE_NAME}] Scraping {name}: {url}")

            try:
                listings = await _scrape_dealer(browser, name, url)
                all_listings.extend(listings)
                logger.info(f"[{SOURCE_NAME}] {name}: {len(listings)} listings found")
            except CaptchaDetectedError:
                logger.warning(f"[{SOURCE_NAME}] {name}: CAPTCHA detected — skipping")
            except Exception as e:
                logger.error(f"[{SOURCE_NAME}] {name} failed: {e}", exc_info=True)

            await asyncio.sleep(random_delay())

        await browser.close()

    logger.info(f"[{SOURCE_NAME}] Total: {len(all_listings)} raw listings")
    return all_listings


async def _scrape_dealer(browser, dealer_name: str, url: str) -> list[dict]:
    listings = []

    page, context, content = await retry_with_backoff(
        lambda: setup_stealth_page(browser, url)
    )

    try:
        # Wait for page to load
        await asyncio.sleep(3)

        # Generic approach: look for inventory cards/items
        cards = await page.query_selector_all(
            '[class*="vehicle-card"], [class*="inventory-listing"], '
            '[class*="srp-listing"], [class*="vehicle_card"], '
            'div[class*="listing"], article, .item, '
            '[data-type="vehicle"], [class*="VehicleCard"]'
        )

        if not cards:
            # Fallback: look for any links that might be vehicle listings
            cards = await page.query_selector_all(
                'a[href*="vehicle"], a[href*="inventory"], '
                'a[href*="VehicleDetail"], a[href*="used-"]'
            )

        for card in cards:
            try:
                listing = await _parse_card(card, dealer_name, url)
                if listing:
                    listings.append(listing)
            except Exception as e:
                logger.debug(f"[{SOURCE_NAME}] {dealer_name}: Failed to parse card: {e}")

    finally:
        await context.close()

    return listings


async def _parse_card(card, dealer_name: str, base_url: str) -> dict | None:
    listing = {"source": f"{SOURCE_NAME} - {dealer_name}"}

    # Get full text of the card
    full_text = (await card.inner_text()).strip()
    if not full_text or len(full_text) < 5:
        return None

    # Title — look for heading elements or first meaningful text
    title_el = await card.query_selector(
        'h2, h3, h4, [class*="title"], [class*="Title"], '
        '[class*="name"], [class*="Name"], .vehicle-title'
    )
    if title_el:
        listing["title"] = (await title_el.inner_text()).strip()
    else:
        # Use first line as title
        first_line = full_text.split("\n")[0].strip()
        if len(first_line) > 5:
            listing["title"] = first_line

    if not listing.get("title"):
        return None

    # Quick check: does this look like a GX470?
    title_lower = listing["title"].lower()
    if "gx" not in title_lower and "lexus" not in title_lower:
        return None

    # URL
    link_el = await card.query_selector("a[href]")
    if link_el:
        href = await link_el.get_attribute("href")
        if href:
            if href.startswith("http"):
                listing["url"] = href
            elif href.startswith("/"):
                from urllib.parse import urlparse
                parsed = urlparse(base_url)
                listing["url"] = f"{parsed.scheme}://{parsed.netloc}{href}"
            else:
                listing["url"] = f"{base_url.rstrip('/')}/{href}"
    if not listing.get("url"):
        listing["url"] = base_url

    # Price
    price_el = await card.query_selector(
        '[class*="price"], [class*="Price"], .vehicle-price, '
        '[class*="amount"], [class*="Amount"]'
    )
    if price_el:
        listing["price"] = parse_price(await price_el.inner_text())
    else:
        price_match = re.search(r"\$[\d,]+", full_text)
        if price_match:
            listing["price"] = parse_price(price_match.group())

    # Mileage
    mileage_el = await card.query_selector(
        '[class*="mileage"], [class*="Mileage"], [class*="miles"], [class*="Miles"]'
    )
    if mileage_el:
        listing["mileage"] = parse_mileage(await mileage_el.inner_text())
    else:
        mileage_match = re.search(r"([\d,]+)\s*mi", full_text, re.IGNORECASE)
        if mileage_match:
            listing["mileage"] = parse_mileage(mileage_match.group(1))

    # Year
    listing["year"] = parse_year(listing.get("title", ""))

    # Location
    listing["city"] = dealer_name
    listing["state"] = ""
    listing["seller_type"] = "dealer"

    # Photo
    img_el = await card.query_selector("img")
    if img_el:
        listing["photo_url"] = await img_el.get_attribute("src") or await img_el.get_attribute("data-src")

    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing
