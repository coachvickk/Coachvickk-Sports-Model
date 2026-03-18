"""GHL API v2 client for contacts, pipelines, and opportunities."""

import requests
from config import GHL_BASE_URL, GHL_PIPELINE_ID, GHL_LOCATION_ID, get_headers


# ── Contacts ──────────────────────────────────────────────────────────

def search_contacts(query="", limit=20):
    """Search contacts by name, email, or phone."""
    url = f"{GHL_BASE_URL}/contacts/"
    params = {"locationId": GHL_LOCATION_ID, "limit": limit}
    if query:
        params["query"] = query
    resp = requests.get(url, headers=get_headers(), params=params)
    resp.raise_for_status()
    return resp.json().get("contacts", [])


def get_contact(contact_id):
    """Get a single contact by ID."""
    url = f"{GHL_BASE_URL}/contacts/{contact_id}"
    resp = requests.get(url, headers=get_headers())
    resp.raise_for_status()
    return resp.json().get("contact", {})


def create_contact(first_name, last_name, email=None, phone=None, tags=None):
    """Create a new contact."""
    url = f"{GHL_BASE_URL}/contacts/"
    body = {
        "locationId": GHL_LOCATION_ID,
        "firstName": first_name,
        "lastName": last_name,
    }
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    if tags:
        body["tags"] = tags
    resp = requests.post(url, headers=get_headers(), json=body)
    resp.raise_for_status()
    return resp.json().get("contact", {})


def update_contact(contact_id, **fields):
    """Update contact fields (firstName, lastName, email, phone, tags, etc.)."""
    url = f"{GHL_BASE_URL}/contacts/{contact_id}"
    resp = requests.put(url, headers=get_headers(), json=fields)
    resp.raise_for_status()
    return resp.json().get("contact", {})


def add_contact_tags(contact_id, tags):
    """Add tags to a contact."""
    url = f"{GHL_BASE_URL}/contacts/{contact_id}/tags"
    resp = requests.post(url, headers=get_headers(), json={"tags": tags})
    resp.raise_for_status()
    return resp.json()


# ── Pipeline & Stages ─────────────────────────────────────────────────

def get_pipelines():
    """List all pipelines for the location."""
    url = f"{GHL_BASE_URL}/opportunities/pipelines"
    params = {"locationId": GHL_LOCATION_ID}
    resp = requests.get(url, headers=get_headers(), params=params)
    resp.raise_for_status()
    return resp.json().get("pipelines", [])


def get_pipeline_stages(pipeline_id=None):
    """Get stages for a specific pipeline."""
    pid = pipeline_id or GHL_PIPELINE_ID
    pipelines = get_pipelines()
    for p in pipelines:
        if p["id"] == pid:
            return p.get("stages", [])
    return []


# ── Opportunities ─────────────────────────────────────────────────────

def get_opportunities(pipeline_id=None, stage_id=None, limit=20):
    """List opportunities, optionally filtered by pipeline/stage."""
    url = f"{GHL_BASE_URL}/opportunities/search"
    params = {
        "locationId": GHL_LOCATION_ID,
        "pipeline_id": pipeline_id or GHL_PIPELINE_ID,
        "limit": limit,
    }
    if stage_id:
        params["stage_id"] = stage_id
    resp = requests.get(url, headers=get_headers(), params=params)
    resp.raise_for_status()
    return resp.json().get("opportunities", [])


def create_opportunity(contact_id, stage_id, name, value=0):
    """Create an opportunity (puts a contact into a pipeline stage)."""
    url = f"{GHL_BASE_URL}/opportunities/"
    body = {
        "pipelineId": GHL_PIPELINE_ID,
        "locationId": GHL_LOCATION_ID,
        "contactId": contact_id,
        "pipelineStageId": stage_id,
        "name": name,
        "monetaryValue": value,
    }
    resp = requests.post(url, headers=get_headers(), json=body)
    resp.raise_for_status()
    return resp.json().get("opportunity", {})


def move_opportunity(opportunity_id, stage_id):
    """Move an opportunity to a different pipeline stage."""
    url = f"{GHL_BASE_URL}/opportunities/{opportunity_id}"
    body = {"pipelineStageId": stage_id}
    resp = requests.put(url, headers=get_headers(), json=body)
    resp.raise_for_status()
    return resp.json().get("opportunity", {})


def update_opportunity(opportunity_id, **fields):
    """Update opportunity fields (status, monetaryValue, name, etc.)."""
    url = f"{GHL_BASE_URL}/opportunities/{opportunity_id}"
    resp = requests.put(url, headers=get_headers(), json=fields)
    resp.raise_for_status()
    return resp.json().get("opportunity", {})
