import os
from dotenv import load_dotenv

load_dotenv()

GHL_API_KEY = os.getenv("GHL_API_KEY", "")
GHL_BASE_URL = "https://services.leadconnectorhq.com"
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "")
GHL_PIPELINE_ID = os.getenv("GHL_PIPELINE_ID", "pit-7c5ebd94-22f2-4f65-a1ea-5dc4825a6848")

# Pipeline stages in order
PIPELINE_STAGES = [
    "Warmed Up",
    "Replying",
    "Meetings",
    "Paid",
]

def get_headers():
    return {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
    }
