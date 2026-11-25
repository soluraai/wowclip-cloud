import json
import time

from clip_finder.clean_clip_options import clean_options
from clip_finder.ask_llm_with_fallback import ask_llm
from clip_finder.build_clip_finder_prompt import build_user_message, load_system_prompt
from settings import AI_MAX_SECONDS, AI_MIN_SECONDS, MAX_CLIP_SECONDS

TOLERANCE_SECONDS = 5
SCORE_PARTS = ["hook", "emotion", "shareability", "clarity"]
TEXT_FIELDS = ["category", "hook_line", "summary", "watch_out", "audience"]

NOTICES = {
    "ignored": "We could not understand your request, so the AI picked the best clips on its own.",
    "not_found": "We could not find anything that matches your request, so here are the best clips from the video instead.",
}


def parse_json(text):
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise Exception("The LLM did not send JSON.")
    return json.loads(text[start:end + 1])


def length_is_allowed(length, options):
    if options["length_mode"] == "range":
        too_short = length < options["min_seconds"] - TOLERANCE_SECONDS
        too_long = length > options["max_seconds"] + TOLERANCE_SECONDS
        return length <= MAX_CLIP_SECONDS and not too_short and not too_long

    return AI_MIN_SECONDS <= length <= AI_MAX_SECONDS


def overlaps(clip, kept_clips):
    for other in kept_clips:
        if clip["start_seconds"] < other["end_seconds"] and other["start_seconds"] < clip["end_seconds"]:
            return True
    return False


def score_between(value):
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 0


def clean_scores(scores):
    if not isinstance(scores, dict):
        scores = {}
    cleaned = {}
    for name in SCORE_PARTS:
        cleaned[name] = score_between(scores.get(name))
    return cleaned


def clean_strengths(strengths):
    if not isinstance(strengths, list):
        return []
    cleaned = []
    for item in strengths[:3]:
        text = str(item).strip()
        if text != "":
            cleaned.append(text)
    return cleaned


def clean_clips(clips, options):
    good_clips = []

    for clip in clips:
        try:
            clip["start_seconds"] = float(clip["start_seconds"])
            clip["end_seconds"] = float(clip["end_seconds"])
            clip["virality_score"] = score_between(clip["virality_score"])
            clip["title"] = str(clip["title"])
            clip["why_viral"] = str(clip["why_viral"])
        except (KeyError, ValueError, TypeError):
            continue

        clip["scores"] = clean_scores(clip.get("scores"))
        clip["strengths"] = clean_strengths(clip.get("strengths"))
        for field in TEXT_FIELDS:
            clip[field] = str(clip.get(field) or "").strip()

        length = clip["end_seconds"] - clip["start_seconds"]
        if clip["start_seconds"] < options["timeframe_start"] - TOLERANCE_SECONDS:
            continue
        if clip["end_seconds"] > options["timeframe_end"] + TOLERANCE_SECONDS:
            continue
        if length <= 0 or not length_is_allowed(length, options):
            continue

        clip["length_seconds"] = length
        good_clips.append(clip)

    good_clips.sort(key=lambda clip: clip["virality_score"], reverse=True)

    kept_clips = []
    for clip in good_clips:
        if len(kept_clips) == options["max_clips"]:
            break
        if not overlaps(clip, kept_clips):
            kept_clips.append(clip)
    return kept_clips


def run_llm(video_data, options, log):
    system_prompt = load_system_prompt()
    user_message = build_user_message(video_data, options)

    started = time.time()
    reply = ask_llm(system_prompt, user_message, check=parse_json, log=log)
    seconds = time.time() - started
    data = parse_json(reply["answer"])

    clips = clean_clips(data.get("clips", []), options)

    request_status = data.get("request_status", "none")
    if options["instruction"] == "":
        request_status = "none"

    usage = {
        "model": reply["model"],
        "provider": reply["provider"],
        "input_tokens": reply["input_tokens"],
        "output_tokens": reply["output_tokens"],
        "cost_usd": reply["cost_usd"],
        "seconds": seconds,
    }
    return {"clips": clips, "request_status": request_status, "usage": usage}


def add_usage(first, second):
    total = dict(second)
    for key in ["input_tokens", "output_tokens", "cost_usd", "seconds"]:
        total[key] = first[key] + second[key]
    return total


def find_clips(video_data, options, log=print):
    options = clean_options(options, video_data["info"]["duration_seconds"])
    result = run_llm(video_data, options, log)
    usage = result["usage"]
    request_status = result["request_status"]

    if options["instruction"] != "" and len(result["clips"]) == 0:
        normal_options = dict(options)
        normal_options["instruction"] = ""
        result = run_llm(video_data, normal_options, log)
        usage = add_usage(usage, result["usage"])
        request_status = "not_found"

    clips = result["clips"]
    notice = NOTICES.get(request_status, "")
    if len(clips) == 0:
        notice = "We could not find any good clips in this video."

    return {"clips": clips, "request_status": request_status, "notice": notice, "usage": usage}
