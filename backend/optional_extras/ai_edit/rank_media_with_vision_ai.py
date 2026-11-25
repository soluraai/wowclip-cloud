import base64
import io
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor

import requests
from PIL import Image, ImageDraw, ImageFont

from settings import EDIT_VISION_MODELS, OPENROUTER_API_KEY

API_URL = "https://openrouter.ai/api/v1/chat/completions"
TILE = 256
COLUMNS = 4
MOST_TILES = 12
THUMB_SECONDS = 7
VISION_SECONDS = 18
BROWSER = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/131.0 Safari/537.36"}
USES = {
    "broll": "a full-screen 9:16 cutaway in the reel",
    "split": "the top half of a split screen (a wide frame, 1080x960)",
    "card": "a photo card that pops up over the speaker",
    "image": "a picture inside a motion graphic",
    "portrait": "a portrait introducing this person (the face must be clear)",
    "gallery": "one tile of a set of pictures",
    "template": "the main picture of a full-screen news or showcase motion graphic",
}

thumb_pool = ThreadPoolExecutor(max_workers=32)
label_font = ImageFont.load_default(size=30)


def load_thumb(url):
    response = requests.get(url, headers=BROWSER, timeout=(4, THUMB_SECONDS))
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content))
    image.load()
    return image.convert("RGB")


def contact_sheet(candidates):
    futures = [thumb_pool.submit(load_thumb, item["thumb"]) for item in candidates[:MOST_TILES]]
    tiles = []
    for index, future in enumerate(futures):
        try:
            tiles.append((index, future.result(timeout=THUMB_SECONDS + 4)))
        except Exception:
            continue
    if not tiles:
        return None, []
    rows = math.ceil(len(tiles) / COLUMNS)
    sheet = Image.new("RGB", (COLUMNS * TILE, rows * TILE), (28, 28, 30))
    draw = ImageDraw.Draw(sheet)
    for slot, (_, image) in enumerate(tiles):
        image.thumbnail((TILE - 10, TILE - 10))
        left = (slot % COLUMNS) * TILE
        top = (slot // COLUMNS) * TILE
        sheet.paste(image, (left + (TILE - image.width) // 2, top + (TILE - image.height) // 2))
        draw.rectangle([left + 4, top + 4, left + 50, top + 44], fill=(0, 0, 0))
        draw.text((left + 12, top + 7), str(slot + 1), fill=(255, 214, 0), font=label_font)
    buffer = io.BytesIO()
    sheet.save(buffer, "JPEG", quality=82)
    return buffer.getvalue(), [index for index, _ in tiles]


def vision_prompt(request, use, count, kind):
    what = "cover frames of short videos" if kind == "video" else "pictures"
    return "\n".join([
        f"You pick footage for a vertical video reel. The {count} numbered {what} are search results for: \"{request['query']}\".",
        f"What it must show: {request['look'] or request['query']}.",
        f"It will be used as {USES.get(use, 'a cutaway')}.",
        "Choose only ones that truly show this. Reject: the wrong subject or a different person, watermarks or stock-site",
        "overlays, big burned-in text or captions, memes, collages, screenshots of web pages, blurry, dark or tiny pictures,",
        "anything sexual, violent or gory. Prefer sharp, well-lit, professional-looking shots.",
        "Answer only JSON: {\"picks\": [{\"n\": 3, \"x\": 0.5, \"y\": 0.4}]} with at most 3 picks, best first. x and y say where",
        "the main subject (the face, if there is a person) sits in that picture, 0 to 1 from the left and from the top.",
        "Answer {\"picks\": []} if none of them fits.",
    ])


def ask_vision(sheet, prompt):
    image_url = "data:image/jpeg;base64," + base64.b64encode(sheet).decode()
    problems = []
    for llm in EDIT_VISION_MODELS:
        body = {
            "model": llm["model"],
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt},
                                                       {"type": "image_url", "image_url": {"url": image_url}}]}],
            "temperature": 0.1,
            "max_tokens": 400,
            "provider": {"order": llm["providers"], "allow_fallbacks": False},
            "usage": {"include": True},
        }
        try:
            response = requests.post(API_URL, json=body, headers={"Authorization": "Bearer " + OPENROUTER_API_KEY},
                                     timeout=(6, VISION_SECONDS))
            if response.status_code != 200:
                raise Exception(f"error {response.status_code}")
            answer = response.json()["choices"][0]["message"].get("content") or ""
            match = re.search(r"\{.*\}", answer, re.S)
            picks = json.loads(match.group(0)).get("picks") if match else None
            if not isinstance(picks, list):
                raise Exception("no picks in the answer")
            return {"picks": picks, "model": llm["name"]}
        except Exception as error:
            problems.append(f"{llm['name']}: {str(error)[:80]}")
    raise Exception("; ".join(problems))


def aspect_score(item, use):
    width, height = item.get("width") or 0, item.get("height") or 0
    if not width or not height:
        return 0.5
    ratio = width / height
    if use == "broll":
        return 1.0 if ratio <= 0.8 else 0.75 if ratio <= 1.2 else 0.55
    if use == "split":
        return 1.0 if 1.0 <= ratio <= 1.9 else 0.6
    if use == "portrait":
        return 1.0 if ratio <= 1.1 else 0.6
    return 0.8


def heuristic_order(candidates, use):
    def score(position):
        item = candidates[position]
        size = min(item.get("width") or 900, item.get("height") or 900)
        return aspect_score(item, use) + min(size, 1600) / 3200 - position * 0.1
    return sorted(range(len(candidates)), key=score, reverse=True)


def rank_candidates(candidates, request, use):
    if not candidates:
        return {"order": [], "focus": {}, "how": "nothing found"}
    fallback = heuristic_order(candidates, use)
    kind = candidates[0]["kind"]
    try:
        sheet, shown = contact_sheet(candidates)
        if sheet is None:
            return {"order": fallback, "focus": {}, "how": "search rank (no previews loaded)"}
        answer = ask_vision(sheet, vision_prompt(request, use, len(shown), kind))
    except Exception as error:
        reason = str(error).split(";")[0].split(": ", 1)[-1][:40]
        return {"order": fallback, "focus": {}, "how": f"search rank (vision offline: {reason})"}
    order = []
    focus = {}
    for pick in answer["picks"]:
        if not isinstance(pick, dict) or not isinstance(pick.get("n"), int) or not 1 <= pick["n"] <= len(shown):
            continue
        index = shown[pick["n"] - 1]
        if index in order:
            continue
        order.append(index)
        x, y = pick.get("x"), pick.get("y")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            focus[index] = (min(1.0, max(0.0, float(x))), min(1.0, max(0.0, float(y))))
    if not order:
        return {"order": [], "focus": {}, "how": answer["model"] + " found none that fit"}
    return {"order": order, "focus": focus, "how": answer["model"]}
