import json, subprocess, os, sys

API_KEY = "ah_fptKwGT9yAi33f9ffpmYhCWXgcMIcjvnCNUSeGorMPU"
SKILL_ID = "c57edf9f-62bb-4622-96fd-6691efeb84f2"

output_schema = {
    "type": "object",
    "properties": {
        "success": {"type": "boolean"},
        "message": {"type": "string"},
        "summary": {"type": "string", "description": "One-line summary"},
        "total_saveable_mb": {"type": "number"},
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
            }
        },
        "actions": {"type": "array"}
    },
    "required": ["success", "message"]
}

env = {**os.environ, "AGENTCAB_API_KEY": API_KEY}
cmd = [sys.executable, "-m", "agentcab", "provider", "update", SKILL_ID,
       "--output-schema", json.dumps(output_schema)]
result = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=os.path.expanduser("~/agentcab-worker"))
print(result.stdout)
print("Exit:", result.returncode)
