import os

from settings import AI_MAX_SECONDS, AI_MIN_SECONDS, BACKEND_FOLDER

PROMPT_FILE = os.path.join(BACKEND_FOLDER, "clip_finder", "prompts", "find_clips.md")


def load_system_prompt():
    with open(PROMPT_FILE, encoding="utf-8") as file:
        return file.read()


def format_transcript(lines):
    text = ""
    for line in lines:
        text = text + f"[{int(line['start'])}s] {line['text']}\n"
    return text


def describe_length(options):
    if options["length_mode"] == "range":
        text = f"Each clip must be between {options['min_seconds']} and {options['max_seconds']} seconds long. "
        text = text + "Pick moments that are naturally about this long. Do not pad a clip or cut a thought short to fit."
        return text

    text = "Choose the length of each clip yourself. The clips are for Instagram Reels and YouTube Shorts. "
    text = text + "The sweet spot is 30 to 60 seconds. "
    text = text + "Go up to about 90 seconds when the moment needs it to be complete. "
    text = text + f"Only go longer, and never above {AI_MAX_SECONDS} seconds, when a story or an argument clearly earns the extra time. "
    text = text + f"Never go below {AI_MIN_SECONDS} seconds. Do not stretch a clip just to reach a length."
    return text


def lines_in_timeframe(lines, options):
    selected = []
    for line in lines:
        if options["timeframe_start"] <= line["start"] < options["timeframe_end"]:
            selected.append(line)
    return selected


def build_user_message(video_data, options):
    info = video_data["info"]
    captions = video_data["captions"]
    whole_video = options["timeframe_start"] == 0 and options["timeframe_end"] >= info["duration_seconds"]

    message = f"Video title: {info['title']}\n"
    message = message + f"Channel: {info['channel']}\n"
    message = message + f"Video length: {info['duration_seconds']} seconds\n"
    if options["genre"] != "":
        message = message + f"Video type (chosen by the user): {options['genre']}\n"
    message = message + f"Captions: {captions['kind']} ({captions['language']})\n\n"

    message = message + f"Return every moment that is truly worth a clip, from 0 up to {options['max_clips']} clips. "
    message = message + "You decide how many. A short or weak video may have only one or two good moments, or none. "
    message = message + f"A long video full of strong moments can have up to {options['max_clips']}.\n"
    message = message + describe_length(options) + "\n"

    if not whole_video:
        message = message + f"Only pick clips between second {options['timeframe_start']} and second {options['timeframe_end']}. "
        message = message + "The transcript below only covers that part of the video.\n"

    if options["instruction"].strip() != "":
        message = message + "\nWhat the user asked for (use it to decide which moments to pick):\n"
        message = message + options["instruction"].strip() + "\n"

    message = message + "\nTranscript:\n"
    message = message + format_transcript(lines_in_timeframe(captions["lines"], options))
    return message
