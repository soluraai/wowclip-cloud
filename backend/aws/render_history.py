from concurrent.futures import ThreadPoolExecutor

from aws.s3_storage import (APP_FOLDER, console_link, file_link, folder_console_link, history_key, list_keys, read_json,
                            upload_file, write_json)
from settings import AWS_REGION, MEDIA_BUCKET

HISTORY_FOLDER = f"{APP_FOLDER}/history/"


def save_render(record, cover_path):
    if cover_path:
        record["cover_key"] = history_key(record["id"], "jpg")
        upload_file(cover_path, record["cover_key"], "image/jpeg")
    write_json(history_key(record["id"], "json"), record)


def created_at(record):
    return record.get("created_at", "")


def record_for_browser(record):
    item = dict(record)
    item["watch_url"] = file_link(record["reel_key"])
    item["download_url"] = file_link(record["reel_key"], record["file_name"])
    item["cover_url"] = file_link(record["cover_key"]) if record.get("cover_key") else ""
    item["console_url"] = console_link(record["reel_key"])
    return item


def read_records():
    keys = [key for key in list_keys(HISTORY_FOLDER) if key.endswith(".json")]
    with ThreadPoolExecutor(max_workers=16) as pool:
        records = [record for record in pool.map(read_json, keys) if record]
    records.sort(key=created_at, reverse=True)
    return records


def list_renders():
    records = read_records()
    return {
        "bucket": MEDIA_BUCKET,
        "region": AWS_REGION,
        "folder": f"{APP_FOLDER}/",
        "console_url": folder_console_link(f"{APP_FOLDER}/"),
        "renders": [record_for_browser(record) for record in records],
    }
