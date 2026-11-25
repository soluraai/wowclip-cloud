import json
import os
import shutil
import threading
import time

from progress_tracker import add_log, finish_step, start_step
from settings import OUTPUT_FOLDER

DEMO_VIDEOS = {"TjPPIf-M6KE"}
DEMO_FOLDER = os.path.join(OUTPUT_FOLDER, "demo")

FIND_SECONDS = {"transcript": 5, "finding": 8, "frames": 2}
HD_SECONDS = 3
PREPARE_SECONDS = {"download": 3, "transcribe": 4, "speaker": 7, "upload": 2}


def is_demo(video_id):
    return video_id in DEMO_VIDEOS


def job_file(video_id):
    return os.path.join(DEMO_FOLDER, video_id, "job.json")


def frames_folder(video_id):
    return os.path.join(DEMO_FOLDER, video_id, "frames")


def preparation_file(clip_folder):
    return os.path.join(clip_folder, "prepared.json")


def has_saved_job(video_id):
    return is_demo(video_id) and os.path.exists(job_file(video_id))


def has_saved_preparation(video_id, clip_folder):
    return is_demo(video_id) and os.path.exists(preparation_file(clip_folder))


def step_of(progress, when):
    best = "after"
    best_began = 0
    for step in progress["steps"]:
        began = step.get("began")
        if began is None or began > when + 0.01:
            continue
        ended = began + step["seconds"] if step["seconds"] is not None else None
        if ended is not None and when > ended + 0.5:
            continue
        if began >= best_began:
            best = step["key"]
            best_began = began
    return best


def saved_log(progress):
    return [{"step": step_of(progress, line["when"]), "text": line["text"]} for line in progress["log"]]


def save_job(job):
    folder = frames_folder(job["video_id"])
    os.makedirs(folder, exist_ok=True)
    found = []
    for clip in job["found"]:
        clip = dict(clip)
        if clip.get("thumbnail_file") and os.path.exists(clip["thumbnail_file"]):
            shutil.copy(clip["thumbnail_file"], folder)
            clip["thumbnail_file"] = os.path.basename(clip["thumbnail_file"])
        found.append(clip)
    data = {"found": found, "lines": job["lines"], "notice": job["notice"], "language": job["language"],
            "log": saved_log(job)}
    with open(job_file(job["video_id"]), "w", encoding="utf-8") as file:
        json.dump(data, file)


def replay_lines(progress, lines, seconds):
    pause = seconds / (len(lines) + 1)
    for line in lines:
        time.sleep(pause)
        add_log(progress, line["text"])
    time.sleep(pause)


def replay_job(job):
    with open(job_file(job["video_id"]), encoding="utf-8") as file:
        saved = json.load(file)
    job_folder = os.path.join(OUTPUT_FOLDER, job["id"])
    os.makedirs(job_folder, exist_ok=True)

    for key in ["transcript", "finding", "frames"]:
        start_step(job, key)
        replay_lines(job, [line for line in saved["log"] if line["step"] == key], FIND_SECONDS[key])
        finish_step(job, key)

    found = []
    for clip in saved["found"]:
        clip = dict(clip)
        if clip.get("thumbnail_file"):
            source = os.path.join(frames_folder(job["video_id"]), clip["thumbnail_file"])
            clip["thumbnail_file"] = shutil.copy(source, job_folder)
        found.append(clip)
    job["found"] = found
    job["lines"] = saved["lines"]
    job["notice"] = saved["notice"]
    job["language"] = saved["language"]
    job["hd_frames"] = "working"
    job["status"] = "done"
    replay_lines(job, [line for line in saved["log"] if line["step"] == "after"], HD_SECONDS)
    job["hd_frames"] = "done"


def save_preparation(preparation, clip_folder):
    data = {"duration": preparation["duration"], "video_key": preparation["video_key"],
            "words": preparation["words"], "language": preparation["language"], "log": saved_log(preparation)}
    with open(preparation_file(clip_folder), "w", encoding="utf-8") as file:
        json.dump(data, file)


def replay_step(preparation, saved, key):
    start_step(preparation, key)
    replay_lines(preparation, [line for line in saved["log"] if line["step"] == key], PREPARE_SECONDS[key])
    finish_step(preparation, key)


def replay_preparation(preparation, clip_folder):
    with open(preparation_file(clip_folder), encoding="utf-8") as file:
        saved = json.load(file)

    replay_step(preparation, saved, "download")
    preparation["source_path"] = os.path.join(clip_folder, "source.mp4")

    words_thread = threading.Thread(target=replay_step, args=(preparation, saved, "transcribe"))
    words_thread.start()
    replay_step(preparation, saved, "speaker")
    words_thread.join()

    replay_step(preparation, saved, "upload")
    preparation["duration"] = saved["duration"]
    preparation["video_key"] = saved["video_key"]
    preparation["words"] = saved["words"]
    preparation["language"] = saved["language"]
    preparation["status"] = "ready"
