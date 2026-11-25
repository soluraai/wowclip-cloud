import os
import subprocess
import threading
import time

import modal

from optional_extras.demo_mode.replay_saved_demo import has_saved_preparation, is_demo, replay_preparation, save_preparation
from aws.s3_storage import clip_key, download_file, upload_file
from progress_tracker import add_log, fail_running_steps, finish_step, new_progress, start_step
from reel.cut_clip_from_youtube import cut_youtube_clip
from reel.crop_to_vertical_9x16 import make_vertical_video
from reel.transcribe_clip_speech import transcribe_clip
from settings import AWS_REGION, OUTPUT_FOLDER

MODAL_APP = "wowclip-speaker-crop"
MODAL_WAIT_SECONDS = 90

PREPARE_STEPS = [
    ("download", "Download clip"),
    ("speaker", "Find the speaker (Modal GPU)"),
    ("transcribe", "Word timings"),
    ("upload", "Upload to S3"),
]

preparations = {}
lock = threading.Lock()
download_lock = threading.Lock()


def clip_name(video_id, start, end):
    return f"{video_id}_{int(start * 10)}_{int(end * 10)}"


def clip_folder(name):
    folder = os.path.join(OUTPUT_FOLDER, "reels", name)
    os.makedirs(folder, exist_ok=True)
    return folder


def make_cover(video_path, cover_path):
    command = ["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.5", "-i", video_path, "-frames:v", "1",
               "-vf", "scale=360:-2", "-q:v", "4", cover_path]
    result = subprocess.run(command, capture_output=True)
    return cover_path if result.returncode == 0 and os.path.exists(cover_path) else None


def local_video(name):
    path = os.path.join(clip_folder(name), "vertical.mp4")
    with download_lock:
        if not os.path.exists(path):
            download_file(clip_key(name), path + ".part")
            os.replace(path + ".part", path)
    return path


def local_cover(name):
    path = os.path.join(clip_folder(name), "cover.jpg")
    if os.path.exists(path):
        return path
    return make_cover(local_video(name), path)


def crop_on_modal(source_path, vertical_path, log):
    try:
        crop_clip = modal.Function.from_name(MODAL_APP, "crop_clip")
        started = time.time()
        log("Sending the clip to a Modal L4 GPU for the speaker crop")
        with open(source_path, "rb") as file:
            call = crop_clip.spawn(file.read())
        result = call.get(timeout=MODAL_WAIT_SECONDS)
        with open(vertical_path, "wb") as file:
            file.write(result["video"])
        for line in result["log"]:
            log("Modal: " + line)
        log(f"Modal finished the crop in {time.time() - started:.1f}s")
        return result
    except Exception as error:
        log("Modal did not work, cropping on this computer instead: " + str(error)[:200])
        return make_vertical_video(source_path, vertical_path, log)


def transcribe_in_background(preparation, source_path, log):
    start_step(preparation, "transcribe")
    try:
        started = time.time()
        words, language = transcribe_clip(source_path, log)
        preparation["words"] = words
        preparation["language"] = language
        log(f"Got {len(words)} words with timings in {time.time() - started:.1f}s")
    except Exception as error:
        log("Transcription failed, using YouTube's captions instead: " + str(error))
    finish_step(preparation, "transcribe")


def run_preparation(preparation, video_id, start, end):
    folder = clip_folder(preparation["name"])
    source_path = os.path.join(folder, "source.mp4")
    vertical_path = os.path.join(folder, "vertical.mp4")

    def log(text):
        add_log(preparation, text)

    try:
        start_step(preparation, "download")
        log(f"Asking ClipsCutter to cut {end - start:.0f}s out of the YouTube video")
        cut_youtube_clip(video_id, start, end, source_path, log)
        finish_step(preparation, "download")
        preparation["source_path"] = source_path

        words_thread = threading.Thread(target=transcribe_in_background, args=(preparation, source_path, log))
        words_thread.start()

        start_step(preparation, "speaker")
        plan = crop_on_modal(source_path, vertical_path, log)
        preparation["duration"] = plan["duration"]
        make_cover(vertical_path, os.path.join(folder, "cover.jpg"))
        size = os.path.getsize(vertical_path) / 1e6
        log(f"Cut the 9:16 reel that follows the speaker ({size:.1f} MB)")
        finish_step(preparation, "speaker")

        words_thread.join()

        start_step(preparation, "upload")
        started = time.time()
        preparation["video_key"] = clip_key(preparation["name"])
        upload_file(vertical_path, preparation["video_key"], "video/mp4")
        log(f"Uploaded {size:.1f} MB to S3 in {AWS_REGION} in {time.time() - started:.1f}s")
        finish_step(preparation, "upload")
        preparation["status"] = "ready"
        if is_demo(video_id):
            save_preparation(preparation, folder)
    except Exception as error:
        fail_running_steps(preparation)
        preparation["error"] = str(error)
        preparation["status"] = "failed"
        log("Failed: " + str(error))


def find_preparation(video_id, start, end):
    return preparations.get(clip_name(video_id, start, end))


def prepare_clip(video_id, start, end, requester=None):
    name = clip_name(video_id, start, end)
    replay = has_saved_preparation(video_id, clip_folder(name))
    with lock:
        old = preparations.get(name)
        if old is not None and old["status"] != "failed" and (not replay or old.get("requester") == requester):
            return old
        preparation = new_progress(PREPARE_STEPS)
        preparation.update({"name": name, "status": "working", "duration": None, "video_key": None, "error": None,
                            "words": None, "language": None, "requester": requester})
        preparations[name] = preparation
    if replay:
        threading.Thread(target=replay_preparation, args=(preparation, clip_folder(name)), daemon=True).start()
    else:
        threading.Thread(target=run_preparation, args=(preparation, video_id, start, end), daemon=True).start()
    return preparation
