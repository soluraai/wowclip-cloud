import re

import requests

from settings import YOUTUBE_API_KEY

API_URL = "https://www.googleapis.com/youtube/v3/videos"


def duration_to_seconds(duration):
    hours = re.search(r"(\d+)H", duration)
    minutes = re.search(r"(\d+)M", duration)
    seconds = re.search(r"(\d+)S", duration)

    total = 0
    if hours:
        total = total + int(hours.group(1)) * 3600
    if minutes:
        total = total + int(minutes.group(1)) * 60
    if seconds:
        total = total + int(seconds.group(1))
    return total


def pick_thumbnail(thumbnails):
    for size in ["maxres", "standard", "high", "medium", "default"]:
        if size in thumbnails:
            return thumbnails[size]["url"]
    return ""


def get_video_info(video_id):
    params = {
        "part": "snippet,contentDetails,statistics",
        "id": video_id,
        "key": YOUTUBE_API_KEY,
    }
    response = requests.get(API_URL, params=params, timeout=30)

    if response.status_code != 200:
        message = response.json()["error"]["message"]
        raise Exception("YouTube API error: " + message)

    items = response.json()["items"]
    if len(items) == 0:
        raise Exception("Video not found. It may be private or deleted.")

    video = items[0]
    snippet = video["snippet"]

    return {
        "video_id": video_id,
        "title": snippet["title"],
        "channel": snippet["channelTitle"],
        "thumbnail": pick_thumbnail(snippet["thumbnails"]),
        "published_at": snippet["publishedAt"],
        "duration_seconds": duration_to_seconds(video["contentDetails"]["duration"]),
        "views": int(video["statistics"].get("viewCount", 0)),
    }
