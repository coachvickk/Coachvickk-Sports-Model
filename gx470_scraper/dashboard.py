"""Web dashboard for browsing GX470 listings — luxury editorial style."""

import asyncio
import logging
import threading
from datetime import datetime, timezone

from flask import Flask, jsonify, redirect, request, url_for

from .database import get_connection, init_db

app = Flask(__name__)
logger = logging.getLogger("gx470_scraper.dashboard")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_listings(sort="date_scraped", order="desc", source=None, limit=200):
    allowed_sorts = {
        "date_scraped": "date_scraped",
        "price": "price",
        "mileage": "mileage",
        "year": "year",
    }
    sort_col = allowed_sorts.get(sort, "date_scraped")
    order_dir = "ASC" if order == "asc" else "DESC"

    query = "SELECT * FROM listings"
    params = []
    if source:
        query += " WHERE source = ?"
        params.append(source)
    query += f" ORDER BY {sort_col} {order_dir} NULLS LAST LIMIT ?"
    params.append(limit)

    conn = get_connection()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_sources():
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT source FROM listings WHERE source IS NOT NULL ORDER BY source"
    ).fetchall()
    conn.close()
    return [r["source"] for r in rows]


def get_stats():
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) as c FROM listings").fetchone()["c"]
    avg_price = conn.execute(
        "SELECT AVG(price) as a FROM listings WHERE price IS NOT NULL"
    ).fetchone()["a"]
    lowest = conn.execute(
        "SELECT MIN(price) as m FROM listings WHERE price IS NOT NULL"
    ).fetchone()["m"]
    newest = conn.execute(
        "SELECT MAX(date_scraped) as d FROM listings"
    ).fetchone()["d"]
    conn.close()
    return {
        "total": total,
        "avg_price": round(avg_price, 0) if avg_price else 0,
        "lowest_price": lowest or 0,
        "last_scraped": newest or "Never",
    }


def fmt_price(price):
    if price is None:
        return "N/A"
    return f"${price:,.0f}"


def fmt_mileage(mi):
    if mi is None:
        return "N/A"
    return f"{mi:,} mi"


def days_ago(date_str):
    if not date_str:
        return "Unknown"
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
        delta = (datetime.now(timezone.utc).replace(tzinfo=None) - dt).days
        if delta == 0:
            return "Today"
        if delta == 1:
            return "Yesterday"
        return f"{delta} days ago"
    except ValueError:
        return "Unknown"


# ---------------------------------------------------------------------------
# Luxury editorial HTML
# ---------------------------------------------------------------------------

def render_page(listings, stats, sources, current_sort, current_order, current_source):
    source_options = "".join(
        f'<option value="{s}" {"selected" if s == current_source else ""}>{s}</option>'
        for s in sources
    )

    # Featured listing (first one, shown large)
    featured_html = ""
    remaining = listings
    if listings:
        f = listings[0]
        remaining = listings[1:]
        photo = f.get("photo_url") or ""
        img = f'style="background-image:url({photo})"' if photo else ""
        location = ", ".join(filter(None, [f.get("city"), f.get("state")]))
        seller = (f.get("seller_type") or "").capitalize()
        url = f.get("url") or "#"
        featured_html = f'''
        <a href="{url}" target="_blank" rel="noopener" class="featured">
            <div class="featured-img" {img}>
                {'' if photo else '<span class="no-img-text">No Image Available</span>'}
                <div class="featured-overlay">
                    <span class="featured-tag">FEATURED FIND</span>
                    <h2 class="featured-title">{f.get("title", "Lexus GX470")}</h2>
                    <div class="featured-price">{fmt_price(f.get("price"))}</div>
                    <div class="featured-meta">{fmt_mileage(f.get("mileage"))}  ·  {location}  ·  {seller}</div>
                </div>
            </div>
        </a>'''

    # Listing grid cards
    cards_html = ""
    for li in remaining:
        photo = li.get("photo_url") or ""
        img_style = f'style="background-image:url({photo})"' if photo else ""
        posted = days_ago(li.get("date_posted"))
        url = li.get("url") or "#"
        seller = (li.get("seller_type") or "Unknown").capitalize()
        location = ", ".join(filter(None, [li.get("city"), li.get("state")]))
        source_name = li.get("source", "")

        cards_html += f'''
        <a href="{url}" target="_blank" rel="noopener" class="card">
            <div class="card-img" {img_style}>
                {'' if photo else '<span class="no-img-text">No Image</span>'}
            </div>
            <div class="card-body">
                <div class="card-title">{li.get("title", "GX470")}</div>
                <div class="card-price">{fmt_price(li.get("price"))}</div>
                <div class="card-row">
                    <span>{fmt_mileage(li.get("mileage"))}</span>
                    <span class="dot"></span>
                    <span>{seller}</span>
                </div>
                <div class="card-row dim">
                    <span>{location or "—"}</span>
                </div>
                <div class="card-footer">
                    <span class="card-source">{source_name}</span>
                    <span class="card-time">{posted}</span>
                </div>
            </div>
        </a>'''

    if not listings:
        cards_html = '''
        <div class="empty-state">
            <div class="empty-icon">◇</div>
            <h3>Your Collection Awaits</h3>
            <p>No listings discovered yet. Tap "Run Scraper" to begin the search.</p>
        </div>'''

    next_order = "asc" if current_order == "desc" else "desc"
    arrow = " ↑" if current_order == "asc" else " ↓"

    def pill(field, label):
        active = current_sort == field
        a = arrow if active else ""
        o = next_order if active else "desc"
        src = f"&source={current_source}" if current_source else ""
        cls = "pill active" if active else "pill"
        return f'<a href="/?sort={field}&order={o}{src}" class="{cls}">{label}{a}</a>'

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GX470 — The Collection</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root {{
    --bg: #0c0b0e;
    --surface: #161519;
    --surface2: #1e1d22;
    --border: #2a282f;
    --gold: #c9a96e;
    --gold-dim: #8a7444;
    --text: #f0ece4;
    --text-dim: #7c7873;
    --accent: #c9a96e;
    --serif: 'Playfair Display', Georgia, serif;
    --sans: 'Inter', -apple-system, sans-serif;
}}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html {{ scroll-behavior:smooth; }}
body {{ background:var(--bg); color:var(--text); font-family:var(--sans); -webkit-font-smoothing:antialiased; }}
a {{ text-decoration:none; color:inherit; }}

/* ---- NAV ---- */
.nav {{ display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--border); }}
.nav-brand {{ font-family:var(--serif); font-size:18px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:var(--gold); }}
.nav-sub {{ font-family:var(--sans); font-size:10px; letter-spacing:3px; text-transform:uppercase; color:var(--text-dim); margin-top:2px; }}
.nav-run form {{ display:inline; }}
.nav-run button {{ background:transparent; color:var(--gold); border:1px solid var(--gold-dim); padding:8px 20px; font-family:var(--sans); font-size:11px; letter-spacing:1.5px; text-transform:uppercase; cursor:pointer; transition:all .2s; }}
.nav-run button:hover {{ background:var(--gold); color:var(--bg); }}

/* ---- STATS ---- */
.stats {{ display:grid; grid-template-columns:repeat(4,1fr); border-bottom:1px solid var(--border); }}
.stat {{ padding:20px 24px; border-right:1px solid var(--border); text-align:center; }}
.stat:last-child {{ border-right:none; }}
.stat-label {{ font-size:9px; letter-spacing:2.5px; text-transform:uppercase; color:var(--text-dim); margin-bottom:8px; }}
.stat-value {{ font-family:var(--serif); font-size:24px; font-weight:500; color:var(--text); }}
.stat-value.gold {{ color:var(--gold); }}

/* ---- CONTROLS ---- */
.controls {{ display:flex; align-items:center; gap:8px; padding:16px 24px; border-bottom:1px solid var(--border); overflow-x:auto; }}
.pill {{ font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--text-dim); padding:6px 16px; border:1px solid var(--border); transition:all .15s; white-space:nowrap; }}
.pill.active {{ color:var(--gold); border-color:var(--gold-dim); background:rgba(201,169,110,0.06); }}
.filter-select {{ background:var(--bg); color:var(--text-dim); border:1px solid var(--border); padding:6px 12px; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-family:var(--sans); margin-left:auto; }}

/* ---- FEATURED ---- */
.featured {{ display:block; margin:24px; }}
.featured-img {{ position:relative; width:100%; height:420px; background:var(--surface); background-size:cover; background-position:center; overflow:hidden; }}
.featured-overlay {{ position:absolute; bottom:0; left:0; right:0; padding:32px 28px; background:linear-gradient(transparent, rgba(0,0,0,0.85)); }}
.featured-tag {{ display:inline-block; font-size:9px; letter-spacing:3px; text-transform:uppercase; color:var(--gold); border:1px solid var(--gold-dim); padding:4px 12px; margin-bottom:12px; }}
.featured-title {{ font-family:var(--serif); font-size:28px; font-weight:500; color:#fff; line-height:1.2; }}
.featured-price {{ font-family:var(--serif); font-size:32px; font-weight:600; color:var(--gold); margin:8px 0 6px; }}
.featured-meta {{ font-size:12px; color:rgba(255,255,255,0.6); letter-spacing:0.5px; }}
.no-img-text {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:var(--text-dim); font-size:12px; letter-spacing:2px; text-transform:uppercase; }}

/* ---- GRID ---- */
.grid {{ display:grid; grid-template-columns:1fr; gap:1px; background:var(--border); margin:0 24px 60px; }}
.card {{ display:flex; flex-direction:column; background:var(--bg); overflow:hidden; transition:background .15s; }}
.card:hover {{ background:var(--surface); }}
.card-img {{ width:100%; height:220px; background:var(--surface2); background-size:cover; background-position:center; position:relative; }}
.card-body {{ padding:16px 18px 20px; flex:1; display:flex; flex-direction:column; }}
.card-title {{ font-family:var(--serif); font-size:17px; font-weight:500; color:var(--text); line-height:1.3; }}
.card-price {{ font-family:var(--serif); font-size:22px; font-weight:600; color:var(--gold); margin:6px 0 8px; }}
.card-row {{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); margin-bottom:3px; }}
.card-row.dim {{ color:var(--text-dim); opacity:0.7; }}
.dot {{ width:3px; height:3px; border-radius:50%; background:var(--text-dim); flex-shrink:0; }}
.card-footer {{ margin-top:auto; padding-top:12px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--text-dim); }}

/* ---- EMPTY STATE ---- */
.empty-state {{ grid-column:1/-1; text-align:center; padding:80px 20px; background:var(--bg); }}
.empty-icon {{ font-size:48px; color:var(--gold-dim); margin-bottom:16px; }}
.empty-state h3 {{ font-family:var(--serif); font-size:22px; font-weight:400; color:var(--text); margin-bottom:8px; }}
.empty-state p {{ font-size:13px; color:var(--text-dim); }}

/* ---- RESPONSIVE ---- */
@media(max-width:600px) {{
    .stats {{ grid-template-columns:repeat(2,1fr); }}
    .stat {{ padding:14px 16px; }}
    .stat:nth-child(2) {{ border-right:none; }}
    .stat-value {{ font-size:20px; }}
    .featured {{ margin:16px; }}
    .featured-img {{ height:300px; }}
    .featured-title {{ font-size:22px; }}
    .featured-price {{ font-size:26px; }}
    .grid {{ margin:0 16px 40px; }}
}}
@media(min-width:768px) {{
    .grid {{ grid-template-columns:repeat(2,1fr); }}
}}
@media(min-width:1100px) {{
    .grid {{ grid-template-columns:repeat(3,1fr); }}
    .featured-img {{ height:500px; }}
}}
</style>
</head>
<body>

<div class="nav">
    <div>
        <div class="nav-brand">GX 470</div>
        <div class="nav-sub">The Collection</div>
    </div>
    <div class="nav-run">
        <form method="post" action="/run">
            <button type="submit">Run Scraper</button>
        </form>
    </div>
</div>

<div class="stats">
    <div class="stat">
        <div class="stat-label">Discovered</div>
        <div class="stat-value">{stats["total"]}</div>
    </div>
    <div class="stat">
        <div class="stat-label">Lowest</div>
        <div class="stat-value gold">{fmt_price(stats["lowest_price"])}</div>
    </div>
    <div class="stat">
        <div class="stat-label">Average</div>
        <div class="stat-value">{fmt_price(stats["avg_price"])}</div>
    </div>
    <div class="stat">
        <div class="stat-label">Last Scan</div>
        <div class="stat-value" style="font-size:14px">{days_ago(stats["last_scraped"])}</div>
    </div>
</div>

<div class="controls">
    {pill("date_scraped", "Recent")}
    {pill("price", "Price")}
    {pill("mileage", "Mileage")}
    {pill("year", "Year")}
    <form method="get" style="margin-left:auto">
        <input type="hidden" name="sort" value="{current_sort}">
        <input type="hidden" name="order" value="{current_order}">
        <select name="source" class="filter-select" onchange="this.form.submit()">
            <option value="">All Sources</option>
            {source_options}
        </select>
    </form>
</div>

{featured_html}

<div class="grid">
    {cards_html}
</div>

</body>
</html>'''


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    init_db()
    sort = request.args.get("sort", "date_scraped")
    order = request.args.get("order", "desc")
    source = request.args.get("source", "")
    listings = get_listings(sort=sort, order=order, source=source or None)
    stats = get_stats()
    sources = get_sources()
    return render_page(listings, stats, sources, sort, order, source)


@app.route("/run", methods=["POST"])
def trigger_run():
    """Trigger scraper in background thread."""
    def _run():
        from .main import run
        asyncio.run(run())

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return redirect(url_for("index"))


@app.route("/api/listings")
def api_listings():
    init_db()
    sort = request.args.get("sort", "date_scraped")
    order = request.args.get("order", "desc")
    source = request.args.get("source")
    listings = get_listings(sort=sort, order=order, source=source)
    return jsonify(listings)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})
