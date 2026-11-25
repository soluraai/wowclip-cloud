import json
import math
import time

from aws.s3_storage import aws, list_keys, many_connections, read_json, reel_key, write_json
from settings import MEDIA_BUCKET, RENDER_FUNCTION, RENDER_SITE_URL, RENDER_TOOLS_BUCKET

FPS = 30
MAX_LAMBDAS = 100
FRAMES_PER_LAMBDA = 30
CHECK_EVERY_SECONDS = 0.7
WAIT_LIMIT_SECONDS = 600

lambda_client = aws.client("lambda", config=many_connections)


def job_key(run_id, name):
    return f"jobs/{run_id}/{name}"


def split_frames(total_frames):
    lambdas = max(1, min(MAX_LAMBDAS, total_frames // FRAMES_PER_LAMBDA))
    size = math.ceil(total_frames / lambdas)
    ranges = []
    for start in range(0, total_frames, size):
        ranges.append({"start": start, "count": min(size, total_frames - start)})
    return ranges


def write_job(run_id, planned_job, video_url, ranges, filename, serve_url=RENDER_SITE_URL):
    job = dict(planned_job)
    job.update({
        "serveUrl": serve_url,
        "fps": FPS,
        "videoUrl": video_url,
        "ranges": ranges,
        "outKey": reel_key(run_id),
        "filename": filename,
        "progressNotes": True,
    })
    write_json(job_key(run_id, "job.json"), job)
    return job


def start_lambdas(run_id):
    payload = {"mode": "start", "bucket": MEDIA_BUCKET, "toolsBucket": RENDER_TOOLS_BUCKET, "jobId": run_id}
    response = lambda_client.invoke(FunctionName=RENDER_FUNCTION, InvocationType="RequestResponse",
                                    Payload=json.dumps(payload))
    answer = json.loads(response["Payload"].read())
    if "started" not in answer:
        raise Exception("AWS could not start the render: " + str(answer)[:300])
    return answer["started"]


def read_progress(run_id):
    names = [key.split("/", 2)[2] for key in list_keys(job_key(run_id, ""))]
    started = set()
    finished = set()
    for name in names:
        if name.startswith("p/"):
            started.add(int(name[2:].replace(".json", "")))
        if name.startswith("done/"):
            finished.add(int(name[5:]))

    result = None
    if "result.json" in names:
        result = read_json(job_key(run_id, "result.json"))

    return {"started": started, "finished": finished, "joining": "join.lock" in names, "result": result}


def wait_for_render(run_id, on_progress):
    started = time.time()
    while time.time() - started < WAIT_LIMIT_SECONDS:
        time.sleep(CHECK_EVERY_SECONDS)
        progress = read_progress(run_id)
        on_progress(progress)
        result = progress["result"]
        if result is not None:
            if not result.get("ok"):
                raise Exception("The Lambda render failed: " + str(result.get("error")))
            return result
    raise Exception("The Lambda render took too long")
