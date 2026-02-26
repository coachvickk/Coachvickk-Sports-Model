"""SQLite database module for storing and deduplicating listings."""

import hashlib
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "listings.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fingerprint TEXT UNIQUE NOT NULL,
            source TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            price REAL,
            mileage INTEGER,
            year INTEGER,
            seller_type TEXT,
            city TEXT,
            state TEXT,
            date_scraped TEXT NOT NULL,
            date_posted TEXT,
            photo_url TEXT,
            trim TEXT,
            posted_date_unknown INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS failed_sends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_fingerprint TEXT NOT NULL,
            created_at TEXT NOT NULL,
            sent INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_fingerprint ON listings(fingerprint)
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scraper_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            total_new INTEGER DEFAULT 0,
            total_skipped INTEGER DEFAULT 0,
            total_rejected INTEGER DEFAULT 0,
            errors TEXT DEFAULT '',
            per_site TEXT DEFAULT '',
            status TEXT DEFAULT 'running'
        )
    """)

    conn.commit()
    conn.close()


def generate_fingerprint(title: str, price: float | None, mileage: int | None,
                         location: str) -> str:
    raw = f"{(title or '').lower().strip()}|{price}|{mileage}|{(location or '').lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def listing_exists(fingerprint: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM listings WHERE fingerprint = ?", (fingerprint,)
    ).fetchone()
    conn.close()
    return row is not None


def save_listing(listing: dict) -> bool:
    """Save a listing to the database. Returns True if inserted (new), False if duplicate."""
    fp = listing["fingerprint"]
    if listing_exists(fp):
        return False

    conn = get_connection()
    try:
        conn.execute("""
            INSERT INTO listings (
                fingerprint, source, url, title, price, mileage, year,
                seller_type, city, state, date_scraped, date_posted,
                photo_url, trim, posted_date_unknown
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fp,
            listing.get("source", ""),
            listing.get("url", ""),
            listing.get("title", ""),
            listing.get("price"),
            listing.get("mileage"),
            listing.get("year"),
            listing.get("seller_type", ""),
            listing.get("city", ""),
            listing.get("state", ""),
            datetime.utcnow().isoformat(),
            listing.get("date_posted"),
            listing.get("photo_url"),
            listing.get("trim"),
            1 if listing.get("posted_date_unknown") else 0,
        ))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def save_failed_send(fingerprints: list[str]) -> None:
    conn = get_connection()
    now = datetime.utcnow().isoformat()
    for fp in fingerprints:
        conn.execute(
            "INSERT INTO failed_sends (listing_fingerprint, created_at) VALUES (?, ?)",
            (fp, now),
        )
    conn.commit()
    conn.close()


def get_unsent_failed_listings() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT l.* FROM failed_sends fs
        JOIN listings l ON l.fingerprint = fs.listing_fingerprint
        WHERE fs.sent = 0
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def mark_failed_sends_sent(fingerprints: list[str]) -> None:
    conn = get_connection()
    for fp in fingerprints:
        conn.execute(
            "UPDATE failed_sends SET sent = 1 WHERE listing_fingerprint = ?",
            (fp,),
        )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Scraper run tracking
# ---------------------------------------------------------------------------

def start_scraper_run() -> int:
    """Mark a new scraper run as started. Returns run ID."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO scraper_runs (started_at, status) VALUES (?, 'running')",
        (datetime.utcnow().isoformat(),),
    )
    run_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return run_id


def complete_scraper_run(run_id: int, total_new: int, total_skipped: int,
                         total_rejected: int, errors: str, per_site: str):
    """Mark a scraper run as complete."""
    conn = get_connection()
    conn.execute(
        "UPDATE scraper_runs SET completed_at=?, total_new=?, total_skipped=?,"
        " total_rejected=?, errors=?, per_site=?, status='completed' WHERE id=?",
        (datetime.utcnow().isoformat(), total_new, total_skipped,
         total_rejected, errors, per_site, run_id),
    )
    conn.commit()
    conn.close()


def fail_scraper_run(run_id: int, errors: str):
    """Mark a scraper run as failed."""
    conn = get_connection()
    conn.execute(
        "UPDATE scraper_runs SET completed_at=?, errors=?, status='failed' WHERE id=?",
        (datetime.utcnow().isoformat(), errors, run_id),
    )
    conn.commit()
    conn.close()


def get_last_scraper_run() -> dict | None:
    """Get the most recent scraper run."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM scraper_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
    except Exception:
        return None
    finally:
        conn.close()
