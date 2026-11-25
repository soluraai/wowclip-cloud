import sys

from clip_finder.llm_cost_in_rupees import get_dollar_rate
from youtube_data.fetch_video_data import fetch_video_data
from clip_finder.find_best_clips import find_clips
from clip_finder.make_clip_thumbnails import make_hd_frames, make_preview_frames

DEFAULT_OPTIONS = {
    "length_mode": "ai",
    "min_seconds": 30,
    "max_seconds": 90,
    "timeframe_start": 0,
    "timeframe_end": 0,
    "genre": "auto",
    "instruction": "",
}


def run_pipeline(video_id, options):
    video_data = fetch_video_data(video_id)
    found = find_clips(video_data, options)
    make_preview_frames(video_id, found["clips"], video_data["page"])
    make_hd_frames(video_id, found["clips"], video_id)
    return {
        "info": video_data["info"],
        "captions": video_data["captions"],
        "clips": found["clips"],
        "notice": found["notice"],
        "usage": found["usage"],
    }


def show_time(seconds):
    minutes = int(seconds // 60)
    rest = int(seconds % 60)
    return f"{minutes}:{rest:02d}"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_pipeline.py VIDEO_ID")
        sys.exit(1)

    result = run_pipeline(sys.argv[1], dict(DEFAULT_OPTIONS))

    print(result["info"]["title"])
    print(len(result["clips"]), "clips found")
    if result["notice"]:
        print("Note:", result["notice"])
    for number, clip in enumerate(result["clips"], start=1):
        print()
        print(f"{number}. {clip['title']}")
        print(f"   {show_time(clip['start_seconds'])} - {show_time(clip['end_seconds'])}   score {clip['virality_score']}/100")
        print(f"   {clip['why_viral']}")
        print(f"   thumbnail: {clip['thumbnail_file'] or 'none'}")

    usage = result["usage"]
    rate = get_dollar_rate()
    print()
    print("Model:", usage["model"], "on", usage["provider"])
    print("Tokens in:", usage["input_tokens"], "| tokens out:", usage["output_tokens"])
    print(f"LLM time: {usage['seconds']:.1f} seconds")
    print(f"Cost: ${usage['cost_usd']:.5f}  =  Rs {usage['cost_usd'] * rate:.3f}  (1 dollar = Rs {rate})")
