import os
import re
import threading
import uuid

from flask import Flask, jsonify, request, send_file, send_from_directory

from aws.render_history import list_renders
from clip_finder.find_best_clips import find_clips
from clip_finder.make_clip_thumbnails import make_hd_frames, make_preview_frames
from editor.saved_caption_styles import add_my_style, delete_my_style, list_my_styles, update_my_style
from editor.editor_projects import (check_preparation, find_project, preview_for_browser, project_for_browser,
                             remember_project, source_of, start_preparation, transcript_for_browser)
from optional_extras.demo_mode.replay_saved_demo import has_saved_job, has_saved_preparation, is_demo, replay_job, save_job
from editor.pick_emphasis_words import emphasis_for_request
from optional_extras.ai_edit.run_ai_edit import edit_for_browser, find_edit, set_switches, start_edit
from editor.export_reel import plan_problem, render_for_browser, renders, start_render
from progress_tracker import (add_log, fail_running_steps, finish_step, log_for_browser, new_progress, start_step,
                      steps_for_browser)
from reel.prepare_clip_for_editor import clip_folder, clip_name, find_preparation, local_video, prepare_clip
from settings import LLM_MODELS, OUTPUT_FOLDER, RENDER_PUBLIC_BASE
from youtube_data.prefetch_video_in_background import get_info, get_page_and_captions, start_prefetch

FIND_STEPS = [
    ("transcript", "Read transcript"),
    ("finding", "AI picks the moments"),
    ("frames", "Cut frames"),
]

PROJECT_ID = re.compile(r"^([a-f0-9]{12})-([0-9]{1,3})$")

app = Flask(__name__)
jobs = {}


def words_in_clip(lines, clip):
    words = []
    for line in lines:
        for word in line["words"]:
            if clip["start_seconds"] <= word["start"] < clip["end_seconds"]:
                words.append(word)
    return words


def clip_for_browser(job_id, number, clip, lines):
    thumbnail = ""
    if clip.get("thumbnail_file"):
        file_name = os.path.basename(clip["thumbnail_file"])
        thumbnail = f"/api/thumbnails/{job_id}/{file_name}"

    return {
        "id": str(number),
        "title": clip["title"],
        "start_seconds": clip["start_seconds"],
        "end_seconds": clip["end_seconds"],
        "virality_score": clip["virality_score"],
        "scores": clip["scores"],
        "category": clip["category"],
        "hook_line": clip["hook_line"],
        "summary": clip["summary"],
        "why_viral": clip["why_viral"],
        "strengths": clip["strengths"],
        "watch_out": clip["watch_out"],
        "audience": clip["audience"],
        "thumbnail": thumbnail,
        "frame_quality": clip.get("frame_quality", "none"),
        "words": words_in_clip(lines, clip),
    }


def count_words(lines):
    return sum(len(line["words"]) for line in lines)


def upgrade_frames(job, video_id):
    def log(text):
        add_log(job, text)

    job["hd_frames"] = "working"
    log(f"Fetching 1080p frames for {len(job['found'])} clips in the background (ClipsCutter)")
    make_hd_frames(job["id"], job["found"], video_id, log)
    job["hd_frames"] = "done"
    log("All frames are now 1080p")
    if is_demo(video_id):
        save_job(job)


def run_job(job, video_id, options):
    def log(text):
        add_log(job, text)

    try:
        if has_saved_job(video_id):
            replay_job(job)
            return

        start_step(job, "transcript")
        info = get_info(video_id)
        log(f"YouTube Data API: \"{info['title']}\" by {info['channel']}, {info['duration_seconds'] // 60} min")
        prefetched = get_page_and_captions(video_id)
        if prefetched["was_ready"]:
            log(f"Transcript was already fetched in the background ({prefetched['seconds']}s) while you set options")
        else:
            log(f"yt-dlp read the YouTube page through the proxy in {prefetched['page_seconds']}s")
        captions = prefetched["captions"]
        lines = captions["lines"]
        job["language"] = captions["language"]
        log(f"Got {captions['kind']} captions ({captions['language']}): {len(lines)} lines, "
            f"{count_words(lines)} words with timings")
        finish_step(job, "transcript")

        start_step(job, "finding")
        first = LLM_MODELS[0]
        backups = ", ".join(llm["name"] for llm in LLM_MODELS[1:])
        log(f"Sending the transcript to {first['name']} on {first['providers'][0]} (backups if it is busy: {backups})")
        video_data = {"info": info, "captions": captions, "page": prefetched["page"]}
        found = find_clips(video_data, options, log)
        usage = found["usage"]
        log(f"{usage['model']} on {usage['provider']} answered in {usage['seconds']:.1f}s: "
            f"{usage['input_tokens']} tokens in, {usage['output_tokens']} out, ${usage['cost_usd']:.4f}")
        log(f"Kept {len(found['clips'])} clips after checking timestamps, length and overlap")
        finish_step(job, "finding")

        start_step(job, "frames")
        make_preview_frames(job["id"], found["clips"], prefetched["page"])
        log("Cut a preview frame for every clip from the YouTube storyboard")
        job["found"] = found["clips"]
        job["lines"] = lines
        job["notice"] = found["notice"]
        finish_step(job, "frames")
        job["status"] = "done"

        if found["clips"]:
            threading.Thread(target=upgrade_frames, args=(job, video_id), daemon=True).start()
    except Exception as error:
        fail_running_steps(job)
        log("Failed: " + str(error))
        job["error"] = str(error)
        job["status"] = "failed"


def job_for_browser(job):
    clips = []
    for number, clip in enumerate(job["found"], start=1):
        clips.append(clip_for_browser(job["id"], number, clip, job["lines"]))
    return {
        "id": job["id"],
        "status": job["status"],
        "steps": steps_for_browser(job),
        "log": log_for_browser(list(job["log"]), job["started_at"]),
        "clips": clips,
        "notice": job["notice"],
        "error": job["error"],
        "hd_frames": job["hd_frames"],
    }


def find_clip(job_id, number):
    job = jobs.get(job_id)
    if job is None or not 1 <= number <= len(job["found"]):
        return None, None
    clip = dict(job["found"][number - 1])
    duration = get_info(job["video_id"])["duration_seconds"]
    if duration > 0:
        clip["end_seconds"] = min(clip["end_seconds"], duration)
    return job, clip


@app.get("/video/<video_id>")
def video(video_id):
    try:
        info = get_info(video_id)
    except Exception as error:
        return jsonify({"error": str(error)}), 400
    start_prefetch(video_id)
    return jsonify(info)


@app.post("/jobs")
def start_job():
    body = request.get_json(silent=True) or {}
    video_id = body.get("video_id", "")
    options = body.get("options") or {}
    if video_id == "":
        return jsonify({"error": "video_id is missing"}), 400

    job = new_progress(FIND_STEPS)
    job.update({
        "id": uuid.uuid4().hex[:12],
        "video_id": video_id,
        "status": "working",
        "found": [],
        "lines": [],
        "notice": "",
        "error": "",
        "hd_frames": "waiting",
        "language": None,
    })
    jobs[job["id"]] = job
    threading.Thread(target=run_job, args=(job, video_id, options), daemon=True).start()
    return jsonify({"job_id": job["id"]})


@app.get("/jobs/<job_id>")
def get_job(job_id):
    if job_id not in jobs:
        return jsonify({"error": "Unknown job"}), 404
    return jsonify(job_for_browser(jobs[job_id]))


@app.get("/thumbnails/<job_id>/<file_name>")
def thumbnail(job_id, file_name):
    return send_from_directory(os.path.join(OUTPUT_FOLDER, job_id), file_name)


@app.post("/jobs/<job_id>/clips/<int:number>/prepare")
def prepare(job_id, number):
    job, clip = find_clip(job_id, number)
    if job is None:
        return jsonify({"error": "Unknown clip"}), 404
    folder = clip_folder(clip_name(job["video_id"], clip["start_seconds"], clip["end_seconds"]))
    if has_saved_preparation(job["video_id"], folder):
        return jsonify({"status": "waiting"})
    preparation = prepare_clip(job["video_id"], clip["start_seconds"], clip["end_seconds"])
    return jsonify({"status": preparation["status"]})


def open_project(project_id):
    match = PROJECT_ID.match(project_id)
    if match is None:
        return None
    job, clip = find_clip(match.group(1), int(match.group(2)))
    if job is None:
        return find_project(project_id)
    words = words_in_clip(job["lines"], clip)
    return remember_project(project_id, get_info(job["video_id"]), clip, words, job["language"])


def project_not_found():
    return jsonify({"error": "This clip is not in wowclip any more. Find the clips again and open it from there."}), 404


@app.get("/projects/<project_id>")
def get_project(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    light = request.args.get("light") == "1"
    state = check_preparation(project, start=not light)
    payload = {"project": project_for_browser(project, state)}
    if state["status"] == "ready" and not light:
        payload["transcript"] = transcript_for_browser(project)
    return jsonify(payload)


@app.get("/projects/<project_id>/video")
def project_video(project_id):
    project = open_project(project_id)
    if project is None or not project["video_key"]:
        return jsonify({"error": "The clip is not ready yet"}), 404
    return send_file(local_video(project["clip_name"]), mimetype="video/mp4", conditional=True)


@app.get("/projects/<project_id>/preview")
def project_preview(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    check_preparation(project, start=True)
    return jsonify(preview_for_browser(project))


@app.get("/projects/<project_id>/preparation")
def project_preparation(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    state = check_preparation(project, start=True)
    preparation = find_preparation(project["video_id"], project["start_seconds"], project["end_seconds"])
    if preparation is None:
        return jsonify({"status": state["status"], "steps": [], "log": [], "error": state["error"]})
    return jsonify({
        "status": state["status"],
        "steps": steps_for_browser(preparation),
        "log": log_for_browser(list(preparation["log"]), preparation["started_at"]),
        "error": state["error"],
    })


@app.get("/projects/<project_id>/source")
def project_source(project_id):
    project = open_project(project_id)
    source_path = source_of(project) if project else None
    if not source_path:
        return jsonify({"error": "The clip is not downloaded yet"}), 404
    return send_file(source_path, mimetype="video/mp4", conditional=True)


@app.post("/projects/<project_id>/transcribe")
def transcribe(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    if not project["video_key"]:
        start_preparation(project)
    state = check_preparation(project, start=True)
    return jsonify({"project": project_for_browser(project, state)}), 202


@app.post("/projects/<project_id>/language")
def caption_language(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    body = request.get_json(silent=True) or {}
    if body.get("want") != "original":
        return jsonify({"error": "wowclip shows the captions as YouTube wrote them; other caption languages are not part of wowclip."}), 400
    return jsonify({"cues": project["cues"], "language": project["language"]})


@app.post("/projects/<project_id>/render-job")
def project_render_job(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    if check_preparation(project, start=False)["status"] != "ready":
        return jsonify({"error": "This clip is still being prepared. Try again in a moment."}), 409
    body = request.get_json(silent=True) or {}
    planned = body.get("planned")
    problem = plan_problem(planned)
    if problem:
        return jsonify({"error": problem}), 400
    return jsonify({"render_id": start_render(project, planned)["id"]})


def edit_waiting(project):
    if check_preparation(project, start=True)["status"] != "ready":
        return jsonify({"status": "waiting", "steps": [], "log": [], "error": None, "round": 0})
    return None


@app.get("/projects/<project_id>/ai-edit")
def get_ai_edit(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    return edit_waiting(project) or jsonify(edit_for_browser(start_edit(project)))


@app.post("/projects/<project_id>/ai-edit")
def redo_ai_edit(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    return edit_waiting(project) or jsonify(edit_for_browser(start_edit(project, again=True)))


@app.patch("/projects/<project_id>/ai-edit")
def switch_ai_edit(project_id):
    project = open_project(project_id)
    if project is None:
        return project_not_found()
    edit = find_edit(project["clip_name"])
    if edit is None or edit["status"] != "ready":
        return jsonify({"error": "The AI edit is not ready yet."}), 409
    body = request.get_json(silent=True) or {}
    set_switches(edit, body.get("off"), body.get("trims"))
    return jsonify(edit_for_browser(edit))


@app.get("/renders/<render_id>")
def get_render(render_id):
    if render_id not in renders:
        return jsonify({"error": "Unknown render"}), 404
    return jsonify(render_for_browser(renders[render_id]))


@app.get("/render-site")
def render_site():
    return jsonify({"public_base": RENDER_PUBLIC_BASE})


@app.get("/styles")
def my_styles():
    return jsonify({"styles": list_my_styles()})


@app.post("/styles")
def add_style():
    style = add_my_style(request.get_json(silent=True) or {})
    if style is None:
        return jsonify({"error": "This style isn't valid."}), 400
    return jsonify({"style": style})


@app.patch("/styles/<style_id>")
def change_style(style_id):
    style = update_my_style(style_id, request.get_json(silent=True) or {})
    if style is None:
        return jsonify({"error": "This style doesn't exist."}), 404
    return jsonify({"style": style})


@app.delete("/styles/<style_id>")
def remove_style(style_id):
    delete_my_style(style_id)
    return "", 204


@app.post("/ai/enhance")
def ai_enhance():
    try:
        return jsonify(emphasis_for_request(request.get_json(silent=True) or {}))
    except Exception as error:
        return jsonify({"error": "Could not pick the key words: " + str(error)}), 502


@app.get("/history")
def history():
    try:
        return jsonify(list_renders())
    except Exception as error:
        return jsonify({"error": "Could not read the history from S3: " + str(error)}), 502


if __name__ == "__main__":
    app.run(port=5000, debug=False, threaded=True)
