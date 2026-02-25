"""AutoTrader scraper using Playwright with stealth."""

import asyncio
import logging
import re

from playwright.async_api import async_playwright

from .base import (
    SEARCH, VEHICLE, CaptchaDetectedError, parse_mileage, parse_price,
    parse_year, random_delay, random_user_agent, retry_with_backoff,
    setup_stealth_page, is_captcha_page,
)

logger = logging.getLogger("gx470_scraper")

SOURCE_NAME = "AutoTrader"


def build_url() -> str:
    return (
        f"https://www.autotrader.com/cars-for-sale/all-cars/"
        f"lexus/gx-470/"
        f"{SEARCH['zip_code']}"
        f"?requestId=0"
        f"&marketExtension=include"
        f"&searchRadius={SEARCH['radius_miles']}"
        f"&startYear={VEHICLE['year_min']}"
        f"&endYear={VEHICLE['year_max']}"
        f"&maxPrice={VEHICLE['max_price']}"
        f"&maxMileage={VEHICLE['max_mileage']}"
        f"&isNewSearch=true"
        f"&sortBy=derivedpriceDESC"
    )


async def scrape() -> list[dict]:
    listings = []
    url = build_url()
    logger.info(f"[{SOURCE_NAME}] Starting scrape: {url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page, context, content = await retry_with_backoff(
                lambda: setup_stealth_page(browser, url)
            )

            try:
                await page.wait_for_selector(
                    '[data-cmp="inventoryListing"], .inventory-listing, [data-cmp="listingCard"]',
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[{SOURCE_NAME}] Listing selector timeout — parsing as-is")

            content = await page.content()

            cards = await page.query_selector_all(
                '[data-cmp="inventoryListing"], [data-cmp="listingCard"], '
                '.inventory-listing-body, div[id^="listing-"]'
            )

            for card in cards:
                try:
                    listing = await _parse_card(card, page)
                    if listing:
                        listings.append(listing)
                except Exception as e:
                    logger.debug(f"[{SOURCE_NAME}] Failed to parse card: {e}")

            await context.close()

        except CaptchaDetectedError:
            logger.warning(f"[{SOURCE_NAME}] CAPTCHA detected — skipping this run")
        finally:
            await browser.close()

    logger.info(f"[{SOURCE_NAME}] Scraped {len(listings)} raw listings")
    return listings


async def _parse_card(card, page) -> dict | None:
    listing = {"source": SOURCE_NAME}

    # Title
    title_el = await card.query_selector('h2, [data-cmp="headingLink"], .text-bold')
    if title_el:
        listing["title"] = (await title_el.inner_text()).strip()
    else:
        text = (await card.inner_text()).strip()
        first_line = text.split("\n")[0].strip()
        if first_line:
            listing["title"] = first_line

    if not listing.get("title"):
        return None

    # URL
    link_el = await card.query_selector('a[href*="/cars-for-sale/"], a[href*="vehicledetail"]')
    if link_el:
        href = await link_el.get_attribute("href")
        if href:
            listing["url"] = href if href.startswith("http") else f"https://www.autotrader.com{href}"
    if not listing.get("url"):
        listing["url"] = ""

    # Price
    price_el = await card.query_selector(
        '[data-cmp="firstPrice"], .first-price, .text-size-600'
    )
    if price_el:
        listing["price"] = parse_price(await price_el.inner_text())

    # Mileage
    mileage_el = await card.query_selector('.item-card-mileage, [class*="mileage"]')
    if mileage_el:
        listing["mileage"] = parse_mileage(await mileage_el.inner_text())
    else:
        # Try to find mileage in full card text
        full_text = await card.inner_text()
        mileage_match = re.search(r"([\d,]+)\s*mi", full_text)
        if mileage_match:
            listing["mileage"] = parse_mileage(mileage_match.group(1))

    # Year
    listing["year"] = parse_year(listing.get("title", ""))

    # Location
    loc_el = await card.query_selector('[class*="dealer-name"], .seller-name')
    if loc_el:
        listing["city"] = (await loc_el.inner_text()).strip()
        listing["seller_type"] = "dealer"
    else:
        listing["seller_type"] = "unknown"

    listing["state"] = ""

    # Photo
    img_el = await card.query_selector("img")
    if img_el:
        listing["photo_url"] = await img_el.get_attribute("src")

    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing
