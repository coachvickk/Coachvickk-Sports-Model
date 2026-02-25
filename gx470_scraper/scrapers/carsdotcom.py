"""Cars.com scraper using Playwright with stealth."""

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
                    '.vehicle-card, [class*="listing-row"], .shop-srp-listings__listing',
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[{SOURCE_NAME}] Listing selector timeout — parsing as-is")

            content = await page.content()

            cards = await page.query_selector_all(
                '.vehicle-card, [class*="listing-row"], .shop-srp-listings__listing'
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
    title_el = await card.query_selector("h2, .vehicle-card-title, .title")
    if title_el:
        listing["title"] = (await title_el.inner_text()).strip()
    else:
        return None

    if not listing.get("title"):
        return None

    # URL
    link_el = await card.query_selector('a[href*="/vehicledetail/"], a[href*="vehicle/"]')
    if link_el:
        href = await link_el.get_attribute("href")
        if href:
            listing["url"] = href if href.startswith("http") else f"https://www.cars.com{href}"
    if not listing.get("url"):
        listing["url"] = ""

    # Price
    price_el = await card.query_selector('.primary-price, [class*="price"], .vehicle-card-price')
    if price_el:
        listing["price"] = parse_price(await price_el.inner_text())

    # Mileage
    mileage_el = await card.query_selector('.mileage, [class*="mileage"]')
    if mileage_el:
        listing["mileage"] = parse_mileage(await mileage_el.inner_text())
    else:
        full_text = await card.inner_text()
        mileage_match = re.search(r"([\d,]+)\s*mi", full_text)
        if mileage_match:
            listing["mileage"] = parse_mileage(mileage_match.group(1))

    # Year
    listing["year"] = parse_year(listing.get("title", ""))

    # Location
    loc_el = await card.query_selector('.dealer-name, [class*="dealer"]')
    if loc_el:
        listing["city"] = (await loc_el.inner_text()).strip()
        listing["seller_type"] = "dealer"
    else:
        listing["seller_type"] = "unknown"
        listing["city"] = ""

    listing["state"] = ""

    # Photo
    img_el = await card.query_selector("img")
    if img_el:
        listing["photo_url"] = await img_el.get_attribute("src")

    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing
