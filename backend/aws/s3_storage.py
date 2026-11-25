import json

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config

from settings import AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, MEDIA_BUCKET

APP_FOLDER = "wowclip"
LINK_HOURS = 6

aws = boto3.session.Session(
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION,
)
many_connections = Config(max_pool_connections=50)
s3 = aws.client("s3", config=many_connections)
fast_upload = TransferConfig(multipart_threshold=4 * 1024 * 1024, multipart_chunksize=4 * 1024 * 1024, max_concurrency=12)


def clip_key(name):
    return f"{APP_FOLDER}/clips/{name}/video.mp4"


def reel_key(render_id):
    return f"{APP_FOLDER}/reels/{render_id}.mp4"


def history_key(render_id, extension):
    return f"{APP_FOLDER}/history/{render_id}.{extension}"


def project_key(project_id):
    return f"{APP_FOLDER}/projects/{project_id}.json"


def draft_key(clip_name):
    return f"{APP_FOLDER}/drafts/{clip_name}.json"


def my_styles_key():
    return f"{APP_FOLDER}/my-styles.json"


def upload_file(path, key, content_type):
    s3.upload_file(path, MEDIA_BUCKET, key, ExtraArgs={"ContentType": content_type}, Config=fast_upload)


def download_file(key, path):
    s3.download_file(MEDIA_BUCKET, key, path, Config=fast_upload)


def write_json(key, data):
    s3.put_object(Bucket=MEDIA_BUCKET, Key=key, Body=json.dumps(data), ContentType="application/json")


def read_json(key):
    try:
        body = s3.get_object(Bucket=MEDIA_BUCKET, Key=key)["Body"].read()
        return json.loads(body)
    except s3.exceptions.NoSuchKey:
        return None


def list_keys(prefix):
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=MEDIA_BUCKET, Prefix=prefix):
        for item in page.get("Contents", []):
            keys.append(item["Key"])
    return keys


def file_link(key, download_name=None):
    params = {"Bucket": MEDIA_BUCKET, "Key": key}
    if download_name:
        params["ResponseContentDisposition"] = f'attachment; filename="{download_name}"'
    return s3.generate_presigned_url("get_object", Params=params, ExpiresIn=LINK_HOURS * 3600)


def console_link(key):
    return f"https://s3.console.aws.amazon.com/s3/object/{MEDIA_BUCKET}?region={AWS_REGION}&prefix={key}"


def folder_console_link(folder):
    return f"https://s3.console.aws.amazon.com/s3/buckets/{MEDIA_BUCKET}?region={AWS_REGION}&prefix={folder}"
