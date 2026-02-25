"""CarGurus scraper using Playwright with stealth."""

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

SOURCE_NAME = "CarGurus"


def build_url() -> str:
    return (
        f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action"
        f"?zip={SEARCH['zip_code']}"
        f"&showNegotiable=true"
        f"&sortDir=ASC"
        f"&sourceContext=carGurusHomePageModel"
        f"&distance={SEARCH['radius_miles']}"
        f"&entitySelectingHelper.selectedEntity=d333"  # Lexus GX 470 entity ID
        f"&entitySelectingHelper.selectedEntity2="
        f"&minPrice="
        f"&maxPrice={VEHICLE['max_price']}"
        f"&minMileage="
        f"&maxMileage={VEHICLE['max_mileage']}"
        f"&startYear={VEHICLE['year_min']}"
        f"&endYear={VEHICLE['year_max']}"
    )


async def scrape() -> list[dict]:
    """Scrape CarGurus for GX470 listings. Returns list of listing dicts."""
    listings = []
    url = build_url()
    logger.info(f"[{SOURCE_NAME}] Starting scrape: {url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page, context, content = await retry_with_backoff(
                lambda: setup_stealth_page(browser, url)
            )

            # Wait for listing cards to load
            try:
                await page.wait_for_selector(
                    '[data-cg-ft="car-blade-link"], .pazLpc, article[data-listing-id]',
                    timeout=15000,
                )
            except Exception:
                logger.warning(f"[{SOURCE_NAME}] Listing selector timeout — parsing page as-is")

            content = await page.content()

            # Extract listing cards
            cards = await page.query_selector_all(
                'article[data-listing-id], div[data-cg-ft="car-blade-link"], .pazLpc, a[href*="/listing/"]'
            )

            if not cards:
                # Fallback: try to parse links from page content
                link_pattern = re.compile(
                    r'href="(/Cars/inventorylisting/viewDetailsFilterViewInventoryListing\.action[^"]*'
                    r'|/listing/[^"]*)"'
                )
                links_found = link_pattern.findall(content)
                logger.info(f"[{SOURCE_NAME}] Found {len(links_found)} links via regex fallback")

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
    """Parse a single listing card element into a dict."""
    listing = {"source": SOURCE_NAME}

    # Title
    title_el = await card.query_selector('h4, [data-cg-ft="car-blade-title"], .iGMEhj')
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
    link_el = await card.query_selector('a[href*="/listing/"], a[href*="inventorylisting"]')
    if link_el:
        href = await link_el.get_attribute("href")
        if href:
            listing["url"] = href if href.startswith("http") else f"https://www.cargurus.com{href}"
    if not listing.get("url"):
        listing["url"] = ""

    # Price
    price_el = await card.query_selector('[data-cg-ft="car-blade-price"], .JzvPHo, .price')
    if price_el:
        listing["price"] = parse_price(await price_el.inner_text())

    # Mileage
    mileage_el = await card.query_selector('.JUPkgf, .mileage, [data-cg-ft="car-blade-mileage"]')
    if mileage_el:
        listing["mileage"] = parse_mileage(await mileage_el.inner_text())

    # Year
    listing["year"] = parse_year(listing.get("title", ""))

    # Location
    loc_el = await card.query_selector('.JKEbmJ, .seller-location, [data-cg-ft="car-blade-location"]')
    if loc_el:
        loc_text = (await loc_el.inner_text()).strip()
        parts = loc_text.rsplit(",", 1)
        listing["city"] = parts[0].strip() if parts else loc_text
        listing["state"] = parts[1].strip() if len(parts) > 1 else ""

    listing["seller_type"] = "dealer"

    # Photo
    img_el = await card.query_selector("img")
    if img_el:
        listing["photo_url"] = await img_el.get_attribute("src")

    # Posted date
    listing["date_posted"] = None
    listing["posted_date_unknown"] = True

    return listing
