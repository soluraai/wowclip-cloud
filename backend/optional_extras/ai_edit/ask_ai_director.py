import json
import os
import re
import threading
import time

import requests

from settings import EDIT_BACKUP_MODEL, EDIT_DIRECTOR_MODELS, OPENROUTER_API_KEY

API_URL = "https://openrouter.ai/api/v1/chat/completions"
PROMPT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")
GAP_SHOWN_SECONDS = 0.3

FAMILIES = {
    "funny": ["funny", "comedy", "humor", "humour", "roast", "savage", "comeback", "banter", "joke", "sarcasm"],
    "emotional": ["emotional", "motivation", "motivational", "inspiring", "inspiration", "heart", "sad", "grief",
                  "spiritual", "love", "pain", "struggle", "life lesson"],
    "story": ["story", "drama", "anecdote", "experience", "journey", "confession", "history"],
}


def family_of(category):
    text = (category or "").lower()
    for family, words in FAMILIES.items():
        if any(word in text for word in words):
            return family
    return "explainer"


def read_prompt(name):
    with open(os.path.join(PROMPT_FOLDER, name), encoding="utf-8") as file:
        return file.read()


def system_prompt(family):
    return read_prompt("director.md").replace("{{APPROACH}}", read_prompt(f"approach_{family}.md").strip())


def words_block(words):
    lines = []
    line = []
    line_start = None
    for index, word in enumerate(words):
        if index > 0:
            gap = word["start"] - words[index - 1]["end"]
            if gap >= GAP_SHOWN_SECONDS:
                line.append(f"(pause {gap:.1f}s)")
        if line_start is None:
            line_start = word["start"]
        line.append(f"w{index} {word['text']}")
        ends_sentence = re.search(r"[.!?]$", word["text"]) is not None
        if (ends_sentence and len(line) >= 6) or len(line) >= 22:
            lines.append(f"[{line_start:.2f}s] " + "  ".join(line))
            line = []
            line_start = None
    if line:
        lines.append(f"[{line_start:.2f}s] " + "  ".join(line))
    return "\n".join(lines)


def user_message(clip, words, duration):
    return "\n".join([
        "CLIP",
        f"title: {clip.get('title', '')}",
        f"kind of moment: {clip.get('category') or 'Insight'}",
        f"hook line: {clip.get('hook_line', '')}",
        f"what it says: {clip.get('summary', '')}",
        f"from the video: \"{clip.get('video_title', '')}\" by {clip.get('channel', '')}",
        f"length: {duration:.1f} s, {len(words)} words",
        "",
        "WORDS (each line starts with its time in the clip; every word has its id; pauses are shown where the speaker is silent)",
        words_block(words),
        "",
        "Plan the edit now. Return only the JSON object.",
    ])


def parse_plan(answer):
    text = answer.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise Exception("no JSON object in the answer")
    plan = json.loads(text[start:end + 1])
    if not isinstance(plan, dict) or not isinstance(plan.get("visuals"), list):
        raise Exception("the plan has no visuals list")
    return plan


def call_model(llm, system, message):
    body = {
        "model": llm["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
        "temperature": 0.4,
        "max_tokens": llm.get("max_tokens", 24000),
        "reasoning": llm["reasoning"],
        "provider": {"order": llm["providers"], "allow_fallbacks": False},
        "usage": {"include": True},
    }
    headers = {"Authorization": "Bearer " + OPENROUTER_API_KEY}
    response = requests.post(API_URL, json=body, headers=headers, timeout=(10, llm["seconds"] + 30))
    if response.status_code != 200:
        try:
            reason = response.json()["error"]["message"]
        except Exception:
            reason = response.text[:160]
        raise Exception(f"error {response.status_code}: {reason}")
    data = response.json()
    if "error" in data:
        raise Exception(data["error"].get("message", "unknown error"))
    answer = data["choices"][0]["message"].get("content") or ""
    usage = data.get("usage", {})
    return {
        "plan": parse_plan(answer),
        "model": llm["name"],
        "provider": data.get("provider", llm["providers"][0]),
        "output_tokens": usage.get("completion_tokens", 0),
        "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
        "cost_usd": usage.get("cost", 0),
    }


def run_in_thread(work):
    box = {"done": threading.Event()}

    def target():
        try:
            box["result"] = work()
        except Exception as error:
            box["error"] = error
        box["done"].set()

    threading.Thread(target=target, daemon=True).start()
    return box


def ask_director(clip, words, duration, log=print):
    family = family_of(clip.get("category"))
    system = system_prompt(family)
    message = user_message(clip, words, duration)
    log(f"Editing style for a \"{clip.get('category') or 'Insight'}\" clip: {family}")

    backup = EDIT_BACKUP_MODEL
    started = time.time()
    backup_box = run_in_thread(lambda: call_model(backup, system, message))
    for llm in EDIT_DIRECTOR_MODELS:
        log(f"{llm['name']} is planning the edit ({llm['providers'][0]}, thinking {llm['reasoning'].get('effort', 'on')})")
        began = time.time()
        box = run_in_thread(lambda llm=llm: call_model(llm, system, message))
        box["done"].wait(llm["seconds"])
        if "result" in box:
            result = box["result"]
            result.update({"family": family, "seconds": round(time.time() - began, 1)})
            log(f"{llm['name']} planned {len(result['plan'].get('visuals', []))} visuals in {result['seconds']}s "
                f"({result['reasoning_tokens']} thinking tokens)")
            return result
        reason = str(box.get("error") or f"no answer in {llm['seconds']}s")
        log(f"{llm['name']} could not answer: {reason[:200]}")

    backup_box["done"].wait(max(1, backup["seconds"] - (time.time() - started)))
    if "result" in backup_box:
        result = backup_box["result"]
        result.update({"family": family, "seconds": round(time.time() - started, 1)})
        log(f"Using the fast backup plan from {backup['name']}")
        return result
    raise Exception("No AI model could plan the edit: " + str(backup_box.get("error") or "timed out")[:200])
