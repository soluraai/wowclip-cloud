import os
import subprocess

import requests

from settings import DEEPGRAM_API_KEY, ELEVENLABS_API_KEY

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text"
TIMEOUT_SECONDS = 120


def extract_audio(video_path):
    audio_path = os.path.splitext(video_path)[0] + ".mp3"
    command = ["ffmpeg", "-y", "-loglevel", "error", "-i", video_path, "-vn", "-ac", "1", "-ar", "16000",
               "-b:a", "48k", audio_path]
    subprocess.run(command, check=True, capture_output=True)
    return audio_path


def deepgram_words(audio_path):
    params = {"model": "nova-3", "language": "multi", "smart_format": "true", "punctuate": "true"}
    headers = {"Authorization": "Token " + DEEPGRAM_API_KEY, "Content-Type": "audio/mpeg"}
    with open(audio_path, "rb") as file:
        response = requests.post(DEEPGRAM_URL, params=params, headers=headers, data=file, timeout=TIMEOUT_SECONDS)
    if response.status_code != 200:
        raise Exception(f"Deepgram error {response.status_code}: {response.text[:200]}")
    channel = response.json()["results"]["channels"][0]
    words = []
    for word in channel["alternatives"][0]["words"]:
        words.append({"text": word.get("punctuated_word") or word["word"], "start": word["start"], "end": word["end"]})
    return words, channel.get("detected_language")


def elevenlabs_words(audio_path):
    with open(audio_path, "rb") as file:
        response = requests.post(ELEVENLABS_URL, headers={"xi-api-key": ELEVENLABS_API_KEY},
                                 data={"model_id": "scribe_v1", "timestamps_granularity": "word"},
                                 files={"file": file}, timeout=TIMEOUT_SECONDS)
    if response.status_code != 200:
        raise Exception(f"ElevenLabs error {response.status_code}: {response.text[:200]}")
    data = response.json()
    words = []
    for word in data.get("words", []):
        if word.get("type") == "word" and word["text"].strip():
            words.append({"text": word["text"].strip(), "start": word["start"], "end": word["end"]})
    return words, data.get("language_code")


def transcribe_clip(video_path, log):
    audio_path = extract_audio(video_path)
    if ELEVENLABS_API_KEY:
        log("Sending the clip's audio to ElevenLabs for word-by-word timings")
        return elevenlabs_words(audio_path)
    log("Sending the clip's audio to Deepgram (nova-3) for word-by-word timings")
    return deepgram_words(audio_path)
