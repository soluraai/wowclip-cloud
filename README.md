# wowclip (cloud computing project)

Paste a YouTube link, get the best short clips, and turn any of them into a captioned 9:16 reel rendered on AWS Lambda.

```
WowClip-Cloud/
├── frontend/   Next.js app (the UI), port 3000
└── backend/    Python + Flask server, port 5000
```

Backend details are in `backend/README.md`.

## Install on a new laptop (nothing to log in to)

All keys (AWS, OpenRouter, YouTube, ClipsCutter, Deepgram, ElevenLabs, Scrappa, proxy, Modal) are already in
`backend/api_keys.json`, so there is no `aws configure` and no `modal token new`. Keep this repo **private**.

Install these four by hand first:

| Program | Version used | Check with |
| --- | --- | --- |
| Python | 3.13 | `python --version` |
| Node.js (with npm) | 24 | `node --version` |
| ffmpeg (on the PATH) | 8.0 | `ffmpeg -version` |
| Git | 2.5x | `git --version` |

Then, in two terminals:

```
git clone <this repo's URL>
cd WowClip-Cloud

# terminal 1: backend
cd backend
pip install -r requirements.txt
python server.py

# terminal 2: frontend
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Demo video (works the same every time)

Paste this link: https://www.youtube.com/watch?v=TjPPIf-M6KE

Its clips, thumbnails, loading steps, word timings and AI edit are saved in `backend/output/` and replayed, so the
loading screens look the same on every laptop and no AI call is needed for it.

## Libraries and versions

Python (`backend/requirements.txt`, tested on Python 3.13):

| Library | Version | Used for |
| --- | --- | --- |
| flask | 3.1.3 | the HTTP server |
| requests | 2.32.5 | calling the APIs |
| yt-dlp | 2026.8.4.234419 | reading the YouTube page and captions |
| boto3 | 1.44.9 | AWS S3 and Lambda |
| modal | 1.5.4 | speaker crop on a Modal GPU (falls back to this computer) |
| mediapipe | 0.10.35 | face detection for the 9:16 crop |
| numpy | 2.3.5 | frame maths for the crop |
| pillow | 12.1.1 | thumbnails and image checks |

Frontend (`frontend/package.json` and `package-lock.json`, tested on Node 24):

| Library | Version |
| --- | --- |
| next | 16.3.5 |
| react, react-dom | 19.2.8 |
| remotion, @remotion/player | 4.0.535 |
| @remotion/google-fonts, @remotion/bundler | ^4.0.535 |
| react-colorful | ^5.8.1 |
| fontkit | ^2.0.4 |
| typescript | ^5 |

Cloud services: YouTube Data API, OpenRouter, ClipsCutter API, AWS S3 + Lambda (Sydney), Modal (GPU), Deepgram,
ElevenLabs, Scrappa.
