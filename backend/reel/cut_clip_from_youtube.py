import time

import requests

from settings import CLIPSCUTTER_API_KEY

API_URL = "https://api.clipscutter.com/c"
HEADERS = {"x-api-key": CLIPSCUTTER_API_KEY, "Content-Type": "application/json"}
QUALITIES = ["1080p", "high"]
WAIT_LIMIT_SECONDS = 240
FINAL_FAILURES = ["Failure", "Geo Blocked", "Age Restricted", "Format Unavailable"]


def create_clip(video_id, start_seconds, end_seconds, quality):
    body = {
        "video_id": video_id,
        "start_time": round(start_seconds, 2),
        "end_time": round(end_seconds, 2),
        "format": "mp4",
        "quality": quality,
    }
    response = requests.post(API_URL + "/clips/youtube", json=body, headers=HEADERS, timeout=60)
    data = response.json()
    if response.status_code >= 300:
        raise Exception(f"ClipsCutter said {data.get('details') or data.get('message')}")
    return data["data"]


def wait_for_clip(clip_id):
    started = time.time()
    while time.time() - started < WAIT_LIMIT_SECONDS:
        time.sleep(1)
        response = requests.get(f"{API_URL}/clips/{clip_id}", headers=HEADERS, timeout=30)
        clip = response.json()["data"]
        if clip["status"] == "Completed":
            return clip
        if clip["status"] in FINAL_FAILURES:
            raise Exception("ClipsCutter could not make the clip: " + clip["status"])
    raise Exception("ClipsCutter took too long")


def download_file(url, path):
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with open(path, "wb") as file:
            for chunk in response.iter_content(1024 * 256):
                file.write(chunk)


def cut_youtube_clip(video_id, start_seconds, end_seconds, path, log=print):
    last_error = None
    for quality in QUALITIES:
        try:
            started = time.time()
            created = create_clip(video_id, start_seconds, end_seconds, quality)
            log(f"ClipsCutter job {created['clip_id'][:8]} started ({created.get('quality')})")
            clip = wait_for_clip(created["clip_id"])
            log(f"ClipsCutter finished the cut in {time.time() - started:.1f}s, {clip['size'] / 1e6:.1f} MB")

            started = time.time()
            download_file(clip["url"], path)
            log(f"Downloaded the clip in {time.time() - started:.1f}s")
            return {"quality": clip.get("quality"), "size": clip.get("size")}
        except Exception as error:
            last_error = error
            log(f"{quality} failed: {error}")

    raise Exception(f"Could not download the clip: {last_error}")
