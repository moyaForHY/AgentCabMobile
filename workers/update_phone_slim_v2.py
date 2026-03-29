import json, subprocess, os, sys

API_KEY = "ah_fptKwGT9yAi33f9ffpmYhCWXgcMIcjvnCNUSeGorMPU"
SKILL_ID = "c57edf9f-62bb-4622-96fd-6691efeb84f2"

input_schema = {
    "type": "object",
    "properties": {
        "storage": {
            "type": "object",
            "format": "device:storage",
            "title": "Storage Stats"
        },
        "photo_hashes": {
            "type": "object",
            "format": "device:photo_hashes",
            "title": "Photo Fingerprints",
            "x-device-options": {"limit": 500}
        },
        "photo_bursts": {
            "type": "object",
            "format": "device:photo_bursts",
            "title": "Photo Burst Detection",
            "description": "Detect burst/rapid-fire photos taken within 3 seconds"
        },
        "dir_sizes": {
            "type": "array",
            "format": "device:dir_sizes",
            "title": "Directory Sizes",
            "description": "Size of each top-level directory"
        },
        "social_storage": {
            "type": "object",
            "format": "device:social_storage",
            "title": "Social App Storage",
            "description": "WeChat, QQ, Douyin, Xiaohongshu etc. storage breakdown"
        },
        "app_caches": {
            "type": "array",
            "format": "device:app_caches",
            "title": "App Cache Sizes",
            "description": "Cache size per app (>5MB only)"
        },
        "downloads": {
            "type": "array",
            "format": "device:files_downloads",
            "title": "Downloads"
        },
        "documents": {
            "type": "array",
            "format": "device:files_documents",
            "title": "Documents"
        },
        "apps": {
            "type": "array",
            "format": "device:apps",
            "title": "Installed Apps"
        },
        "battery": {
            "type": "object",
            "format": "device:battery",
            "title": "Battery"
        }
    },
    "required": ["storage"]
}

env = {**os.environ, "AGENTCAB_API_KEY": API_KEY}
cmd = [sys.executable, "-m", "agentcab", "provider", "update", SKILL_ID,
       "--input-schema", json.dumps(input_schema),
       "--description", "AI-powered phone optimizer. Deep scans storage, detects duplicate photos (perceptual hash), burst photos, large/expired files, social app caches (WeChat/QQ/Douyin), and generates intelligent cleanup plans with one-tap execution. Unlike traditional cleaners, uses AI to understand file context and give personalized recommendations."]
result = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=os.path.expanduser("~/agentcab-worker"))
print(result.stdout)
print("Exit:", result.returncode)
