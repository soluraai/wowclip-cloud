import re
import threading
import time
import uuid
from datetime import datetime, timezone

from aws.parallel_render_on_lambda import FPS, split_frames, start_lambdas, wait_for_render, write_job
from aws.render_history import save_render
from aws.s3_storage import file_link, reel_key
from progress_tracker import add_log, fail_running_steps, finish_step, log_for_browser, new_progress, start_step, steps_for_browser
from reel.prepare_clip_for_editor import local_cover
from optional_extras.ai_edit.run_ai_edit import edit_render_job
from settings import MEDIA_BUCKET, RENDER_FUNCTION, RENDER_SITE_URL

RENDER_STEPS = [
    ("invoke", "Invoke Lambdas"),
    ("frames", "Render frames"),
    ("join", "Join + audio"),
]

renders = {}


def safe_file_name(title):
    words = re.findall(r"[A-Za-z0-9]+", title)
    name = "-".join(words)[:60].strip("-").lower()
    return (name or "wowclip-reel") + ".mp4"


def plan_problem(planned):
    if not isinstance(planned, dict) or not isinstance(planned.get("job"), dict):
        return "This render request isn't valid."
    if not isinstance(planned.get("styleId"), str) or not isinstance(planned.get("frames"), int) or planned["frames"] < 1:
        return "This render request isn't valid."
    return None


def update_lambdas(render, progress):
    lambdas = render["lambdas"]
    seen = render["seen"]
    pieces = lambdas["pieces"]
    for index, piece in enumerate(pieces):
        if index in progress["finished"]:
            piece["state"] = "done"
            piece["frames"] = piece["count"]
        elif index in progress["started"]:
            piece["state"] = "rendering"
    lambdas["frames_done"] = sum(piece["frames"] for piece in pieces)
    percent = int(lambdas["frames_done"] * 100 / lambdas["frames_total"])

    if progress["started"] and "first" not in seen:
        seen.add("first")
        add_log(render, "First Lambda is up: headless Chrome is drawing caption frames")
    for mark in [25, 50, 75]:
        if percent >= mark and mark not in seen:
            seen.add(mark)
            add_log(render, f"{lambdas['frames_done']} of {lambdas['frames_total']} frames rendered ({mark}%)")
    if progress["joining"] and "join" not in seen:
        seen.add("join")
        finish_step(render, "frames")
        start_step(render, "join")
        add_log(render, f"The last Lambda is joining {len(pieces)} pieces and adding the audio")


def save_to_history(render, project, render_seconds, duration):
    record = {
        "id": render["id"],
        "project_id": project["id"],
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "video_id": project["video_id"],
        "video_title": project["video_title"],
        "channel": project["channel"],
        "clip_title": project["title"],
        "start_seconds": project["start_seconds"],
        "end_seconds": project["start_seconds"] + project["duration"],
        "ai_edit": render["ai_edit"],
        "style_id": render["style_id"],
        "style_name": render["style_name"],
        "duration": duration,
        "size_mb": render["result"]["size_mb"],
        "file_name": render["result"]["file_name"],
        "bucket": MEDIA_BUCKET,
        "reel_key": reel_key(render["id"]),
        "lambdas": render["lambdas"]["count"],
        "frames": render["lambdas"]["frames_total"],
        "render_seconds": round(render_seconds, 1),
        "total_seconds": round(time.time() - render["started_at"], 1),
    }
    save_render(record, local_cover(project["clip_name"]))


def run_render(render, project, planned):
    def on_progress(progress):
        update_lambdas(render, progress)

    try:
        start_step(render, "invoke")
        job, frames, video_url, serve_url = planned["job"], planned["frames"], file_link(project["video_key"]), RENDER_SITE_URL
        if render["ai_edit"]:
            started = time.time()
            made = edit_render_job(project, planned)
            job, frames, video_url, serve_url = made["job"], made["frames"], made["video_url"], made["serve_url"]
            add_log(render, f"AI edit: {len(job['inputProps']['edit']['inserts'])} visuals, cut audio ready in "
                            f"{time.time() - started:.1f}s, full-frame 1080x1920 render ({frames / FPS:.1f}s)")
        ranges = split_frames(frames)
        render["lambdas"] = {
            "count": len(ranges),
            "frames_total": frames,
            "frames_done": 0,
            "pieces": [{"start": part["start"], "count": part["count"], "frames": 0, "state": "queued"} for part in ranges],
        }
        duration = frames / FPS
        file_name = safe_file_name(project["title"])
        write_job(render["id"], job, video_url, ranges, file_name, serve_url)
        add_log(render, f"Wrote job.json: {frames} frames split into {len(ranges)} pieces "
                        f"of {ranges[0]['count']} frames, {render['style_name']} style")
        started = time.time()
        count = start_lambdas(render["id"])
        add_log(render, f"{RENDER_FUNCTION} invoked {count} Lambdas in {time.time() - started:.1f}s")
        finish_step(render, "invoke")

        start_step(render, "frames")
        result = wait_for_render(render["id"], on_progress)
        finish_step(render, "frames")
        finish_step(render, "join")

        key = reel_key(render["id"])
        render["result"] = {
            "watch_url": file_link(key),
            "download_url": file_link(key, file_name),
            "size_mb": result.get("mb"),
            "duration": duration,
            "file_name": file_name,
        }
        add_log(render, f"Reel ready: 1080×1920, {duration:.0f}s, {result.get('mb')} MB")
        try:
            save_to_history(render, project, time.time() - started, duration)
            add_log(render, f"Saved to the render history in S3 ({MEDIA_BUCKET}/wowclip/history)")
        except Exception as error:
            add_log(render, "Could not save the render history: " + str(error))
        render["status"] = "done"
    except Exception as error:
        fail_running_steps(render)
        render["error"] = str(error)
        render["status"] = "failed"
        add_log(render, "Failed: " + str(error))
    render["finished_at"] = time.time()


def start_render(project, planned):
    render = new_progress(RENDER_STEPS)
    render.update({
        "id": "wc-" + uuid.uuid4().hex[:10],
        "status": "rendering",
        "style_id": planned["styleId"],
        "style_name": str(planned.get("styleName") or planned["styleId"]),
        "ai_edit": planned.get("edit") is True,
        "lambdas": None,
        "result": None,
        "error": None,
        "finished_at": None,
        "seen": set(),
    })
    renders[render["id"]] = render
    add_log(render, f"Render started for \"{project['title']}\" in the {render['style_name']} style"
                    + (" with the AI edit" if render["ai_edit"] else ""))
    threading.Thread(target=run_render, args=(render, project, planned), daemon=True).start()
    return render


def render_for_browser(render):
    end_time = render["finished_at"] or time.time()
    return {
        "id": render["id"],
        "status": render["status"],
        "style_id": render["style_id"],
        "ai_edit": render["ai_edit"],
        "steps": steps_for_browser(render),
        "log": log_for_browser(list(render["log"]), render["started_at"]),
        "lambdas": render["lambdas"],
        "result": render["result"],
        "error": render["error"],
        "seconds": round(end_time - render["started_at"], 1),
    }
