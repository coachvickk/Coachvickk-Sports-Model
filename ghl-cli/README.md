# GHL CLI — GoHighLevel Pipeline Manager

Manage your sales pipeline from the command line.

**Pipeline:** Warmed Up → Replying → Meetings → Paid

## Setup

```bash
cd ghl-cli
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your GHL API key and location ID
```

## Commands

```bash
# Dashboard — see your whole pipeline at a glance
python ghl.py dashboard

# Pipeline stages
python ghl.py pipeline stages
python ghl.py pipeline view

# Contacts
python ghl.py contacts list
python ghl.py contacts list -q "John"
python ghl.py contacts create -f John -l Doe -e john@example.com -s "Warmed Up" -v 5000
python ghl.py contacts get CONTACT_ID
python ghl.py contacts tag CONTACT_ID -a "hot-lead" -a "sports"

# Opportunities
python ghl.py opps list
python ghl.py opps list -s "Replying"
python ghl.py opps won OPP_ID -v 10000
python ghl.py opps lost OPP_ID

# Move contacts through stages
python ghl.py move OPP_ID "Replying"
python ghl.py advance OPP_ID          # moves to next stage automatically

# JSON output (for automation)
python ghl.py contacts list -j
python ghl.py opps list -j
```

## Pipeline Flow

```
Warmed Up → Replying → Meetings → Paid
```

- **Warmed Up** — Initial contact, lead is engaged
- **Replying** — Contact is actively responding
- **Meetings** — Meeting scheduled or completed
- **Paid** — Deal closed, payment received
