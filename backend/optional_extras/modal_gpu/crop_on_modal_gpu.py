import os

import modal

BACKEND_FOLDER = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REEL_FOLDER = os.path.join(BACKEND_FOLDER, "reel")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0", "libgles2", "libegl1")
    .pip_install("mediapipe==0.10.35", "numpy<2.4")
    .env({"NVIDIA_DRIVER_CAPABILITIES": "all"})
    .add_local_file(os.path.join(REEL_FOLDER, "crop_to_vertical_9x16.py"), "/root/speaker_crop.py")
    .add_local_file(os.path.join(REEL_FOLDER, "models", "face_landmarker.task"), "/root/models/face_landmarker.task")
)

app = modal.App("wowclip-speaker-crop", image=image)


@app.function(gpu="L4", cpu=8.0, memory=8192, timeout=600, scaledown_window=600)
def crop_clip(source_bytes):
    import speaker_crop

    lines = []
    with open("/tmp/source.mp4", "wb") as file:
        file.write(source_bytes)
    plan = speaker_crop.make_vertical_video("/tmp/source.mp4", "/tmp/vertical.mp4", lines.append, gpu=True)
    with open("/tmp/vertical.mp4", "rb") as file:
        video = file.read()
    return {"video": video, "duration": plan["duration"], "speakers": plan["speakers"], "log": lines}
