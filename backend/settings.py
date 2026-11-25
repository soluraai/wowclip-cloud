import json
import os

BACKEND_FOLDER = os.path.dirname(os.path.abspath(__file__))
KEYS_FILE = os.path.join(BACKEND_FOLDER, "api_keys.json")
OUTPUT_FOLDER = os.path.join(BACKEND_FOLDER, "output")

if not os.path.exists(KEYS_FILE):
    raise Exception("api_keys.json is missing. Copy api_keys.example.json and fill in your keys.")

with open(KEYS_FILE) as file:
    keys = json.load(file)

# Modal login comes from api_keys.json, so a new laptop does not need "modal token new".
if keys.get("MODAL_TOKEN_ID") and keys.get("MODAL_TOKEN_SECRET"):
    os.environ["MODAL_TOKEN_ID"] = keys["MODAL_TOKEN_ID"]
    os.environ["MODAL_TOKEN_SECRET"] = keys["MODAL_TOKEN_SECRET"]

YOUTUBE_API_KEY = keys["YOUTUBE_API_KEY"]
OPENROUTER_API_KEY = keys["OPENROUTER_API_KEY"]
CLIPSCUTTER_API_KEY = keys["CLIPSCUTTER_API_KEY"]
DEEPGRAM_API_KEY = keys.get("DEEPGRAM_API_KEY", "")
ELEVENLABS_API_KEY = keys.get("ELEVENLABS_API_KEY", "")
SCRAPPA_API_KEY = keys.get("SCRAPPA_API_KEY", "")

LLM_MODELS = [
    {
        "name": "Gemini 2.5 Flash Lite",
        "model": "google/gemini-2.5-flash-lite",
        "providers": ["google-ai-studio", "google-ai-studio/priority"],
        "reasoning": {"max_tokens": 1500},
    },
    {
        "name": "GLM 5.3 Flash",
        "model": "z-ai/glm-5.3-flash",
        "providers": ["fireworks", "z-ai/fp8"],
        "reasoning": {"effort": "low"},
    },
    {
        "name": "GPT-OSS 120B",
        "model": "openai/gpt-oss-120b",
        "providers": ["cerebras/fp16", "sambanova"],
        "reasoning": {"effort": "low"},
    },
    {
        "name": "Gemini 3.1 Flash Lite",
        "model": "google/gemini-3.1-flash-lite",
        "providers": ["google-vertex/global"],
        "reasoning": {"max_tokens": 1500},
    },
]
EDIT_DIRECTOR_MODELS = [
    {
        "name": "GLM 5.3",
        "model": "z-ai/glm-5.3",
        "providers": ["fireworks/fast"],
        "reasoning": {"effort": "high"},
        "max_tokens": 16000,
        "seconds": 40,
    },
]
EDIT_BACKUP_MODEL = {
    "name": "Gemini 3.8 Flash",
    "model": "google/gemini-3.8-flash",
    "providers": ["google-vertex/global", "google-ai-studio"],
    "reasoning": {"effort": "low"},
    "max_tokens": 12000,
    "seconds": 60,
}
EDIT_VISION_MODELS = [
    {"name": "Gemini 3.5 Flash Lite", "model": "google/gemini-3.5-flash-lite", "providers": ["google-vertex/global", "google-ai-studio"]},
    {"name": "Gemini 3.1 Flash Lite", "model": "google/gemini-3.1-flash-lite", "providers": ["google-vertex/global", "google-ai-studio"]},
]
MAX_CLIP_SECONDS = 300
AI_MIN_SECONDS = 15
AI_MAX_SECONDS = 180

proxy_user = keys["GPROXY_USER"]
proxy_password = keys["GPROXY_PASS"]
proxy_host = keys["GPROXY_HOST"]
proxy_port = keys["GPROXY_PORT"]

PROXY_URL = f"http://{proxy_user}:{proxy_password}@{proxy_host}:{proxy_port}"

AWS_ACCESS_KEY_ID = keys["AWS_ACCESS_KEY_ID"]
AWS_SECRET_ACCESS_KEY = keys["AWS_SECRET_ACCESS_KEY"]
AWS_REGION = keys["AWS_REGION"]
MEDIA_BUCKET = keys["MEDIA_BUCKET"]
RENDER_TOOLS_BUCKET = keys["RENDER_TOOLS_BUCKET"]
RENDER_SITE_URL = keys["RENDER_SITE_URL"]
RENDER_PUBLIC_BASE = keys["RENDER_PUBLIC_BASE"]
RENDER_FUNCTION = keys["RENDER_FUNCTION"]
EDIT_SITE_URL = keys.get("EDIT_SITE_URL") or RENDER_SITE_URL.split("/sites/")[0] + "/sites/wowclip-edit/index.html"
