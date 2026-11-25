import threading
import time

from youtube_data.fetch_youtube_captions import get_captions
from youtube_data.fetch_video_info_from_api import get_video_info
from youtube_data.fetch_youtube_watch_page import get_youtube_page

saved_info = {}
saved_pages = {}
lock = threading.Lock()


def get_info(video_id):
    if video_id not in saved_info:
        saved_info[video_id] = get_video_info(video_id)
    return saved_info[video_id]


def load_page(entry, video_id):
    started = time.time()
    try:
        entry["page"] = get_youtube_page(video_id)
        entry["page_seconds"] = round(time.time() - started, 1)
        entry["captions"] = get_captions(entry["page"])
    except Exception as error:
        entry["error"] = str(error)
    entry["seconds"] = round(time.time() - started, 1)
    entry["ready"].set()


def start_prefetch(video_id):
    with lock:
        if video_id in saved_pages:
            return saved_pages[video_id]
        entry = {"ready": threading.Event(), "page": None, "captions": None, "error": None, "seconds": 0, "page_seconds": 0}
        saved_pages[video_id] = entry
    threading.Thread(target=load_page, args=(entry, video_id), daemon=True).start()
    return entry


def get_page_and_captions(video_id):
    entry = start_prefetch(video_id)
    was_ready = entry["ready"].is_set()
    entry["ready"].wait()
    if entry["error"]:
        with lock:
            saved_pages.pop(video_id, None)
        raise Exception(entry["error"])
    entry["was_ready"] = was_ready
    return entry
