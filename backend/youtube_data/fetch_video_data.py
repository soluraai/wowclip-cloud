import sys

from youtube_data.fetch_youtube_captions import get_captions
from youtube_data.fetch_video_info_from_api import get_video_info
from youtube_data.fetch_youtube_watch_page import get_youtube_page


def fetch_video_data(video_id):
    info = get_video_info(video_id)
    page = get_youtube_page(video_id)
    captions = get_captions(page)
    return {"info": info, "captions": captions, "page": page}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fetch_video_data.py VIDEO_ID")
        sys.exit(1)

    result = fetch_video_data(sys.argv[1])
    info = result["info"]
    captions = result["captions"]

    print("Title:     ", info["title"])
    print("Channel:   ", info["channel"])
    print("Thumbnail: ", info["thumbnail"])
    print("Duration:  ", info["duration_seconds"], "seconds")
    print("Captions:  ", captions["kind"], "/", captions["language"], "/", len(captions["lines"]), "lines")
    print()
    for line in captions["lines"][:5]:
        print(f'{line["start"]:7.1f}s  {line["text"]}')
