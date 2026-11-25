import json
import math
import os
import re
import subprocess
import time

import mediapipe as mp
import numpy as np

MODEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "face_landmarker.task")
SAMPLES_PER_SECOND = 4
ANALYSIS_WIDTH = 640
OUTPUT_WIDTH = 1080
OUTPUT_HEIGHT = 1920
OUTPUT_FPS = 30
CUT_SCORE = 0.06
SHORTEST_CAMERA_SHOT = 0.4
CUT_EDGE = 0.05
SAME_FACE_DISTANCE = 0.12
SAME_FACE_IN_TILES = 0.06
TALK_WINDOW_SAMPLES = 4
TALK_FLOOR = 0.02
MIN_SHOT_SECONDS = 1.5
SAME_FRAMING = 0.04


def video_size(path):
    command = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
               "-show_entries", "format=duration", "-of", "json", path]
    data = json.loads(subprocess.run(command, capture_output=True, text=True).stdout)
    stream = data["streams"][0]
    return stream["width"], stream["height"], float(data["format"]["duration"])


def read_small_frames(path, width, height):
    small_height = int(ANALYSIS_WIDTH * height / width / 2) * 2
    graph = (f"[0:v]split[a][b];[a]fps={SAMPLES_PER_SECOND},scale={ANALYSIS_WIDTH}:{small_height}[small];"
             f"[b]scale=192:108,select='gte(scene,{CUT_SCORE})',metadata=print:key=lavfi.scene_score[cuts]")
    command = ["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "info", "-i", path, "-filter_complex", graph,
               "-map", "[small]", "-f", "rawvideo", "-pix_fmt", "rgb24", "-", "-map", "[cuts]", "-f", "null", "-"]
    result = subprocess.run(command, capture_output=True)
    raw = result.stdout
    frame_bytes = ANALYSIS_WIDTH * small_height * 3
    frames = []
    for start in range(0, len(raw) - frame_bytes + 1, frame_bytes):
        frame = np.frombuffer(raw[start:start + frame_bytes], dtype=np.uint8).reshape(small_height, ANALYSIS_WIDTH, 3)
        frames.append(frame)
    cuts = [float(time) for time in re.findall(r"pts_time:([0-9.]+)", result.stderr.decode(errors="ignore"))]
    return frames, cuts


def tile_lefts(width, height):
    side = min(width, height)
    if width <= side:
        return [0], side
    count = math.ceil((width - side) / (side / 2)) + 1
    step = (width - side) / (count - 1)
    return [round(step * number) for number in range(count)], side


def faces_in(landmarker, image, left, side, width):
    result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(image)))
    faces = []
    for number, points in enumerate(result.face_landmarks):
        xs = [(left + point.x * side) / width for point in points]
        mouth = 0
        for shape in result.face_blendshapes[number]:
            if shape.category_name == "jawOpen":
                mouth = shape.score
        middle = sum(xs) / len(xs)
        faces.append({"x": middle, "size": max(xs) - min(xs), "mouth": mouth,
                      "off_center": abs(middle * width - left - side / 2) / side})
    return faces


def one_per_face(found):
    kept = []
    for face in sorted(found, key=lambda face: face["off_center"]):
        if all(abs(face["x"] - other["x"]) > SAME_FACE_IN_TILES for other in kept):
            kept.append(face)
    return kept


def find_faces(frames):
    if not frames:
        return []
    height, width = frames[0].shape[:2]
    lefts, side = tile_lefts(width, height)
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=MODEL_FILE),
        num_faces=4,
        output_face_blendshapes=True,
        min_face_detection_confidence=0.4,
    )
    samples = []
    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
        for frame in frames:
            found = []
            for left in lefts:
                found += faces_in(landmarker, frame[:side, left:left + side], left, side, width)
            if not found:
                found = faces_in(landmarker, frame, 0, width, width)
            samples.append(one_per_face(found))
    return samples


def follow_faces(samples):
    tracks = []
    for index, faces in enumerate(samples):
        for face in faces:
            best = None
            for track in tracks:
                distance = abs(track["last_x"] - face["x"])
                if distance < SAME_FACE_DISTANCE and track["last_seen"] < index and (best is None or distance < best[0]):
                    best = (distance, track)
            if best is None:
                track = {"id": len(tracks), "points": {}, "last_x": face["x"], "last_seen": -1}
                tracks.append(track)
            else:
                track = best[1]
            track["points"][index] = face
            track["last_x"] = face["x"]
            track["last_seen"] = index
    return tracks


def camera_shots(cuts, duration):
    edges = [0.0]
    for cut in sorted(cuts):
        if cut - edges[-1] >= SHORTEST_CAMERA_SHOT and duration - cut >= SHORTEST_CAMERA_SHOT:
            edges.append(cut)
    return list(zip(edges, edges[1:] + [duration]))


def talking_amount(track, index, first, last):
    total = 0
    for step in range(max(first + 1, index - TALK_WINDOW_SAMPLES), min(last, index + TALK_WINDOW_SAMPLES) + 1):
        now = track["points"].get(step)
        before = track["points"].get(step - 1)
        if now and before:
            total = total + abs(now["mouth"] - before["mouth"])
    return total


def choose_speakers(tracks, first, last):
    speakers = []
    current = None
    for index in range(first, last + 1):
        visible = [track for track in tracks if index in track["points"]]
        best_track = None
        best_amount = TALK_FLOOR
        for track in visible:
            amount = talking_amount(track, index, first, last)
            if amount > best_amount:
                best_track = track
                best_amount = amount
        if best_track is None and visible:
            if current is not None and index in current["points"]:
                best_track = current
            else:
                best_track = max(visible, key=lambda track: track["points"][index]["size"])
        if best_track is not None:
            current = best_track
        speakers.append(current)
    first_seen = next((speaker for speaker in speakers if speaker is not None), None)
    return [first_seen if speaker is None else speaker for speaker in speakers]


def speaker_runs(speakers, first):
    runs = []
    for offset, speaker in enumerate(speakers):
        if runs and runs[-1]["speaker"] is speaker:
            runs[-1]["end"] = first + offset + 1
        else:
            runs.append({"speaker": speaker, "start": first + offset, "end": first + offset + 1})
    shortest = MIN_SHOT_SECONDS * SAMPLES_PER_SECOND
    merged = []
    for run in runs:
        if merged and (run["end"] - run["start"] < shortest or merged[-1]["speaker"] is run["speaker"]):
            merged[-1]["end"] = run["end"]
        else:
            merged.append(run)
    if len(merged) > 1 and merged[0]["end"] - merged[0]["start"] < shortest:
        merged[1]["start"] = merged[0]["start"]
        merged.pop(0)
    return merged


def framing_of(run):
    speaker = run["speaker"]
    if speaker is None:
        return 0.5
    xs = [speaker["points"][index]["x"] for index in range(run["start"], run["end"]) if index in speaker["points"]]
    if not xs:
        nearest = min(speaker["points"], key=lambda index: abs(index - run["start"]))
        xs = [speaker["points"][nearest]["x"]]
    return float(np.median(xs))


def plan_shots(samples, tracks, cameras):
    shots = []
    for start, end in cameras:
        first = math.ceil((start + CUT_EDGE) * SAMPLES_PER_SECOND)
        last = min(len(samples) - 1, math.floor((end - CUT_EDGE) * SAMPLES_PER_SECOND))
        runs = speaker_runs(choose_speakers(tracks, first, last), first) if first <= last else []
        if not runs:
            shots.append({"start": start, "end": end, "x": 0.5, "speaker": None})
            continue
        for number, run in enumerate(runs):
            shots.append({
                "start": start if number == 0 else (run["start"] - 0.5) / SAMPLES_PER_SECOND,
                "end": end if number == len(runs) - 1 else (run["end"] - 0.5) / SAMPLES_PER_SECOND,
                "x": framing_of(run),
                "speaker": None if run["speaker"] is None else run["speaker"]["id"],
            })
    joined = []
    for shot in shots:
        if joined and joined[-1]["speaker"] == shot["speaker"] and abs(joined[-1]["x"] - shot["x"]) < SAME_FRAMING:
            joined[-1]["end"] = shot["end"]
        else:
            joined.append(shot)
    return joined


def crop_expression(shots, width, crop_width):
    def left_edge(x):
        return int(max(0, min(width - crop_width, x * width - crop_width / 2)))

    expression = str(left_edge(shots[-1]["x"]))
    for shot in reversed(shots[:-1]):
        expression = f"if(lt(t,{shot['end'] - 0.002:.3f}),{left_edge(shot['x'])},{expression})"
    return expression


def encode(source_path, output_path, video_filter, gpu):
    cpu_video = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26"]
    gpu_video = ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "26"]
    tries = [gpu_video, cpu_video] if gpu else [cpu_video]
    error = ""
    for video_codec in tries:
        command = ["ffmpeg", "-y", "-loglevel", "error", "-i", source_path, "-vf", video_filter] + video_codec + \
                  ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", output_path]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0:
            return video_codec[1]
        error = result.stderr[-300:]
    raise Exception("ffmpeg could not make the vertical video: " + error)


def make_vertical_video(source_path, output_path, log=print, gpu=False):
    width, height, duration = video_size(source_path)
    shots = [{"start": 0, "end": duration, "x": 0.5, "speaker": None}]
    is_landscape = width / height > OUTPUT_WIDTH / OUTPUT_HEIGHT + 0.01

    if is_landscape:
        started = time.time()
        frames, cuts = read_small_frames(source_path, width, height)
        read_seconds = time.time() - started
        cameras = camera_shots(cuts, duration)
        log(f"Found {len(cameras) - 1} camera cuts; MediaPipe is checking {len(frames)} frames ({SAMPLES_PER_SECOND} per second, "
            f"in overlapping tiles so small and side-on faces count) for faces and moving mouths")
        started = time.time()
        samples = find_faces(frames)
        tracks = follow_faces(samples)
        log(f"Read the frames in {read_seconds:.1f}s and found the faces in {time.time() - started:.1f}s")
        with_face = sum(1 for faces in samples if faces)
        log(f"Found {len(tracks)} face tracks, a face in {with_face} of {len(samples)} frames")
        if tracks:
            shots = plan_shots(samples, tracks, cameras)
        log(f"Active speaker plan: {len(shots)} framings over {len(cameras)} camera shots, each camera shot framed on its own")

        crop_width = int(height * OUTPUT_WIDTH / OUTPUT_HEIGHT / 2) * 2
        crop = f"crop={crop_width}:{height}:x='{crop_expression(shots, width, crop_width)}':y=0"
    else:
        crop_width = int(width / 2) * 2
        crop_height = min(height, int(width * OUTPUT_HEIGHT / OUTPUT_WIDTH / 2) * 2)
        crop = f"crop={crop_width}:{crop_height}"
        log("The video is already vertical, so it is only trimmed to 9:16")

    video_filter = f"{crop},fps={OUTPUT_FPS},setsar=1"
    started = time.time()
    codec = encode(source_path, output_path, video_filter, gpu)
    log(f"Encoded the vertical video with {codec} in {time.time() - started:.1f}s")
    return {"shots": shots, "duration": duration, "speakers": len({shot["speaker"] for shot in shots})}
