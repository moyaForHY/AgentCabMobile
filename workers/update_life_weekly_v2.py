import json, subprocess, os, sys

API_KEY = "ah_fptKwGT9yAi33f9ffpmYhCWXgcMIcjvnCNUSeGorMPU"
SKILL_ID = "6e9e8720-be31-4ce6-a471-66a04e154d54"

output_schema = {
    "type": "object",
    "properties": {
        "success": {"type": "boolean"},
        "message": {"type": "string"},
        "report": {"type": "string", "description": "Markdown weekly report"},
        "persona": {"type": "string", "description": "Weekly persona label"},
        "one_liner": {"type": "string", "description": "One sentence summary"},
        "file_id": {"type": "string", "format": "file_id", "description": "Infographic image file"},
        "filename": {"type": "string"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "stats": {"type": "object"},
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
