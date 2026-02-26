"""Entry point: runs the web dashboard + schedules daily scraper."""

import asyncio
import logging
import os
import threading
from datetime import datetime, timezone

from .dashboard import app
from .database import init_db

logger = logging.getLogger("gx470_scraper.serve")


def run_scraper_job():
    """Run the scraper in a background thread."""
    from .main import run
    logger.info("Scheduled scraper run starting...")
    asyncio.run(run())
    logger.info("Scheduled scraper run complete.")


def start_scheduler():
    """Simple daily scheduler — runs scraper at 7:00 AM UTC every day."""
    import time

    def _loop():
        while True:
            now = datetime.now(timezone.utc)
            # Next 7:00 AM UTC
            target = now.replace(hour=7, minute=0, second=0, microsecond=0)
            if now >= target:
                # Already past 7 AM today, schedule for tomorrow
                from datetime import timedelta
                target += timedelta(days=1)

            wait_seconds = (target - now).total_seconds()
            logger.info(f"Next scraper run at {target.isoformat()} ({wait_seconds/3600:.1f}h from now)")
            time.sleep(wait_seconds)

            try:
                run_scraper_job()
            except Exception as e:
                logger.error(f"Scheduled scraper failed: {e}")

    t = threading.Thread(target=_loop, daemon=True)
    t.start()


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    init_db()

    # Start background scheduler
    start_scheduler()

    # Start Flask
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Dashboard starting on port {port}")
    app.run(host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
