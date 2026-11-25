import re
import threading
import time

from aws.s3_storage import project_key, read_json, write_json
from optional_extras.demo_mode.replay_saved_demo import has_saved_preparation
from reel.prepare_clip_for_editor import clip_folder, clip_name, find_preparation, prepare_clip

REEL_WIDTH = 1080
REEL_HEIGHT = 1920
LONGEST_WORD_SECONDS = 1.2
SOUND_TAG = re.compile(r"^\[.*\]$")

projects = {}
lock = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def make_cues(words, clip_start, clip_end):
    cues = []
    for word in words:
        text = word["text"].strip()
        if text == "" or SOUND_TAG.match(text):
            continue
        start = max(0.0, word["start"] - clip_start)
        end = min(word["end"], word["start"] + LONGEST_WORD_SECONDS, clip_end) - clip_start
        cues.append({
            "id": f"w{len(cues)}",
            "start": round(start, 3),
            "end": round(max(start + 0.05, end), 3),
            "hero": text,
        })
    return cues


def transcript_cues(words, duration):
    cues = []
    for word in words:
        start = max(0.0, word["start"])
        if start >= duration:
            continue
        end = min(word["end"], duration)
        cues.append({"id": f"w{len(cues)}", "start": round(start, 3), "end": round(max(start + 0.05, end), 3),
                     "hero": word["text"]})
    return cues


def new_project(project_id, video, clip, words, language):
    return {
        "id": project_id,
        "video_id": video["video_id"],
        "video_title": video["title"],
        "channel": video["channel"],
        "title": clip["title"],
        "category": clip.get("category", ""),
        "hook_line": clip.get("hook_line", ""),
        "summary": clip.get("summary", ""),
        "start_seconds": clip["start_seconds"],
        "end_seconds": clip["end_seconds"],
        "clip_name": clip_name(video["video_id"], clip["start_seconds"], clip["end_seconds"]),
        "language": language,
        "cues": make_cues(words, clip["start_seconds"], clip["end_seconds"]),
        "duration": None,
        "video_key": None,
        "created_at": now_ms(),
    }


def remember_project(project_id, video, clip, words, language):
    if project_id in projects:
        return projects[project_id]
    project = read_json(project_key(project_id))
    if project is None:
        project = new_project(project_id, video, clip, words, language)
        write_json(project_key(project_id), project)
    elif "category" not in project:
        project.update({key: clip.get(key, "") for key in ("category", "hook_line", "summary")})
        write_json(project_key(project_id), project)
    with lock:
        return projects.setdefault(project_id, project)


def find_project(project_id):
    if project_id in projects:
        return projects[project_id]
    project = read_json(project_key(project_id))
    if project is None:
        return None
    with lock:
        return projects.setdefault(project_id, project)


def start_preparation(project):
    return prepare_clip(project["video_id"], project["start_seconds"], project["end_seconds"], project["id"])


def check_preparation(project, start):
    if project["video_key"]:
        return {"status": "ready", "error": None, "since": project["created_at"]}
    preparation = find_preparation(project["video_id"], project["start_seconds"], project["end_seconds"])
    replay = has_saved_preparation(project["video_id"], clip_folder(project["clip_name"]))
    if preparation is not None and replay and preparation.get("requester") != project["id"]:
        preparation = None
    if preparation is None and start:
        preparation = start_preparation(project)
    if preparation is None:
        return {"status": "transcribing", "error": None, "since": now_ms()}
    since = int(preparation["started_at"] * 1000)
    if preparation["status"] == "failed":
        return {"status": "failed", "error": preparation["error"], "since": since}
    if preparation["status"] != "ready":
        return {"status": "transcribing", "error": None, "since": since}
    project["duration"] = preparation["duration"]
    project["video_key"] = preparation["video_key"]
    if preparation.get("words"):
        project["cues"] = transcript_cues(preparation["words"], preparation["duration"])
        project["language"] = preparation.get("language") or project["language"]
    write_json(project_key(project["id"]), project)
    return {"status": "ready", "error": None, "since": since}


def project_for_browser(project, state):
    duration = project["duration"] or project["end_seconds"] - project["start_seconds"]
    item = {
        "id": project["id"],
        "title": project["title"],
        "status": state["status"],
        "duration": duration,
        "width": REEL_WIDTH,
        "height": REEL_HEIGHT,
        "createdAt": project["created_at"],
        "updatedAt": state["since"],
    }
    if state["error"]:
        item["error"] = state["error"]
    if state["status"] == "ready":
        item["videoUrl"] = f"/api/projects/{project['id']}/video"
    return item


def source_of(project):
    preparation = find_preparation(project["video_id"], project["start_seconds"], project["end_seconds"])
    if preparation is None:
        return None
    return preparation.get("source_path")


def preview_for_browser(project):
    item = {
        "title": project["title"],
        "duration": project["end_seconds"] - project["start_seconds"],
        "cues": project["cues"],
        "ready": bool(project["video_key"]),
    }
    if source_of(project):
        item["previewUrl"] = f"/api/projects/{project['id']}/source"
    return item


def transcript_for_browser(project):
    return {
        "cues": project["cues"],
        "duration": project["duration"],
        "aspectRatio": "9:16",
        "language": project["language"],
    }
