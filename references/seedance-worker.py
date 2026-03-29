"""
AgentCab Worker for: Seedance 2.0 AI Video Generator
Skill ID: f35ccd53-3a42-4cff-9c01-1f15c096d4de

Connects to jimeng-free-api-all (local) for Seedance 2.0 video generation.

Usage:
  1. Start jimeng-free-api-all on port 8000
  2. Edit .env — add AGENTCAB_API_KEY and JIMENG_SESSION_ID
  3. ./start.sh
"""

import os
import sys
import math
import tempfile
import logging
import requests
from dotenv import load_dotenv
from agentcab import ProviderClient, ProviderWorker

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_KEY = os.environ.get("AGENTCAB_API_KEY", "")
SKILL_ID = "f35ccd53-3a42-4cff-9c01-1f15c096d4de"
JIMENG_API = os.environ.get("JIMENG_API_URL", "http://127.0.0.1:8000")
JIMENG_SESSION_ID = os.environ.get("JIMENG_SESSION_ID", "")

# Disable proxy for local jimeng API requests
JIMENG_PROXIES = {"http": None, "https": None}

# Pricing: base_rate=12 credits/sec, resolution mult, model mult
PRICE_BASE = 12
RESOLUTION_MULT = {"480p": 0.6, "720p": 1.0, "1080p": 1.8}
MODEL_MULT = {"seedance-2.0": 1.0, "seedance-2.0-fast": 0.6}

if not API_KEY:
    print("ERROR: AGENTCAB_API_KEY not set. Edit .env file first.")
    sys.exit(1)
if not JIMENG_SESSION_ID:
    print("ERROR: JIMENG_SESSION_ID not set. Edit .env file first.")
    sys.exit(1)

client = ProviderClient(api_key=API_KEY)


def calculate_cost(duration: int, resolution: str, model: str) -> int:
    """Calculate actual_cost based on duration, resolution, and model."""
    res_mult = RESOLUTION_MULT.get(resolution, 1.0)
    mod_mult = MODEL_MULT.get(model, 1.0)
    return max(1, math.ceil(duration * PRICE_BASE * res_mult * mod_mult))


def process_job(job):
    """Process a Seedance 2.0 video generation job."""
    call_id = job.get("call_id", "")
    input_data = job.get("input", {})
    log.info(f"[{call_id}] Processing Seedance 2.0 job")

    # Extract parameters with defaults
    prompt = input_data.get("prompt", "")
    file_ids = input_data.get("files", [])
    model = input_data.get("model", "seedance-2.0")
    ratio = input_data.get("ratio", "16:9")
    duration = input_data.get("duration", 5)
    resolution = input_data.get("resolution", "720p")

    temp_dir = tempfile.mkdtemp(prefix="seedance_")

    try:
        # Step 1: Download input files from AgentCab (if any)
        local_files = []
        if file_ids:
            log.info(f"[{call_id}] Downloading {len(file_ids)} input file(s)...")
        for i, file_id in enumerate(file_ids):
            try:
                # Use directory so SDK preserves original filename with extension
                save_dir = os.path.join(temp_dir, f"input_{i}")
                os.makedirs(save_dir, exist_ok=True)
                downloaded = client.download_file(file_id, save_dir + "/")
                local_files.append(downloaded)
                log.info(f"[{call_id}] Downloaded file {i+1}: {downloaded}")
            except Exception as e:
                log.error(f"[{call_id}] Failed to download file {file_id}: {e}")
                return {
                    "success": False,
                    "message": f"Failed to download input file: {e}",
                    "actual_cost": 0,
                }

        # Step 2: Call jimeng-free-api-all via multipart upload
        jimeng_model = f"jimeng-video-{model}" if not model.startswith("jimeng-") else model
        log.info(f"[{call_id}] Calling Seedance API: model={jimeng_model}, ratio={ratio}, duration={duration}, resolution={resolution}")

        # Build request
        import mimetypes
        jimeng_headers = {"Authorization": f"Bearer {JIMENG_SESSION_ID}"}

        if local_files:
            # Multipart upload with files
            data = {
                "model": jimeng_model,
                "prompt": prompt or "",
                "ratio": ratio,
                "duration": str(duration),
                "resolution": resolution,
            }
            files_list = []
            open_handles = []
            for path in local_files:
                fh = open(path, "rb")
                open_handles.append(fh)
                mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
                files_list.append(("files", (os.path.basename(path), fh, mime)))
            try:
                response = requests.post(
                    f"{JIMENG_API}/v1/videos/generations",
                    headers=jimeng_headers,
                    data=data,
                    files=files_list,
                    timeout=600,
                    proxies=JIMENG_PROXIES,
                )
            finally:
                for fh in open_handles:
                    fh.close()
        else:
            # JSON request without files (text-to-video)
            jimeng_headers["Content-Type"] = "application/json"
            response = requests.post(
                f"{JIMENG_API}/v1/videos/generations",
                headers=jimeng_headers,
                json={
                    "model": jimeng_model,
                    "prompt": prompt,
                    "ratio": ratio,
                    "duration": duration,
                    "resolution": resolution,
                },
                timeout=600,
                proxies=JIMENG_PROXIES,
            )

        result = response.json()
        log.info(f"[{call_id}] Jimeng API response: code={result.get('code', 'N/A')}")

        # Check for errors
        if result.get("code") and result["code"] != 0:
            return {
                "success": False,
                "message": result.get("message", "Video generation failed"),
                "actual_cost": 0,
                "error": result.get("message", ""),
            }

        # Extract video URL
        video_data = result.get("data", [])
        if not video_data or not video_data[0].get("url"):
            return {
                "success": False,
                "message": "No video URL in response",
                "actual_cost": 0,
            }

        video_url = video_data[0]["url"]
        revised_prompt = video_data[0].get("revised_prompt", "")
        log.info(f"[{call_id}] Video generated, downloading...")

        # Step 3: Download the generated video
        video_path = os.path.join(temp_dir, "output.mp4")
        video_resp = requests.get(video_url, timeout=120, proxies=JIMENG_PROXIES)
        video_resp.raise_for_status()
        with open(video_path, "wb") as f:
            f.write(video_resp.content)

        video_size = os.path.getsize(video_path)
        log.info(f"[{call_id}] Video downloaded: {video_size / 1024 / 1024:.1f} MB")

        # Step 4: Upload video to AgentCab
        log.info(f"[{call_id}] Uploading video to AgentCab...")
        file_info = client.upload_result_file(call_id, video_path)
        video_file_id = file_info.get("file_id", "")
        log.info(f"[{call_id}] Uploaded: file_id={video_file_id}")

        # Step 5: Calculate actual cost
        actual_cost = calculate_cost(duration, resolution, model)
        log.info(f"[{call_id}] Cost: {actual_cost} credits (duration={duration}s, res={resolution}, model={model})")

        return {
            "success": True,
            "message": f"Video generated successfully ({duration}s {resolution} {model})",
            "actual_cost": actual_cost,
            "video_file_id": video_file_id,
            "duration": duration,
            "model": model,
            "revised_prompt": revised_prompt,
        }

    except requests.Timeout:
        log.error(f"[{call_id}] Timeout waiting for video generation")
        return {
            "success": False,
            "message": "Video generation timed out (10 minutes)",
            "actual_cost": 0,
        }
    except Exception as e:
        log.error(f"[{call_id}] Error: {e}")
        return {
            "success": False,
            "message": str(e),
            "actual_cost": 0,
        }
    finally:
        import shutil
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    log.info("Worker started for: Seedance 2.0 AI Video Generator")
    log.info(f"Skill ID: {SKILL_ID}")
    log.info(f"Jimeng API: {JIMENG_API}")
    log.info("Polling for jobs... (Ctrl+C to stop)")

    worker = ProviderWorker(
        api_key=API_KEY,
        process_fn=process_job,
        max_workers=2,
        poll_interval=3,
        skill_ids=[SKILL_ID],
    )
    worker.run()
