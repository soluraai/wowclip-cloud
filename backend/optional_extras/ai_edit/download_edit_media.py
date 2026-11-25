import hashlib
import io
import json
import os
import subprocess
import threading

import requests
from PIL import Image, ImageOps

from aws.s3_storage import upload_file
from settings import OUTPUT_FOLDER

MEDIA_FOLDER = os.path.join(OUTPUT_FOLDER, "edit_media")
INDEX_FILE = os.path.join(MEDIA_FOLDER, "index.json")
KEY_FOLDER = "wowclip/edits/media/"
LONG_SIDE = 2048
MIN_SIDE = 480
FULL_FRAME_SIDE = 720
MOST_BYTES = 30 * 1024 * 1024
VIDEO_SECONDS = 12
SHORTEST_VIDEO = 2.0
FFMPEG_SECONDS = 70
BROWSER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

os.makedirs(MEDIA_FOLDER, exist_ok=True)
index_lock = threading.Lock()
index = {}
if os.path.exists(INDEX_FILE):
    with open(INDEX_FILE, encoding="utf-8") as file:
        index = json.load(file)


def name_of(url):
    return hashlib.sha1(url.encode()).hexdigest()[:20]


def remembered(url):
    with index_lock:
        return index.get(name_of(url))


def remember(url, media):
    with index_lock:
        index[name_of(url)] = media
        with open(INDEX_FILE + ".part", "w", encoding="utf-8") as file:
            json.dump(index, file)
        os.replace(INDEX_FILE + ".part", INDEX_FILE)


def download(url):
    headers = {"User-Agent": BROWSER_AGENT, "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*"}
    with requests.get(url, headers=headers, timeout=(5, 12), stream=True) as response:
        response.raise_for_status()
        if "text/html" in response.headers.get("Content-Type", ""):
            raise Exception("the link is a web page, not a picture")
        data = bytearray()
        for chunk in response.iter_content(256 * 1024):
            data.extend(chunk)
            if len(data) > MOST_BYTES:
                raise Exception("the picture is too big")
    return bytes(data)


def save_image(candidate, min_side):
    known = remembered(candidate["url"])
    if known:
        if min(known["width"], known["height"]) < min_side:
            raise Exception(f"too small ({known['width']}x{known['height']})")
        return known
    image = Image.open(io.BytesIO(download(candidate["url"])))
    image = ImageOps.exif_transpose(image).convert("RGB")
    if min(image.size) < MIN_SIDE or min(image.size) < min_side:
        raise Exception(f"too small ({image.width}x{image.height})")
    image.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
    name = name_of(candidate["url"])
    path = os.path.join(MEDIA_FOLDER, name + ".jpg")
    image.save(path, "JPEG", quality=86, optimize=True, progressive=True)
    key = KEY_FOLDER + name + ".jpg"
    upload_file(path, key, "image/jpeg")
    media = {"kind": "image", "src": "s3:" + key, "width": image.width, "height": image.height}
    remember(candidate["url"], media)
    return media


def probe_video(path):
    command = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
               "-of", "json", path]
    data = json.loads(subprocess.run(command, capture_output=True, text=True, timeout=20).stdout or "{}")
    stream = (data.get("streams") or [{}])[0]
    return int(stream.get("width") or 0), int(stream.get("height") or 0), float((data.get("format") or {}).get("duration") or 0)


def save_video(candidate):
    known = remembered(candidate["url"])
    if known:
        return known
    name = name_of(candidate["url"])
    path = os.path.join(MEDIA_FOLDER, name + ".mp4")
    poster = os.path.join(MEDIA_FOLDER, name + "-poster.jpg")
    command = ["ffmpeg", "-y", "-loglevel", "error", "-rw_timeout", "15000000", "-user_agent", BROWSER_AGENT]
    if candidate.get("source") == "TikTok":
        command += ["-headers", "Referer: https://www.tiktok.com/\r\n"]
    command += ["-t", str(VIDEO_SECONDS), "-i", candidate["url"], "-an",
                "-vf", "scale='min(1080,iw)':-2:flags=bicubic,fps=30,format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", path]
    result = subprocess.run(command, capture_output=True, text=True, timeout=FFMPEG_SECONDS)
    if result.returncode != 0 or not os.path.exists(path):
        raise Exception("could not read the video: " + (result.stderr or "")[-120:].strip())
    width, height, duration = probe_video(path)
    if duration < SHORTEST_VIDEO or min(width, height) < 360:
        raise Exception(f"the video is too short or too small ({width}x{height}, {duration:.1f}s)")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.4", "-i", path, "-frames:v", "1", "-vf", "scale=480:-2",
                    "-q:v", "4", poster], capture_output=True, timeout=30)
    key = KEY_FOLDER + name + ".mp4"
    upload_file(path, key, "video/mp4")
    media = {"kind": "video", "src": "s3:" + key, "width": width, "height": height, "duration": round(duration, 2)}
    if os.path.exists(poster):
        upload_file(poster, KEY_FOLDER + name + "-poster.jpg", "image/jpeg")
        media["poster"] = "s3:" + KEY_FOLDER + name + "-poster.jpg"
    remember(candidate["url"], media)
    return media


def save_media(candidate, use):
    if candidate["kind"] == "video":
        return save_video(candidate)
    return save_image(candidate, FULL_FRAME_SIDE if use in ("broll", "split") else MIN_SIDE)
