"""Email digest module using SendGrid."""

import logging
from datetime import datetime

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Content, MimeType

from .config import get_env, load_config
from .database import save_failed_send

logger = logging.getLogger("gx470_scraper")

CONFIG = load_config()


def send_digest(listings: list[dict]) -> bool:
    """Send HTML digest email of new listings. Returns True on success."""
    if not listings:
        logger.info("No new listings to email — skipping digest.")
        return True

    api_key = get_env("SENDGRID_API_KEY")
    recipient = get_env("RECIPIENT_EMAIL")
    from_email = CONFIG["email"]["from_address"]

    sorted_listings = sorted(listings, key=lambda x: x.get("price") or 999999)

    subject = f"GX470 Scraper: {len(sorted_listings)} New Listing{'s' if len(sorted_listings) != 1 else ''} — {datetime.utcnow().strftime('%b %d, %Y')}"

    html_body = _build_html(sorted_listings)
    text_body = _build_plaintext(sorted_listings)

    message = Mail(
        from_email=from_email,
        to_emails=recipient,
        subject=subject,
    )
    message.content = [
        Content(MimeType.text, text_body),
        Content(MimeType.html, html_body),
    ]

    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info(f"Email sent successfully. Status: {response.status_code}")
        return True
    except Exception as e:
        logger.error(f"SendGrid failed: {e}", exc_info=True)
        fingerprints = [l["fingerprint"] for l in sorted_listings if "fingerprint" in l]
        if fingerprints:
            save_failed_send(fingerprints)
            logger.info(f"Saved {len(fingerprints)} listings to failed_sends table for manual review.")
        return False


def send_failure_alert(error_summary: str) -> bool:
    """Send a plain-text alert that all scrapers failed."""
    try:
        api_key = get_env("SENDGRID_API_KEY")
        recipient = get_env("RECIPIENT_EMAIL")
        from_email = CONFIG["email"]["from_address"]
    except EnvironmentError:
        logger.error("Cannot send failure alert — missing environment variables")
        return False

    subject = "GX470 Scraper — ALL SCRAPERS FAILED"
    body = (
        f"GX470 Scraper Alert\n"
        f"{'=' * 40}\n\n"
        f"All scrapers failed during the run at {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}.\n\n"
        f"Error Summary:\n{error_summary}\n\n"
        f"Please check the logs and investigate.\n"
    )

    message = Mail(
        from_email=from_email,
        to_emails=recipient,
        subject=subject,
    )
    message.content = [Content(MimeType.text, body)]

    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info(f"Failure alert sent. Status: {response.status_code}")
        return True
    except Exception as e:
        logger.error(f"Failed to send failure alert: {e}", exc_info=True)
        return False


def _build_html(listings: list[dict]) -> str:
    cards_html = ""
    for l in listings:
        photo = l.get("photo_url") or ""
        photo_block = (
            f'<img src="{photo}" alt="Vehicle photo" '
            f'style="width:100%;max-height:220px;object-fit:cover;border-radius:8px 8px 0 0;" />'
            if photo else
            '<div style="width:100%;height:120px;background:#e0e0e0;border-radius:8px 8px 0 0;'
            'display:flex;align-items:center;justify-content:center;color:#999;font-size:14px;">'
            'No Photo Available</div>'
        )

        price_str = f"${l.get('price', 0):,.0f}" if l.get("price") else "Price N/A"
        mileage_str = f"{l.get('mileage', 0):,} mi" if l.get("mileage") else "Mileage N/A"
        year_str = str(l.get("year", "")) if l.get("year") else ""
        trim_str = l.get("trim", "") or ""
        title_display = f"{year_str} Lexus GX470 {trim_str}".strip()
        seller = l.get("seller_type", "").capitalize() or "Unknown"
        location = l.get("city", "")
        if l.get("state"):
            location += f", {l['state']}"
        source = l.get("source", "Unknown")
        url = l.get("url", "#")

        # Days since posted
        days_str = ""
        if l.get("posted_date_unknown"):
            days_str = '<span style="color:#e67e22;">Posted date unknown</span>'
        elif l.get("date_posted"):
            try:
                posted = datetime.strptime(l["date_posted"][:10], "%Y-%m-%d")
                days = (datetime.utcnow() - posted).days
                days_str = f"{days} day{'s' if days != 1 else ''} ago"
            except ValueError:
                days_str = '<span style="color:#e67e22;">Posted date unknown</span>'

        cards_html += f"""
        <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;
                     margin-bottom:16px;overflow:hidden;max-width:400px;font-family:Arial,sans-serif;">
            {photo_block}
            <div style="padding:16px;">
                <h3 style="margin:0 0 8px 0;font-size:18px;color:#1a1a1a;">{title_display}</h3>
                <div style="font-size:24px;font-weight:bold;color:#2ecc71;margin-bottom:8px;">
                    {price_str}
                </div>
                <div style="font-size:14px;color:#555;margin-bottom:4px;">
                    {mileage_str}
                </div>
                <div style="font-size:13px;color:#777;margin-bottom:4px;">
                    {seller} &middot; {location}
                </div>
                <div style="font-size:13px;color:#777;margin-bottom:4px;">
                    {days_str}
                </div>
                <div style="font-size:12px;color:#999;margin-bottom:12px;">
                    Source: {source}
                </div>
                <a href="{url}" target="_blank"
                   style="display:inline-block;background:#3498db;color:#fff;padding:10px 20px;
                          border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">
                    View Listing
                </a>
            </div>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="background:#f4f4f4;padding:20px;font-family:Arial,sans-serif;">
        <div style="max-width:440px;margin:0 auto;">
            <h1 style="font-size:22px;color:#2c3e50;margin-bottom:4px;">
                GX470 Daily Digest
            </h1>
            <p style="font-size:14px;color:#7f8c8d;margin-top:0;margin-bottom:20px;">
                {len(listings)} new listing{'s' if len(listings) != 1 else ''} found &mdash;
                {datetime.utcnow().strftime('%B %d, %Y')}
            </p>
            {cards_html}
            <p style="font-size:11px;color:#bbb;text-align:center;margin-top:24px;">
                Lexus GX470 Scraper &middot; Automated daily digest
            </p>
        </div>
    </body>
    </html>
    """


def _build_plaintext(listings: list[dict]) -> str:
    lines = [
        f"GX470 Daily Digest — {datetime.utcnow().strftime('%B %d, %Y')}",
        f"{len(listings)} new listing{'s' if len(listings) != 1 else ''} found",
        "=" * 50,
        "",
    ]

    for i, l in enumerate(listings, 1):
        price_str = f"${l.get('price', 0):,.0f}" if l.get("price") else "Price N/A"
        mileage_str = f"{l.get('mileage', 0):,} mi" if l.get("mileage") else "Mileage N/A"
        year_str = str(l.get("year", "")) if l.get("year") else ""
        trim_str = l.get("trim", "") or ""
        title = f"{year_str} Lexus GX470 {trim_str}".strip()
        seller = l.get("seller_type", "").capitalize() or "Unknown"
        location = l.get("city", "")
        if l.get("state"):
            location += f", {l['state']}"
        source = l.get("source", "Unknown")
        url = l.get("url", "N/A")

        days_str = ""
        if l.get("posted_date_unknown"):
            days_str = "(posted date unknown)"
        elif l.get("date_posted"):
            try:
                posted = datetime.strptime(l["date_posted"][:10], "%Y-%m-%d")
                days = (datetime.utcnow() - posted).days
                days_str = f"({days} day{'s' if days != 1 else ''} ago)"
            except ValueError:
                days_str = "(posted date unknown)"

        lines.extend([
            f"--- Listing {i} ---",
            f"  {title}",
            f"  {price_str} | {mileage_str}",
            f"  {seller} | {location}",
            f"  {days_str}",
            f"  Source: {source}",
            f"  Link: {url}",
            "",
        ])

    return "\n".join(lines)
