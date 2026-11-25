import mimetypes
import os
import time
from concurrent.futures import ThreadPoolExecutor

from aws.s3_storage import aws, many_connections
from settings import EDIT_SITE_URL, RENDER_SITE_URL

PROJECT_FOLDER = os.path.abspath(__file__)
for _ in range(4):  # ai_edit -> optional_extras -> backend -> WowClip-Cloud
    PROJECT_FOLDER = os.path.dirname(PROJECT_FOLDER)
BUILD_FOLDER = os.path.join(PROJECT_FOLDER, "frontend", "edit", "build")


def site_place(site_url):
    host, path = site_url.split("://", 1)[1].split("/", 1)
    bucket = host.split(".", 1)[0]
    region = host.split(".s3.", 1)[1].split(".amazonaws.com", 1)[0]
    return bucket, region, path.rsplit("/", 1)[0] + "/"


def deploy():
    bucket, region, prefix = site_place(EDIT_SITE_URL)
    _, _, caption_prefix = site_place(RENDER_SITE_URL)
    s3 = aws.client("s3", region_name=region, config=many_connections)
    started = time.time()

    paths = [os.path.join(root, name) for root, _, names in os.walk(BUILD_FOLDER) for name in names]
    if not paths:
        raise Exception("Build the site first: cd frontend && node edit/build-site.mjs")

    def upload(path):
        key = prefix + os.path.relpath(path, BUILD_FOLDER).replace(os.sep, "/")
        kind = mimetypes.guess_type(path)[0] or "application/octet-stream"
        s3.upload_file(path, bucket, key, ExtraArgs={"ContentType": kind, "CacheControl": "no-cache"})

    with ThreadPoolExecutor(16) as pool:
        list(pool.map(upload, paths))
    print(f"Uploaded {len(paths)} files of the edit site to s3://{bucket}/{prefix} in {time.time() - started:.1f}s")

    public = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=caption_prefix + "public/"):
        public += [item["Key"] for item in page.get("Contents", [])]

    def copy(key):
        target = prefix + key[len(caption_prefix):]
        s3.copy_object(Bucket=bucket, Key=target, CopySource={"Bucket": bucket, "Key": key}, MetadataDirective="COPY")

    started = time.time()
    with ThreadPoolExecutor(16) as pool:
        list(pool.map(copy, public))
    print(f"Copied {len(public)} caption files (fonts, emoji, images) from the caption site in {time.time() - started:.1f}s")
    print("Edit site:", EDIT_SITE_URL)


if __name__ == "__main__":
    deploy()
