"""
Create the two skills on AgentCab: Life Weekly Report + Phone Slim Coach
"""
import json
import subprocess
import sys

API_KEY = "ah_fptKwGT9yAi33f9ffpmYhCWXgcMIcjvnCNUSeGorMPU"

skills = [
    {
        "name": "AI Life Weekly Report",
        "description": "Generate a personalized AI weekly life report. Automatically analyzes your recent photos, calendar events, call history, and location to create a beautiful summary of your week with insights and highlights. Zero manual input needed — just tap collect and run.",
        "category": "lifestyle",
        "price": 5,
        "tags": "ai,weekly,report,life,photos,calendar",
        "input_schema": {
            "type": "object",
            "properties": {
                "photos": {
                    "type": "array",
                    "format": "device:photos_recent",
                    "title": "Recent Photos",
                    "description": "Photos from the last 7 days with metadata (date, location, size)",
                    "x-device-options": {"days": 7, "limit": 200}
                },
                "calendar": {
                    "type": "array",
                    "format": "device:calendar_week",
                    "title": "This Week's Events",
                    "description": "Calendar events from the past 7 days"
                },
                "contacts": {
                    "type": "array",
                    "format": "device:contacts",
                    "title": "Contacts",
                    "description": "Contact list for identifying people in your week",
                    "x-device-options": {"limit": 100}
                },
                "location": {
                    "type": "object",
                    "format": "device:location",
                    "title": "Current Location",
                    "description": "Current GPS coordinates"
                },
                "device_info": {
                    "type": "object",
                    "format": "device:device_info",
                    "title": "Device Info"
                },
                "custom_note": {
                    "type": "string",
                    "title": "Personal Note (Optional)",
                    "description": "Add anything you want the AI to include in your weekly report"
                }
            },
            "required": ["photos"]
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "report": {
                    "type": "string",
                    "description": "Markdown formatted weekly life report"
                },
                "highlights": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key highlights/insights from the week"
                },
                "stats": {
                    "type": "object",
                    "properties": {
                        "photos_count": {"type": "integer"},
                        "events_count": {"type": "integer"},
                        "places_visited": {"type": "integer"},
                        "busiest_day": {"type": "string"}
                    },
                    "description": "Week statistics"
                },
                "actions": {
                    "type": "array",
                    "description": "Suggested actions (share, copy to clipboard, etc.)"
                }
            },
            "required": ["report", "highlights"]
        }
    },
    {
        "name": "Phone Slim Coach",
        "description": "AI-powered phone storage optimizer. Scans your device for duplicate photos, large unused files, rarely-used apps, and wasted storage. Generates a detailed cleanup plan with one-tap execution — safely free up gigabytes of space.",
        "category": "utility",
        "price": 3,
        "tags": "cleanup,storage,photos,optimizer,phone,slim",
        "input_schema": {
            "type": "object",
            "properties": {
                "storage": {
                    "type": "object",
                    "format": "device:storage",
                    "title": "Storage Stats",
                    "description": "Total, used, and free storage space"
                },
                "photo_hashes": {
                    "type": "object",
                    "format": "device:photo_hashes",
                    "title": "Photo Fingerprints",
                    "description": "Perceptual hashes for duplicate detection",
                    "x-device-options": {"limit": 500}
                },
                "downloads": {
                    "type": "array",
                    "format": "device:files_downloads",
                    "title": "Downloads Folder",
                    "description": "Files in the Downloads directory"
                },
                "documents": {
                    "type": "array",
                    "format": "device:files_documents",
                    "title": "Documents Folder",
                    "description": "Files in the Documents directory"
                },
                "apps": {
                    "type": "array",
                    "format": "device:apps",
                    "title": "Installed Apps",
                    "description": "List of installed non-system apps"
                },
                "battery": {
                    "type": "object",
                    "format": "device:battery",
                    "title": "Battery Status"
                }
            },
            "required": ["storage", "downloads"]
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "One-line summary of how much space can be freed"
                },
                "total_saveable_mb": {
                    "type": "number",
                    "description": "Total reclaimable space in MB"
                },
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "saveable_mb": {"type": "number"},
                            "item_count": {"type": "integer"}
                        }
                    },
                    "description": "Breakdown by category (duplicates, large files, etc.)"
                },
                "actions": {
                    "type": "array",
                    "description": "Executable cleanup actions (delete files, confirm batches, etc.)"
                }
            },
            "required": ["summary", "total_saveable_mb", "sections", "actions"]
        }
    }
]


def create_skill(skill):
    cmd = [
        sys.executable, "-m", "agentcab", "provider", "create",
        "--name", skill["name"],
        "--description", skill["description"],
        "--category", skill["category"],
        "--price", str(skill["price"]),
        "--tags", skill["tags"],
        "--input-schema", json.dumps(skill["input_schema"]),
        "--output-schema", json.dumps(skill["output_schema"]),
    ]
    env = {"AGENTCAB_API_KEY": API_KEY, "PATH": "/usr/bin:/usr/local/bin:/opt/homebrew/bin"}
    result = subprocess.run(cmd, capture_output=True, text=True, env={**__import__('os').environ, "AGENTCAB_API_KEY": API_KEY})
    print(f"\n{'='*60}")
    print(f"Creating: {skill['name']}")
    print(f"{'='*60}")
    print("STDOUT:", result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)
    print(f"Exit code: {result.returncode}")


if __name__ == "__main__":
    for skill in skills:
        create_skill(skill)
