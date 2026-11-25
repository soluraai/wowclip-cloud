import threading
import time
import uuid

from aws.s3_storage import my_styles_key, read_json, write_json

LONGEST_NAME = 60

lock = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def clean_name(name):
    if not isinstance(name, str) or name.strip() == "":
        return None
    return name.strip()[:LONGEST_NAME]


def read_styles():
    return read_json(my_styles_key()) or []


def newest_first(style):
    return style["updatedAt"]


def list_my_styles():
    return sorted(read_styles(), key=newest_first, reverse=True)


def add_my_style(body):
    name = clean_name(body.get("name"))
    if name is None or not isinstance(body.get("styleId"), str) or not isinstance(body.get("settings"), dict):
        return None
    now = now_ms()
    style = {
        "id": uuid.uuid4().hex[:12],
        "name": name,
        "styleId": body["styleId"],
        "settings": body["settings"],
        "createdAt": now,
        "updatedAt": now,
    }
    with lock:
        styles = read_styles()
        styles.insert(0, style)
        write_json(my_styles_key(), styles)
    return style


def update_my_style(style_id, body):
    with lock:
        styles = read_styles()
        for style in styles:
            if style["id"] != style_id:
                continue
            name = clean_name(body.get("name"))
            if name is not None:
                style["name"] = name
            if isinstance(body.get("styleId"), str):
                style["styleId"] = body["styleId"]
            if isinstance(body.get("settings"), dict):
                style["settings"] = body["settings"]
            style["updatedAt"] = now_ms()
            write_json(my_styles_key(), styles)
            return style
    return None


def delete_my_style(style_id):
    with lock:
        styles = read_styles()
        kept = [style for style in styles if style["id"] != style_id]
        write_json(my_styles_key(), kept)
    return len(kept) < len(styles)
