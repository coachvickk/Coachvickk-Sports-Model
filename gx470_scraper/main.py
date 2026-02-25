"""Main orchestrator for the GX470 scraper.

Runs all scrapers, validates listings, deduplicates, and sends email digest.
"""

import asyncio
import glob
import logging
import os
import re
import sys
import traceback
from datetime import datetime, timedelta
from pathlib import Path

from .config import load_config
from .database import (
    generate_fingerprint, init_db, listing_exists, save_listing,
)
from .email_sender import send_digest, send_failure_alert
from .scrapers import cargurus, autotrader, carsdotcom, autolist, craigslist, local_dealers

CONFIG = load_config()
VEHICLE = CONFIG["vehicle"]
SCRAPING = CONFIG["scraping"]

LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(exist_ok=True)


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("gx470_scraper")
    logger.setLevel(logging.DEBUG)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(ch)

    # File handler — one log per run
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    log_file = LOG_DIR / f"run_{timestamp}.log"
    fh = logging.FileHandler(str(log_file))
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(fh)

    return logger


def cleanup_old_logs():
    """Retain only last 30 log files, auto-delete older ones."""
    log_files = sorted(LOG_DIR.glob("run_*.log"))
    if len(log_files) > 30:
        for old in log_files[:-30]:
            try:
                old.unlink()
            except OSError:
                pass


def validate_gx470(listing: dict) -> tuple[bool, str]:
    """Validate that a listing is actually a GX470 within filters.

    Returns (is_valid, rejection_reason).
    """
    title = (listing.get("title") or "").lower()
    if "gx470" not in title.replace(" ", "") and "gx 470" not in title:
        return False, "title does not contain GX470/GX 470"

    year = listing.get("year")
    if year is not None:
        if year < VEHICLE["year_min"] or year > VEHICLE["year_max"]:
            return False, f"year {year} outside {VEHICLE['year_min']}-{VEHICLE['year_max']}"

    price = listing.get("price")
    if price is not None:
        if price > VEHICLE["max_price"]:
            return False, f"price ${price:,.0f} exceeds ${VEHICLE['max_price']:,}"

    mileage = listing.get("mileage")
    if mileage is not None:
        if mileage > VEHICLE["max_mileage"]:
            return False, f"mileage {mileage:,} exceeds {VEHICLE['max_mileage']:,}"

    return True, ""


def check_listing_age(listing: dict) -> tuple[bool, bool]:
    """Check if listing is within age limit.

    Returns (passes_filter, posted_date_unknown).
    """
    max_age = SCRAPING.get("listing_max_age_days", 14)
    date_posted = listing.get("date_posted")

    if not date_posted:
        return True, True  # Include but flag as unknown

    try:
        posted_dt = datetime.strptime(date_posted[:10], "%Y-%m-%d")
        age = (datetime.utcnow() - posted_dt).days
        if age > max_age:
            return False, False
        return True, False
    except ValueError:
        return True, True


async def run_scraper(name: str, scraper_module, stats: dict) -> list[dict]:
    """Run a single scraper inside try/except. Returns listings or empty list."""
    try:
        listings = await scraper_module.scrape()
        stats["sites_scraped"].append(name)
        stats["per_site"][name] = len(listings)
        return listings
    except Exception as e:
        stats["errors"].append(f"{name}: {e}")
        logger = logging.getLogger("gx470_scraper")
        logger.error(f"[{name}] SCRAPER FAILED:\n{traceback.format_exc()}")
        return []


async def run():
    """Main entry point — orchestrates the full scraping pipeline."""
    start_time = datetime.utcnow()
    logger = setup_logging()
    logger.info("=" * 60)
    logger.info("GX470 SCRAPER — RUN STARTED")
    logger.info(f"Start time: {start_time.isoformat()}")
    logger.info("=" * 60)

    init_db()

    stats = {
        "sites_scraped": [],
        "per_site": {},
        "new_listings": 0,
        "duplicates_skipped": 0,
        "age_filtered": 0,
        "validation_rejected": 0,
        "errors": [],
    }

    # Run all scrapers independently
    scrapers = [
        ("CarGurus", cargurus),
        ("AutoTrader", autotrader),
        ("Cars.com", carsdotcom),
        ("Autolist", autolist),
        ("Craigslist", craigslist),
        ("Local Dealers", local_dealers),
    ]

    all_raw_listings = []
    for name, module in scrapers:
        listings = await run_scraper(name, module, stats)
        all_raw_listings.extend(listings)

    logger.info(f"Total raw listings scraped: {len(all_raw_listings)}")

    # Check if ALL scrapers failed
    if len(stats["errors"]) == len(scrapers):
        logger.error("ALL SCRAPERS FAILED — sending failure alert")
        error_summary = "\n".join(stats["errors"])
        send_failure_alert(error_summary)
        _log_summary(logger, stats, start_time)
        cleanup_old_logs()
        return

    # Validation, dedup, and age filtering
    new_listings = []

    for listing in all_raw_listings:
        # GX470 validation
        is_valid, reason = validate_gx470(listing)
        if not is_valid:
            stats["validation_rejected"] += 1
            logger.debug(f"Rejected: {listing.get('title', 'N/A')} — {reason}")
            continue

        # Age filter
        passes_age, date_unknown = check_listing_age(listing)
        if not passes_age:
            stats["age_filtered"] += 1
            logger.debug(f"Age-filtered: {listing.get('title', 'N/A')} — too old")
            continue

        listing["posted_date_unknown"] = date_unknown

        # Dedup fingerprint
        location = listing.get("city", "") + ", " + listing.get("state", "")
        fp = generate_fingerprint(
            listing.get("title", ""),
            listing.get("price"),
            listing.get("mileage"),
            location,
        )
        listing["fingerprint"] = fp

        if listing_exists(fp):
            stats["duplicates_skipped"] += 1
            continue

        # Save to database
        saved = save_listing(listing)
        if saved:
            stats["new_listings"] += 1
            new_listings.append(listing)
        else:
            stats["duplicates_skipped"] += 1

    logger.info(f"New validated listings: {len(new_listings)}")

    # Send email digest
    if new_listings:
        logger.info(f"Sending digest with {len(new_listings)} new listings...")
        send_digest(new_listings)
    else:
        logger.info("No new listings to send.")

    _log_summary(logger, stats, start_time)
    cleanup_old_logs()


def _log_summary(logger, stats: dict, start_time: datetime):
    end_time = datetime.utcnow()
    duration = (end_time - start_time).total_seconds()

    logger.info("=" * 60)
    logger.info("RUN SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Sites scraped: {', '.join(stats['sites_scraped']) or 'None'}")
    for site, count in stats["per_site"].items():
        logger.info(f"  {site}: {count} raw listings")
    logger.info(f"New listings added: {stats['new_listings']}")
    logger.info(f"Duplicates skipped: {stats['duplicates_skipped']}")
    logger.info(f"Age-filtered: {stats['age_filtered']}")
    logger.info(f"Validation rejected: {stats['validation_rejected']}")
    if stats["errors"]:
        logger.info(f"Errors ({len(stats['errors'])}):")
        for err in stats["errors"]:
            logger.info(f"  - {err}")
    logger.info(f"Duration: {duration:.1f}s")
    logger.info(f"Completed: {end_time.isoformat()}")
    logger.info("=" * 60)


def main():
    """CLI entry point."""
    asyncio.run(run())


if __name__ == "__main__":
    main()
