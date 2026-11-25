import time

import requests

from settings import PROXY_URL

PROXIES = {"http": PROXY_URL, "https": PROXY_URL}
TRIES = 3


def pick_track(tracks):
    for language in tracks:
        for item in tracks[language]:
            is_json = item["ext"] == "json3"
            is_translated = "tlang=" in item["url"]
            if is_json and not is_translated:
                return language, item["url"]
    return None, None


def find_caption_url(page):
    auto_tracks = page.get("automatic_captions") or {}
    manual_tracks = page.get("subtitles") or {}

    language, url = pick_track(auto_tracks)
    if url:
        return "auto", language, url

    language, url = pick_track(manual_tracks)
    if url:
        return "manual", language, url

    raise Exception("This video has no captions.")


def download_captions(url):
    response = requests.get(url, proxies=PROXIES, timeout=45)
    if response.text.strip() == "":
        raise Exception("YouTube sent an empty caption file.")
    return response.json()


def json_to_lines(data):
    lines = []
    for event in data["events"]:
        if "segs" not in event:
            continue

        start = event["tStartMs"] / 1000
        end = start + event.get("dDurationMs", 0) / 1000

        text = ""
        words = []
        for part in event["segs"]:
            text = text + part["utf8"]
            word = part["utf8"].replace("\n", " ").strip()
            if word != "":
                word_start = start + part.get("tOffsetMs", 0) / 1000
                words.append({"text": word, "start": word_start})

        text = text.replace("\n", " ").strip()
        if text == "":
            continue

        for number, word in enumerate(words):
            if number + 1 < len(words):
                word["end"] = words[number + 1]["start"]
            else:
                word["end"] = end

        lines.append({"start": start, "end": end, "text": text, "words": words})
    return lines


def get_captions(page):
    kind, language, url = find_caption_url(page)

    last_error = None
    for attempt in range(TRIES):
        try:
            data = download_captions(url)
            lines = json_to_lines(data)
            return {"kind": kind, "language": language, "lines": lines}
        except Exception as error:
            last_error = error
            time.sleep(1)

    raise Exception(f"Could not get captions after {TRIES} tries: {last_error}")
