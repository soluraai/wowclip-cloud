import json
import os
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError

from aws.s3_storage import file_link
from optional_extras.demo_mode.replay_saved_demo import DEMO_FOLDER, is_demo
from optional_extras.ai_edit.download_edit_media import save_media
from optional_extras.ai_edit.make_audio_carrier_video import make_carrier
from optional_extras.ai_edit.ask_ai_director import ask_director, family_of
from optional_extras.ai_edit.validate_edit_plan import edit_frames, fallback_raw, normalize
from optional_extras.ai_edit.search_web_media import find_candidates
from optional_extras.ai_edit.rank_media_with_vision_ai import heuristic_order, rank_candidates
from progress_tracker import (add_log, fail_running_steps, find_step, finish_step, log_for_browser, new_progress, start_step,
                      steps_for_browser)
from reel.prepare_clip_for_editor import clip_folder, local_video
from settings import EDIT_SITE_URL

EDIT_STEPS = [
    ("read", "Read the words and pauses"),
    ("direct", "AI director plans the edit"),
    ("search", "Search photos and videos"),
    ("pick", "AI vision picks the shots"),
    ("build", "Build the edit"),
]
MOST_TRIES = 4
MEDIA_SECONDS = 40
LINK_SECONDS = 5 * 3600
DEMO_DIRECT_SECONDS = 9
USE_NAMES = {"broll": "B-roll", "split": "Split screen", "card": "Photo card", "image": "Graphic picture",
             "portrait": "Portrait", "gallery": "Picture set", "template": "Template"}
TYPE_NAMES = {"broll": "B-roll", "split": "split screen", "card": "photo card", "graphic": "motion graphic", "template": "template"}

edits = {}
edits_lock = threading.Lock()
media_pool = ThreadPoolExecutor(max_workers=12)
links = {}
links_lock = threading.Lock()


def edit_file(clip_name):
    return os.path.join(clip_folder(clip_name), "edit.json")


def director_file(project):
    if not is_demo(project["video_id"]):
        return None
    return os.path.join(DEMO_FOLDER, project["video_id"], f"director-{project['clip_name']}.json")


def new_edit(clip_name, round_number):
    edit = new_progress(EDIT_STEPS)
    edit.update({"clip": clip_name, "status": "working", "plan": None, "info": None, "error": None, "round": round_number})
    return edit


def save_edit(edit):
    data = {"plan": edit["plan"], "info": edit["info"], "round": edit["round"],
            "steps": [{key: step.get(key) for key in ("key", "label", "state", "seconds")} for step in edit["steps"]],
            "log": log_for_browser(list(edit["log"]), edit["started_at"])}
    path = edit_file(edit["clip"])
    with open(path + ".part", "w", encoding="utf-8") as file:
        json.dump(data, file)
    os.replace(path + ".part", path)


def load_saved(clip_name):
    path = edit_file(clip_name)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    edit = new_edit(clip_name, data.get("round", 1))
    edit.update({"status": "ready", "plan": data["plan"], "info": data["info"]})
    edit["steps"] = [dict(step, state="done") for step in data["steps"]]
    edit["log"] = [{"when": edit["started_at"] + line["at"], "text": line["text"]} for line in data["log"]]
    return edit


def find_edit(clip_name):
    with edits_lock:
        edit = edits.get(clip_name)
        if edit is None:
            edit = load_saved(clip_name)
            if edit is not None:
                edits[clip_name] = edit
        return edit


def start_edit(project, again=False):
    name = project["clip_name"]
    edit = find_edit(name)
    with edits_lock:
        edit = edits.get(name)
        if edit is not None and (not again or edit["status"] == "working"):
            return edit
        edit = new_edit(name, (edit["round"] + 1) if edit else 1)
        edits[name] = edit
    threading.Thread(target=run_edit, args=(edit, project), daemon=True).start()
    return edit


def video_seconds(clip_name):
    command = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", local_video(clip_name)]
    try:
        return float(subprocess.run(command, capture_output=True, text=True, timeout=30).stdout.strip())
    except Exception:
        return None


def clip_for_director(project):
    return {
        "title": project.get("title", ""),
        "category": project.get("category") or "Insight",
        "hook_line": project.get("hook_line", ""),
        "summary": project.get("summary", ""),
        "video_title": project.get("video_title", ""),
        "channel": project.get("channel", ""),
    }


def replay_director(path, log):
    with open(path, encoding="utf-8") as file:
        saved = json.load(file)
    info = saved["info"]
    log(f"Editing style for a \"{info.get('category', 'Insight')}\" clip: {info['family']}")
    log(f"{info['model']} is planning the edit ({info['provider']}, thinking high)")
    time.sleep(DEMO_DIRECT_SECONDS)
    log(f"{info['model']} planned {len(saved['plan'].get('visuals', []))} visuals in {info['seconds']}s "
        f"({info['thinking']} thinking tokens)")
    return saved["plan"], info


def direct(project, words, duration, log):
    clip = clip_for_director(project)
    saved = director_file(project)
    if saved and os.path.exists(saved):
        return replay_director(saved, log)
    try:
        result = ask_director(clip, words, duration, log)
        info = {"model": result["model"], "provider": result["provider"], "seconds": result["seconds"],
                "family": result["family"], "thinking": result["reasoning_tokens"], "cost": result["cost_usd"],
                "category": clip["category"]}
        if saved:
            os.makedirs(os.path.dirname(saved), exist_ok=True)
            with open(saved, "w", encoding="utf-8") as file:
                json.dump({"plan": result["plan"], "info": info}, file)
        return result["plan"], info
    except Exception as error:
        log("No AI director answered (" + str(error)[:180] + "). Using the built-in edit: cuts, pauses and zooms.")
        return fallback_raw(words), {"model": "Built-in editor", "provider": "wowclip", "seconds": 0,
                                     "family": family_of(clip["category"]), "thinking": 0, "cost": 0,
                                     "category": clip["category"], "fallback": True}


def media_jobs(inserts):
    jobs = []
    for insert in inserts:
        if insert.get("request"):
            jobs.append({"insert": insert["id"], "where": ("media",), "request": insert["request"], "use": insert["type"]})
        for position, element in enumerate((insert.get("scene") or {}).get("elements", [])):
            if element["type"] in ("image", "portrait"):
                jobs.append({"insert": insert["id"], "where": ("element", position), "request": element["media"],
                             "use": element["type"]})
            if element["type"] == "gallery":
                for slot, request in enumerate(element["media"]):
                    jobs.append({"insert": insert["id"], "where": ("gallery", position, slot), "request": request,
                                 "use": "gallery"})
    return jobs


class MediaRun:
    def __init__(self, edit, total, log):
        self.edit = edit
        self.total = total
        self.log = log
        self.searched = 0
        self.picked = 0
        self.used = set()
        self.lock = threading.Lock()

    def search_done(self):
        with self.lock:
            self.searched += 1
            if self.searched == self.total:
                finish_step(self.edit, "search")

    def pick_done(self):
        with self.lock:
            self.picked += 1
            if self.picked == self.total:
                finish_step(self.edit, "pick")

    def claim(self, url):
        with self.lock:
            if url in self.used:
                return False
            self.used.add(url)
            return True

    def release(self, url):
        with self.lock:
            self.used.discard(url)


def try_candidates(candidates, order, focus, run, use):
    problems = []
    for index in order[:MOST_TRIES]:
        candidate = candidates[index]
        if not run.claim(candidate["url"]):
            continue
        try:
            media = dict(save_media(candidate, use))
        except Exception as error:
            run.release(candidate["url"])
            problems.append(f"{candidate['source']}: {str(error)[:60]}")
            continue
        if index in focus:
            media["focusX"], media["focusY"] = round(focus[index][0], 3), round(focus[index][1], 3)
        media["from"] = candidate["source"]
        return media, problems
    return None, problems


def find_media(job, run):
    request = job["request"]
    name = USE_NAMES.get(job["use"], "Picture")
    started = time.time()
    found = find_candidates(request["want"], request["query"])
    run.search_done()
    try:
        candidates = found["candidates"]
        if not candidates:
            answered = ", ".join(found["counts"])
            reason = "; ".join(found["problems"]) or (f"no results from {answered}" if answered else "no source answered in time")
            run.log(f"{name} \"{request['query']}\": nothing found ({reason})")
            return None
        ranked = rank_candidates(candidates, request, job["use"])
        order = list(ranked["order"])
        if not order:
            run.log(f"{name} \"{request['query']}\": {ranked['how']}, skipped")
            return None
        order += [index for index in heuristic_order(candidates, job["use"]) if index not in order]
        media, problems = try_candidates(candidates, order, ranked["focus"], run, job["use"])
        if media is None and request["want"] == "video":
            photos = find_candidates("photo", request["query"])["candidates"]
            if photos:
                media, more = try_candidates(photos, heuristic_order(photos, job["use"]), {}, run, job["use"])
                problems += more
        if media is None:
            run.log(f"{name} \"{request['query']}\": could not download a usable one ({'; '.join(problems)[:160]})")
            return None
        kind = "video" if media["kind"] == "video" else "photo"
        sources = ", ".join(f"{source} {count}" for source, count in found["counts"].items())
        run.log(f"{name} \"{request['query']}\": {media['from']} {kind} {media['width']}x{media['height']} "
                f"(results: {sources}), picked by {ranked['how']} in {time.time() - started:.1f}s")
        return media
    finally:
        run.pick_done()


def resolve_media(edit, jobs, log):
    run = MediaRun(edit, len(jobs), log)
    started = time.time()
    futures = [(job, media_pool.submit(find_media, job, run)) for job in jobs]
    results = {}
    late = []
    for job, future in futures:
        try:
            media = future.result(timeout=max(0.1, MEDIA_SECONDS - (time.time() - started)))
        except TimeoutError:
            late.append(job["request"]["query"])
            continue
        except Exception as error:
            log(f"A media search failed: {str(error)[:120]}")
            continue
        if media is not None:
            results[(job["insert"], job["where"])] = media
    if late:
        log(f"Left out {len(late)} slow searches to keep the edit fast: " + ", ".join(f'"{query}"' for query in late))
    return results


def finish_scene(scene, insert_id, results):
    elements = []
    for position, element in enumerate(scene["elements"]):
        if element["type"] in ("image", "portrait"):
            media = results.get((insert_id, ("element", position)))
            if media is None:
                continue
            element = {key: value for key, value in element.items() if key != "media"}
            element["src"] = media["src"]
        elif element["type"] == "gallery":
            srcs = []
            captions = []
            for slot in range(len(element["media"])):
                media = results.get((insert_id, ("gallery", position, slot)))
                if media is not None:
                    srcs.append(media["src"])
                    captions.append(element["captions"][slot])
            if len(srcs) < 2:
                continue
            element = {"type": "gallery", "srcs": srcs}
            if any(captions):
                element["captions"] = captions
        elements.append(element)
    if not any(element["type"] not in ("divider", "kicker") for element in elements):
        return None
    return {"layout": scene["layout"], "elements": elements}


def build_plan(draft, results, duration):
    inserts = []
    for insert in draft["inserts"]:
        item = {key: insert[key] for key in ("id", "type", "start", "end", "enter", "exit", "label")}
        if insert.get("motion"):
            item["motion"] = insert["motion"]
        if insert.get("request"):
            media = results.get((insert["id"], ("media",)))
            if media is None and not insert.get("template"):
                continue
            if media is not None:
                item["media"] = media
                item["query"] = insert["request"]["query"]
        if insert.get("template"):
            if insert["template"]["name"] in ("person", "showcase") and "media" not in item:
                continue
            item["template"] = insert["template"]
        if insert.get("scene"):
            scene = finish_scene(insert["scene"], insert["id"], results)
            if scene is None:
                continue
            item["scene"] = scene
        inserts.append(item)
    return {"version": 1, "sourceDuration": round(duration, 3), "keep": draft["keep"], "trims": False,
            "accent": draft["accent"], "zooms": draft["zooms"], "inserts": inserts}


def describe(inserts):
    counts = {}
    for insert in inserts:
        counts[insert["type"]] = counts.get(insert["type"], 0) + 1
    parts = [f"{count} {TYPE_NAMES[kind]}{'s' if count > 1 and kind != 'broll' else ''}" for kind, count in counts.items()]
    return ", ".join(parts) or "no visuals"


def warm_carrier(clip_name, plan):
    try:
        make_carrier(clip_name, plan)
    except Exception as error:
        print("Could not prepare the AI edit audio early:", error)


def run_edit(edit, project):
    def log(text):
        add_log(edit, text)

    try:
        start_step(edit, "read")
        words = [{"text": cue["hero"], "start": cue["start"], "end": cue["end"]} for cue in project["cues"]]
        duration = project["duration"]
        seconds = video_seconds(project["clip_name"])
        if seconds:
            duration = min(duration, seconds)
        pauses = sum(1 for before, after in zip(words, words[1:]) if after["start"] - before["end"] > 0.4)
        log(f"{len(words)} words in {duration:.1f}s, {pauses} pauses longer than 0.4s")
        finish_step(edit, "read")

        start_step(edit, "direct")
        raw, info = direct(project, words, duration, log)
        draft = normalize(raw, words, duration)
        log(f"Edit plan: {describe(draft['inserts'])}, {len(draft['zooms'])} zooms, {len(draft['cuts'])} word cuts, "
            f"{draft['removed']}s of dead air and stumbles removed")
        finish_step(edit, "direct")

        jobs = media_jobs(draft["inserts"])
        start_step(edit, "search")
        start_step(edit, "pick")
        if jobs:
            log(f"Searching {len(jobs)} photos and videos at once (Pinterest videos, Bing, Yahoo and Google images)")
            results = resolve_media(edit, jobs, log)
        else:
            results = {}
        for key in ("search", "pick"):
            if find_step(edit, key)["state"] == "running":
                finish_step(edit, key)

        start_step(edit, "build")
        plan = build_plan(draft, results, duration)
        info.update({"read": draft["read"], "cuts": draft["cuts"], "removed": draft["removed"],
                     "asked": len(jobs), "found": len(results), "made_in": round(time.time() - edit["started_at"], 1)})
        edit["plan"] = plan
        edit["info"] = info
        log(f"AI edit ready in {info['made_in']}s: {describe(plan['inserts'])}, {len(plan['zooms'])} zooms, "
            f"reel {edit_frames(plan) / 30:.1f}s (was {duration:.1f}s)")
        finish_step(edit, "build")
        edit["status"] = "ready"
        save_edit(edit)
        threading.Thread(target=warm_carrier, args=(project["clip_name"], plan), daemon=True).start()
    except Exception as error:
        fail_running_steps(edit)
        edit["error"] = str(error)
        edit["status"] = "failed"
        log("Failed: " + str(error))


def stable_link(key):
    with links_lock:
        known = links.get(key)
        if known and known[1] > time.time():
            return known[0]
    link = file_link(key)
    with links_lock:
        links[key] = (link, time.time() + LINK_SECONDS)
    return link


def linked(value, fresh=False):
    if isinstance(value, str) and value.startswith("s3:"):
        return file_link(value[3:]) if fresh else stable_link(value[3:])
    if isinstance(value, list):
        return [linked(item, fresh) for item in value]
    if isinstance(value, dict):
        return {key: linked(item, fresh) for key, item in value.items()}
    return value


def edit_for_browser(edit):
    item = {"status": edit["status"], "steps": steps_for_browser(edit), "error": edit["error"], "round": edit["round"],
            "log": log_for_browser(list(edit["log"]), edit["started_at"])}
    if edit["status"] == "ready":
        item["plan"] = linked(edit["plan"])
        item["info"] = edit["info"]
        item["frames"] = edit_frames(edit["plan"])
    return item


def set_switches(edit, off, trims):
    plan = edit["plan"]
    off = {str(item) for item in off} if isinstance(off, list) else None
    for item in plan["inserts"] + plan["zooms"]:
        if off is None:
            continue
        if item["id"] in off:
            item["off"] = True
        else:
            item.pop("off", None)
    if isinstance(trims, bool):
        plan["trims"] = trims
    save_edit(edit)
    threading.Thread(target=warm_carrier, args=(edit["clip"], plan), daemon=True).start()


def edit_render_job(project, planned):
    edit = find_edit(project["clip_name"])
    if edit is None or edit["status"] != "ready":
        raise Exception("The AI edit is not ready yet")
    plan = edit["plan"]
    frames = edit_frames(plan)
    carrier = make_carrier(project["clip_name"], plan)
    caption_props = (planned["job"].get("inputProps") or {}).get("props")
    job = {
        "inputProps": {"props": caption_props, "edit": linked(plan, fresh=True), "video": file_link(project["video_key"]),
                       "frames": frames},
        "top": 0,
        "height": 1920,
        "width": 1080,
        "gl": planned["job"].get("gl"),
        "blend": None,
        "videoFilter": None,
    }
    return {"job": job, "frames": frames, "video_url": file_link(carrier), "serve_url": EDIT_SITE_URL}
