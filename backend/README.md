# Backend (Python + Flask)

The code is split into one folder per part of the project. `server.py` is the only file the frontend talks to.

```
backend/
├── server.py            the HTTP server (all endpoints are listed below)
├── settings.py          reads the keys from api_keys.json
├── progress_tracker.py  steps and live log lines, shared by every part
├── find_clips_from_terminal.py   finds clips from the command line (no server needed)
├── youtube_data/        Part 1a: everything we read from YouTube
├── clip_finder/         Part 1b: the AI that picks the moments
├── reel/                Part 2a: cutting the clip and cropping it to 9:16
├── editor/              Part 2b: what the caption editor (Capiyo's) asks for: projects, My styles, exports
├── aws/                 Part 2c: S3 storage, the Lambda render, the render history
└── optional_extras/     features that are not part of the main flow:
    ├── ai_edit/             the AI edit director (plans cuts and visuals, finds the media)
    ├── modal_gpu/           speaker crop on a Modal GPU (the app falls back to this computer without it)
    └── demo_mode/           replays a saved run, so the app can be shown without waiting
```

## Part 1: finding the clips

1. When the link is entered, `server.py` gets the video details (`youtube_data/fetch_video_info_from_api.py`, YouTube Data API) and
   starts `youtube_data/prefetch_video_in_background.py` in the background: it reads the YouTube page once with yt-dlp through the proxy
   (`fetch_youtube_watch_page.py`) and takes the captions from it (`fetch_youtube_captions.py`). This runs while the user picks options.
2. "Find my clips" sends the transcript to the LLM (`clip_finder/find_best_clips.py`, OpenRouter). It returns 0 to 15 clips,
   each with a virality score, four sub-scores, a hook line, a summary, why it can go viral, strengths, risks and the
   audience. The code checks every clip and drops the bad ones.

### If the AI is busy: the fallback chain

Cloud AI services limit how many requests they take (error 429, "rate-limited"). So the app does not depend on one
model. `clip_finder/ask_llm_with_fallback.py` tries the models in `LLM_MODELS` (`settings.py`) in order, and moves to the next one
when a model is rate-limited, down, slower than 120 seconds, or sends an answer that is not valid JSON:

| Order | Model | Providers (tried in this order) | Time on a 92 min video |
| --- | --- | --- | --- |
| 1 | Gemini 2.5 Flash Lite | Google AI Studio, then its priority lane | ~20 s |
| 2 | GLM 5.3 Flash, low thinking | Fireworks, then Z.AI (GLM's own maker) | ~21–26 s |
| 3 | GPT-OSS 120B, low thinking | Cerebras, then SambaNova (very fast AI chips) | ~5 s |
| 4 | Gemini 3.1 Flash Lite | Google Vertex AI | ~15 s |

If all four fail, it waits 3 seconds and goes through them once more. Every switch is written in the live log, and the
log says which model and provider answered. The models are from three different companies on different clouds, so
one company's outage does not stop the app.
3. `clip_finder/make_clip_thumbnails.py` cuts a preview frame for every clip from YouTube's storyboard (instant), shows
   the clips, then replaces each frame with a sharp 1080p frame in the background.

## Part 2: making a reel (clip -> Capiyo's caption editor -> export on AWS Lambda -> history)

| Step | Where | File |
| --- | --- | --- |
| Download the clip at 1080p | ClipsCutter API | `reel/cut_clip_from_youtube.py` |
| Find who is talking and crop to 9:16 around them | this computer, MediaPipe + ffmpeg | `reel/crop_to_vertical_9x16.py` |
| Upload the vertical clip | AWS S3 | `reel/prepare_clip_for_editor.py`, `aws/s3_storage.py` |
| Open the clip as an editor project: the video, its words as caption cues, the saved draft | this computer + S3 | `editor/editor_projects.py`, `aws/s3_storage.py` |
| The user designs the captions in Capiyo's editor (all in the browser) | the browser | `frontend/capiyo/` |
| Plan the render: caption strip, video filter, render flags (Capiyo's code) | Next.js server | `frontend/app/api/projects/[id]/render/route.ts` |
| Write the job file, split the frames into pieces, one AWS Lambda per piece (up to 100) | AWS Lambda | `editor/export_reel.py`, `aws/parallel_render_on_lambda.py` |
| Each Lambda draws its caption frames, lays them on the video, uploads its piece | AWS Lambda | (deployed render function) |
| The last Lambda joins all pieces and adds the audio | AWS Lambda | (deployed render function) |
| Save the reel's record and cover in the history | AWS S3 | `aws/render_history.py` |

Download, crop and upload start as soon as a clip has been open for 3 seconds, so they are usually done before the
editor opens. While they run, the editor shows its "Making your captions" screen.

### The caption editor and its project

"Make reel" opens Capiyo's editor at `/editor?id=<job id>-<clip number>`. Capiyo's editor expects a Capiyo server,
so `server.py` answers the same addresses with the same JSON shapes (`/projects/<id>`, `/styles`, ...). In Capiyo a
project is an uploaded video; in wowclip a project is one clip:

- `editor/editor_projects.py` turns the clip into a project: the clip's YouTube words become the editor's caption cues
  (times from the clip start, sound tags like `[Music]` left out, a word shown at most 1.2 s). The project is saved to
  S3 (`wowclip/projects/<id>.json`) the first time it opens, so it still opens after a restart or on another laptop.
  Its status is `transcribing` while the clip is being prepared and `ready` when the 9:16 clip is in S3.
- `server.py` (`PATCH /projects/<id>`, key from `aws/s3_storage.py`) saves the editor's whole state (style, settings, edited words) to S3 every 30 seconds, keyed by
  the clip itself (`wowclip/drafts/<clip name>.json`), so finding the same clip again later reopens the same design.
- `editor/saved_caption_styles.py` keeps the editor's "My styles" in one S3 file (`wowclip/my-styles.json`).
- `editor/export_reel.py` takes the job Capiyo's planning code made, adds the video link, splits the frames over up to
  100 Lambdas and follows them. Each export has an id made from everything that changes the video, so exporting the
  same design again gives back the same reel at once ("Nothing changed since your last export").

What wowclip leaves out from Capiyo: sign-in, credits and payments (every export is free), uploading your own video,
ElevenLabs transcription (YouTube's captions are used) and the AI emphasis pass (`/ai/enhance` answers "not part of
wowclip").

Active speaker detection: MediaPipe looks at 4 frames per second, finds every face, follows each face over time and
measures how much its mouth moves. The face whose mouth moves most is the speaker; the crop follows them, and a shot
must last at least 1.5 seconds so the crop does not jump around. No face: centre crop. Already vertical: only trimmed.

## Where everything is in S3

Everything this app writes goes into one folder of the media bucket (`MEDIA_BUCKET` in `api_keys.json`):

```
s3://<MEDIA_BUCKET>/wowclip/
├── clips/<clip name>/video.mp4      the 9:16 clip the editor plays and the Lambdas draw captions on
├── projects/<job id>-<n>.json       one editor project per clip (title, times, caption cues)
├── drafts/<clip name>.json          the editor's saved design for that clip
├── my-styles.json                   the editor's "My styles"
├── reels/<render id>.mp4            the finished reels
└── history/<render id>.json + .jpg  one record and one cover per reel (the render history)
```

The Lambdas also use `jobs/<run id>/` for their job file and progress notes; that folder empties itself after a day.

The render history page (`/history` in the app) lists `wowclip/history/` every time it opens. Nothing is kept in the
browser or on this computer, so another laptop with the same `api_keys.json` shows the same history.

How to look at the files yourself:

- In the app: "Render history" -> "Open in AWS console" (or "S3" on a reel).
- In the AWS console: S3 -> the media bucket -> `wowclip/` (region `AWS_REGION`, Sydney).
- With the AWS CLI (after `aws configure` with the same keys):

```
aws s3 ls s3://<MEDIA_BUCKET>/wowclip/ --recursive
aws s3 cp s3://<MEDIA_BUCKET>/wowclip/reels/<render id>.mp4 .
```

## Files

| Folder | File | Job |
| --- | --- | --- |
| | `settings.py` | reads the keys from `api_keys.json` |
| | `progress_tracker.py` | steps and log lines shared by both parts |
| | `server.py` | the HTTP server the frontend talks to |
| | `find_clips_from_terminal.py` | finds clips from the command line |
| `youtube_data/` | `fetch_video_info_from_api.py` | video details from the YouTube Data API |
| | `fetch_youtube_watch_page.py` | one yt-dlp read of the YouTube page, through the proxy |
| | `fetch_youtube_captions.py` | turns the caption file into timed lines and words |
| | `prefetch_video_in_background.py` | reads the page and captions in the background, once per video |
| | `fetch_video_data.py` | details + page + captions in one call (used by `find_clips_from_terminal.py`) |
| `clip_finder/` | `clean_clip_options.py` | checks and cleans the options the user picked |
| | `build_clip_finder_prompt.py` + `prompts/find_clips.md` | what we tell the LLM |
| | `ask_llm_with_fallback.py` | the OpenRouter call, with the fallback chain |
| | `find_best_clips.py` | asks the LLM and cleans its answer |
| | `make_clip_thumbnails.py` | preview frames, then 1080p frames |
| | `llm_cost_in_rupees.py` | dollar to rupee rate for the cost print |
| `reel/` | `cut_clip_from_youtube.py` | cuts a part of a YouTube video with the ClipsCutter API and downloads it |
| | `crop_to_vertical_9x16.py` + `models/face_landmarker.task` | active speaker detection and the 9:16 crop |
| | `transcribe_clip_speech.py` | word timings for the clip (Deepgram, ElevenLabs) |
| | `prepare_clip_for_editor.py` | prepares a clip (download, crop, upload) with a live log; brings it back from S3 when needed |
| `editor/` | `editor_projects.py` | a clip as an editor project: caption cues, status, saved in S3 |
| | `saved_caption_styles.py` | the editor's "My styles" in S3 |
| | `pick_emphasis_words.py` | which words the captions should emphasise |
| | `export_reel.py` | exports: the planned job to the Lambdas, progress, past exports, history record |
| `aws/` | `s3_storage.py` | S3 upload/download, JSON read/write, signed links, console links |
| | `parallel_render_on_lambda.py` | splits the frames into pieces, writes the job file, starts the Lambdas, reads their progress |
| | `render_history.py` | saves and lists the render history |
| `optional_extras/ai_edit/` | `run_ai_edit.py` | runs the whole AI edit for a clip |
| | `ask_ai_director.py` + `prompts/` | asks the AI director for an edit plan |
| | `validate_edit_plan.py` | checks and cleans the plan the AI sends back |
| | `search_web_media.py` | finds images and videos for the plan |
| | `rank_media_with_vision_ai.py` | picks the best found media with a vision model |
| | `download_edit_media.py` | downloads and checks the chosen media |
| | `make_audio_carrier_video.py` | builds the black video that carries the cut audio |
| | `deploy_edit_site_to_s3.py` | uploads the built edit render site to S3 |
| `optional_extras/modal_gpu/` | `crop_on_modal_gpu.py` | the speaker crop as a Modal GPU function |
| `optional_extras/demo_mode/` | `replay_saved_demo.py` | saves and replays a finished run for demos |

## Endpoints

| Method | Path | Answer |
| --- | --- | --- |
| GET | `/video/<video_id>` | video details, and starts reading the transcript |
| POST | `/jobs` | body `{"video_id", "options"}`, returns `{"job_id"}` |
| GET | `/jobs/<job_id>` | steps, live log, clips |
| GET | `/thumbnails/<job_id>/<file>` | a clip's frame |
| POST | `/jobs/<job_id>/clips/<n>/prepare` | starts download + crop + upload for clip n |
| GET | `/history` | every saved reel from S3, with fresh links |

The caption editor's addresses (the same paths and JSON as Capiyo's server; the project id is `<job id>-<n>`):

| Method | Path | Answer |
| --- | --- | --- |
| GET | `/projects/<id>` | `{project, transcript or draft}`; starts preparing the clip. `?light=1`: only the project's status |
| PATCH | `/projects/<id>` | body `{draft, savedAt}`: saves the design to S3, returns `{savedAt}` |
| GET | `/projects/<id>/video` | the 9:16 clip for the editor's preview |
| POST | `/projects/<id>/transcribe` | tries preparing the clip again after it failed |
| POST | `/projects/<id>/language` | `{"want": "original"}`: the clip's words as cues |
| POST | `/projects/<id>/render-job` | body `{planned, quote}` from the Next.js render route: a quote, or starts the export |
| GET | `/projects/<id>/render` | the latest export; `?history=1` also the past exports |
| GET | `/render-site` | the render site's public folder, for the render route |
| GET / POST | `/styles` | My styles: the list / save a new one |
| PATCH / DELETE | `/styles/<id>` | rename or change / delete one |
| POST | `/ai/enhance` | 501: the AI emphasis pass is not part of wowclip |

## Run

Needs Python and ffmpeg on the PATH.

```
pip install -r requirements.txt
python server.py
```

Put your keys in `api_keys.json` (copy `api_keys.example.json`). That file is not committed. On another laptop, copy
the same `api_keys.json` and the render history is the same.
