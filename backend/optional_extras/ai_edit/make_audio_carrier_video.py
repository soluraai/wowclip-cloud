import hashlib
import json
import os
import subprocess
import threading

from aws.s3_storage import s3, upload_file
from optional_extras.ai_edit.validate_edit_plan import FPS, kept_pieces
from reel.prepare_clip_for_editor import clip_folder, local_video
from settings import MEDIA_BUCKET

FADE_SECONDS = 0.012
FFMPEG_SECONDS = 240

locks = {}
locks_lock = threading.Lock()


def carrier_key(clip_name, pieces):
    digest = hashlib.sha1(json.dumps(pieces).encode()).hexdigest()[:16]
    return f"wowclip/edits/{clip_name}/carrier-{digest}.mp4"


def stored(key):
    try:
        s3.head_object(Bucket=MEDIA_BUCKET, Key=key)
        return True
    except Exception:
        return False


def audio_graph(pieces):
    parts = []
    labels = ""
    for number, (source_from, frames) in enumerate(pieces):
        start = source_from / FPS
        length = frames / FPS
        fade_out = max(0.0, length - FADE_SECONDS)
        parts.append(f"[1:a]atrim=start={start:.6f}:duration={length:.6f},asetpts=PTS-STARTPTS,"
                     f"afade=t=in:st=0:d={FADE_SECONDS},afade=t=out:st={fade_out:.6f}:d={FADE_SECONDS}[a{number}]")
        labels += f"[a{number}]"
    parts.append(f"{labels}concat=n={len(pieces)}:v=0:a=1[sound]")
    return ";".join(parts)


def make_carrier(clip_name, plan):
    pieces = kept_pieces(plan)
    key = carrier_key(clip_name, pieces)
    with locks_lock:
        lock = locks.setdefault(key, threading.Lock())
    with lock:
        if stored(key):
            return key
        frames = sum(count for _, count in pieces)
        seconds = f"{frames / FPS:.6f}"
        path = os.path.join(clip_folder(clip_name), os.path.basename(key))
        command = ["ffmpeg", "-y", "-loglevel", "error",
                   "-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r={FPS}:d={seconds}",
                   "-i", local_video(clip_name),
                   "-filter_complex", audio_graph(pieces), "-map", "0:v", "-map", "[sound]",
                   "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage", "-crf", "45", "-g", "600",
                   "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", seconds,
                   "-movflags", "+faststart", path]
        result = subprocess.run(command, capture_output=True, text=True, timeout=FFMPEG_SECONDS)
        if result.returncode != 0:
            raise Exception("Could not cut the audio for the AI edit: " + result.stderr[-300:])
        upload_file(path, key, "video/mp4")
        return key
