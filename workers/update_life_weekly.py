"""Update Life Weekly Report API with richer input schema"""
import json
import subprocess
import os
import sys

API_KEY = "ah_fptKwGT9yAi33f9ffpmYhCWXgcMIcjvnCNUSeGorMPU"
SKILL_ID = "6e9e8720-be31-4ce6-a471-66a04e154d54"

input_schema = {
    "type": "object",
    "properties": {
        "photos": {
            "type": "array",
            "format": "device:photos_recent",
            "title": "Recent Photos",
            "description": "Photos from the last 7 days with metadata",
            "x-device-options": {"days": 7, "limit": 300}
        },
        "calendar": {
            "type": "array",
            "format": "device:calendar_week",
            "title": "This Week's Events"
        },
        "contacts": {
            "type": "array",
            "format": "device:contacts",
            "title": "Contacts",
            "x-device-options": {"limit": 200}
        },
        "call_log": {
            "type": "array",
            "format": "device:call_log",
            "title": "Call Log",
            "description": "Phone call records from the past 7 days",
            "x-device-options": {"days": 7, "limit": 100}
        },
        "location": {
            "type": "object",
            "format": "device:location",
            "title": "Current Location"
        },
        "apps": {
            "type": "array",
            "format": "device:apps",
            "title": "Installed Apps"
        },
        "storage": {
            "type": "object",
            "format": "device:storage",
            "title": "Storage Stats"
        },
        "battery": {
            "type": "object",
            "format": "device:battery",
            "title": "Battery Status"
        },
        "wifi": {
            "type": "object",
            "format": "device:wifi",
            "title": "WiFi Info"
        },
        "device_info": {
            "type": "object",
            "format": "device:device_info",
            "title": "Device Info"
        },
        "custom_note": {
            "type": "string",
            "title": "Personal Note (Optional)",
            "description": "Add anything you want the AI to include"
        }
    },
    "required": ["photos"]
}

output_schema = {
    "type": "object",
    "properties": {
        "report": {"type": "string", "description": "Markdown weekly report"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "persona": {"type": "string", "description": "Weekly persona label"},
        "one_liner": {"type": "string", "description": "One sentence summary"},
        "stats": {
            "type": "object",
            "properties": {
                "photos_count": {"type": "integer"},
                "screenshots_count": {"type": "integer"},
                "events_count": {"type": "integer"},
                "calls_count": {"type": "integer"},
                "total_call_minutes": {"type": "number"},
                "top_contact": {"type": "string"},
                "busiest_day": {"type": "string"},
                "night_owl_score": {"type": "integer"},
                "city": {"type": "string"}
            }
        },
        "card_html": {"type": "string", "description": "HTML card for screenshot"},
        "actions": {"type": "array"}
    },
    "required": ["report", "highlights", "persona", "stats"]
}

env = {**os.environ, "AGENTCAB_API_KEY": API_KEY}
cmd = [
    sys.executable, "-m", "agentcab", "provider", "update", SKILL_ID,
    "--input-schema", json.dumps(input_schema),
    "--output-schema", json.dumps(output_schema),
    "--description", "AI-powered personal weekly life report. Analyzes your photos, calendar, call log, apps, location, battery and more to generate a fun, insightful weekly summary with a shareable card image. Features: persona labeling, night owl score, work vs weekend analysis, screenshot detective, and beautiful card generation.",
]

result = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=os.path.expanduser("~/agentcab-worker"))
print("STDOUT:", result.stdout)
if result.stderr and 'NotOpenSSLWarning' not in result.stderr:
    print("STDERR:", result.stderr)
print("Exit:", result.returncode)
