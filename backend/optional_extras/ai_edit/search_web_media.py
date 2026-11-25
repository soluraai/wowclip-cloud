import hashlib
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError

import requests

from settings import OUTPUT_FOLDER, SCRAPPA_API_KEY

API_URL = "https://scrappa.co/api"
TIMEOUT_SECONDS = 30
MIN_SIDE = 480
MOST_CANDIDATES = 12
CACHE_FOLDER = os.path.join(OUTPUT_FOLDER, "scrappa_cache")
CACHE_SECONDS = 6 * 3600

os.makedirs(CACHE_FOLDER, exist_ok=True)
fetch_pool = ThreadPoolExecutor(max_workers=40)
search_pool = ThreadPoolExecutor(max_workers=40)
cache = {}
running = {}
cache_lock = threading.Lock()


def answer_file(key):
    return os.path.join(CACHE_FOLDER, hashlib.sha1(key.encode()).hexdigest()[:24] + ".json")


def saved_answer(key):
    path = answer_file(key)
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < CACHE_SECONDS:
        with open(path, encoding="utf-8") as file:
            return json.load(file)
    return None


def fetch(key, path, params):
    headers = {"X-API-KEY": SCRAPPA_API_KEY, "Accept": "application/json"}
    response = requests.get(API_URL + path, params=params, headers=headers, timeout=TIMEOUT_SECONDS)
    if response.status_code != 200:
        raise Exception(f"{path} answered {response.status_code}")
    data = response.json()
    file_path = answer_file(key)
    with open(file_path + ".part", "w", encoding="utf-8") as file:
        json.dump(data, file)
    os.replace(file_path + ".part", file_path)
    return data


def call(path, params):
    key = path + "?" + "&".join(f"{name}={value}" for name, value in sorted(params.items()))
    with cache_lock:
        if key in cache:
            return cache[key]
    data = saved_answer(key)
    if data is None:
        with cache_lock:
            future = running.get(key)
            if future is None:
                future = fetch_pool.submit(fetch, key, path, params)
                running[key] = future
        try:
            data = future.result()
        finally:
            with cache_lock:
                running.pop(key, None)
    with cache_lock:
        cache[key] = data
    return data


def picture(kind, source, url, thumb, width, height, title, duration=None):
    item = {"kind": kind, "source": source, "url": url, "thumb": thumb or url, "width": width or 0, "height": height or 0,
            "title": (title or "")[:120]}
    if duration:
        item["duration"] = duration
    return item


def big_enough(item):
    if not item["width"] or not item["height"]:
        return True
    return min(item["width"], item["height"]) >= MIN_SIDE


def google_images(query):
    data = call("/images", {"q": query, "safe": "active"})
    items = data if isinstance(data, list) else data.get("data") or data.get("images_results") or []
    found = [picture("image", "Google", item.get("original"), item.get("thumbnail"), item.get("original_width"),
                     item.get("original_height"), item.get("title")) for item in items if item.get("original")]
    return [item for item in found if big_enough(item)]


def bing_images(query):
    items = call("/bing/images", {"q": query}).get("data") or []
    found = [picture("image", "Bing", item.get("image_url"), item.get("thumbnail"), item.get("width"), item.get("height"),
                     item.get("title")) for item in items if item.get("image_url")]
    return [item for item in found if big_enough(item)]


def yahoo_images(query):
    items = call("/yahoo/images", {"q": query}).get("data") or []
    return [picture("image", "Yahoo", item.get("image_url"), item.get("thumbnail"), 0, 0, item.get("title"))
            for item in items if item.get("image_url")]


def pinterest_pins(query):
    return call("/pinterest/search", {"query": query, "limit": 30}).get("pins") or []


def pin_sizes(pin):
    images = pin.get("images") or {}
    best = images.get("orig") or images.get("736x") or {}
    small = images.get("474x") or images.get("736x") or best
    return best, small


def pinterest_images(query):
    found = []
    for pin in pinterest_pins(query):
        if pin.get("is_video"):
            continue
        best, small = pin_sizes(pin)
        if best.get("url"):
            found.append(picture("image", "Pinterest", best["url"], small.get("url"), best.get("width"), best.get("height"),
                                 pin.get("title")))
    return [item for item in found if big_enough(item)]


def pinterest_videos(query):
    found = []
    for pin in pinterest_pins(query + " video"):
        if not pin.get("is_video") or not pin.get("video_url"):
            continue
        best, small = pin_sizes(pin)
        if small.get("url") or best.get("url"):
            found.append(picture("video", "Pinterest", pin["video_url"], small.get("url") or best.get("url"),
                                 best.get("width"), best.get("height"), pin.get("title"), pin.get("video_duration")))
    return found


PHOTO_CHAIN = [("Bing", bing_images, 12), ("Yahoo", yahoo_images, 8), ("Google", google_images, 10)]
VIDEO_SECONDS = 20


def answer_of(name, future, seconds, counts, problems):
    try:
        items = future.result(timeout=max(0.1, seconds))
    except TimeoutError:
        problems.append(f"{name}: no answer in time")
        return []
    except Exception as error:
        problems.append(f"{name}: {str(error)[:60]}")
        return []
    counts[name] = len(items)
    return items


def unique(items):
    seen = set()
    kept = []
    for item in items:
        if item["url"] not in seen:
            seen.add(item["url"])
            kept.append(item)
    return kept


def find_candidates(want, query):
    started = time.time()
    counts = {}
    problems = []
    found = []
    chain = PHOTO_CHAIN
    if want == "video":
        bing = search_pool.submit(bing_images, query)
        videos = answer_of("Pinterest", search_pool.submit(pinterest_videos, query), VIDEO_SECONDS, counts, problems)
        if len(videos) >= 2:
            found = videos
            chain = []
        else:
            found = videos + answer_of("Bing", bing, 12 - (time.time() - started), counts, problems)
            chain = PHOTO_CHAIN[1:]
    for name, search, seconds in chain:
        if len(unique(found)) >= 4:
            break
        found += answer_of(name, search_pool.submit(search, query), seconds, counts, problems)
    return {"candidates": unique(found)[:MOST_CANDIDATES], "counts": counts, "problems": problems,
            "seconds": round(time.time() - started, 1)}
