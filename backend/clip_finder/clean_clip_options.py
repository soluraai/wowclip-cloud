from settings import MAX_CLIP_SECONDS

MIN_CLIP_SECONDS = 10
MAX_CLIP_COUNT = 15
MAX_INSTRUCTION_LENGTH = 500
MIN_TIMEFRAME_SECONDS = 60

GENRES = {
    "auto": "",
    "podcast": "Podcast",
    "interview": "Interview",
    "speech": "Speech or talk",
    "comedy": "Comedy",
    "education": "Education",
    "business": "Business",
    "debate": "Debate",
    "vlog": "Vlog",
    "news": "News",
}


def to_number(value, default):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def has_letters(text):
    for character in text:
        if character.isalpha():
            return True
    return False


def clean_options(options, video_seconds):
    length_mode = options.get("length_mode", "ai")
    min_seconds = to_number(options.get("min_seconds"), 0)
    max_seconds = to_number(options.get("max_seconds"), 0)
    if length_mode == "range":
        min_seconds = max(min_seconds, MIN_CLIP_SECONDS)
        max_seconds = min(max_seconds, MAX_CLIP_SECONDS)
        if min_seconds >= max_seconds:
            length_mode = "ai"
    else:
        length_mode = "ai"

    timeframe_start = to_number(options.get("timeframe_start"), 0)
    timeframe_end = to_number(options.get("timeframe_end"), 0)
    timeframe_start = max(timeframe_start, 0)
    timeframe_end = min(timeframe_end, video_seconds)
    if timeframe_end - timeframe_start < MIN_TIMEFRAME_SECONDS:
        timeframe_start = 0
        timeframe_end = video_seconds

    genre = GENRES.get(options.get("genre"), "")

    instruction = str(options.get("instruction") or "").strip()
    instruction = instruction[:MAX_INSTRUCTION_LENGTH]
    if not has_letters(instruction):
        instruction = ""

    return {
        "max_clips": MAX_CLIP_COUNT,
        "length_mode": length_mode,
        "min_seconds": min_seconds,
        "max_seconds": max_seconds,
        "timeframe_start": timeframe_start,
        "timeframe_end": timeframe_end,
        "genre": genre,
        "instruction": instruction,
    }
