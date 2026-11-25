import time

import yt_dlp

from settings import PROXY_URL

TRIES = 3


def get_youtube_page(video_id):
    options = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignore_no_formats_error": True,
        "proxy": PROXY_URL,
    }
    link = "https://www.youtube.com/watch?v=" + video_id

    last_error = None
    for attempt in range(TRIES):
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                return ydl.extract_info(link, download=False)
        except Exception as error:
            last_error = error
            time.sleep(1)

    raise Exception(f"yt-dlp failed after {TRIES} tries: {last_error}")
