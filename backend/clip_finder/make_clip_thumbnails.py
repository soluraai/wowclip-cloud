import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import requests
from PIL import Image

from reel.cut_clip_from_youtube import create_clip, download_file, wait_for_clip
from settings import OUTPUT_FOLDER, PROXY_URL

PROXIES = {"http": PROXY_URL, "https": PROXY_URL}
SECONDS_AFTER_START = 3
HD_FRAMES_AT_ONCE = 8


def frame_moment(clip):
    return min(clip["start_seconds"] + SECONDS_AFTER_START, clip["end_seconds"] - 1)


def get_storyboard(page):
    best = None
    for item in page.get("formats") or []:
        is_storyboard = item.get("format_id", "").startswith("sb")
        if not is_storyboard or not item.get("fragments"):
            continue
        if best is None or item["width"] > best["width"]:
            best = item
    return best


def find_storyboard_frame(storyboard, seconds):
    frames_per_sheet = storyboard["rows"] * storyboard["columns"]
    fragments = storyboard["fragments"]

    sheet_start = 0
    for number, fragment in enumerate(fragments):
        is_last = number == len(fragments) - 1
        if seconds < sheet_start + fragment["duration"] or is_last:
            seconds_per_frame = fragment["duration"] / frames_per_sheet
            index = int((seconds - sheet_start) / seconds_per_frame)
            index = max(0, min(index, frames_per_sheet - 1))
            return fragment["url"], index
        sheet_start = sheet_start + fragment["duration"]


def download_sheet(url, sheets):
    if url in sheets:
        return sheets[url]

    last_error = None
    for proxies in [None, PROXIES, PROXIES]:
        try:
            response = requests.get(url, proxies=proxies, timeout=20)
            response.raise_for_status()
            sheets[url] = Image.open(BytesIO(response.content)).convert("RGB")
            return sheets[url]
        except Exception as error:
            last_error = error
            time.sleep(0.5)
    raise Exception(f"Could not download the storyboard: {last_error}")


def cut_storyboard_frame(storyboard, seconds, path, sheets):
    url, index = find_storyboard_frame(storyboard, seconds)
    sheet = download_sheet(url, sheets)
    width = storyboard["width"]
    height = storyboard["height"]
    column = index % storyboard["columns"]
    row = index // storyboard["columns"]
    frame = sheet.crop((column * width, row * height, (column + 1) * width, (row + 1) * height))
    frame = frame.resize((640, int(640 * height / width)), Image.LANCZOS)
    frame.save(path, quality=88)


def make_preview_frames(folder_name, clips, page):
    folder = os.path.join(OUTPUT_FOLDER, folder_name)
    os.makedirs(folder, exist_ok=True)
    storyboard = get_storyboard(page)
    sheets = {}

    def make_one(number, clip):
        clip["thumbnail_file"] = ""
        clip["frame_quality"] = "none"
        if storyboard is None:
            return
        path = os.path.join(folder, f"clip_{number}_preview.jpg")
        try:
            cut_storyboard_frame(storyboard, frame_moment(clip), path, sheets)
            clip["thumbnail_file"] = path
            clip["frame_quality"] = "preview"
        except Exception as error:
            print("Storyboard frame failed for clip", number, ":", error)

    with ThreadPoolExecutor(max_workers=HD_FRAMES_AT_ONCE) as workers:
        for number, clip in enumerate(clips, start=1):
            workers.submit(make_one, number, clip)
    return clips


def cut_hd_frame(video_id, seconds, path):
    created = create_clip(video_id, seconds, seconds + 1, "1080p")
    clip = wait_for_clip(created["clip_id"])
    video_path = path.replace(".jpg", ".mp4")
    download_file(clip["url"], video_path)
    command = ["ffmpeg", "-y", "-loglevel", "error", "-i", video_path, "-frames:v", "1", "-q:v", "2", path]
    subprocess.run(command, capture_output=True, timeout=30)
    os.remove(video_path)
    if not os.path.exists(path):
        raise Exception("ffmpeg could not read the frame")


def make_hd_frames(folder_name, clips, video_id, log=print):
    folder = os.path.join(OUTPUT_FOLDER, folder_name)
    os.makedirs(folder, exist_ok=True)

    def make_one(number, clip):
        path = os.path.join(folder, f"clip_{number}.jpg")
        started = time.time()
        try:
            cut_hd_frame(video_id, frame_moment(clip), path)
            clip["thumbnail_file"] = path
            clip["frame_quality"] = "hd"
            log(f"Clip {number}: 1080p frame ready in {time.time() - started:.1f}s")
        except Exception as error:
            log(f"Clip {number}: kept the preview frame ({error})")

    with ThreadPoolExecutor(max_workers=HD_FRAMES_AT_ONCE) as workers:
        for number, clip in enumerate(clips, start=1):
            workers.submit(make_one, number, clip)
    return clips
