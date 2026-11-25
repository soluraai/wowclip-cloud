// The ONLY place wowclip's own pages talk to the server (backend/server.py, reached through /api, see next.config.ts):
//   getVideoInfo -> GET  /api/video/:id                  video details (the server also starts reading the transcript)
//   startJob     -> POST /api/jobs                       starts finding clips, returns the job id
//   getJob       -> GET  /api/jobs/:id                   steps, live log and the clips
//   prepareClip  -> POST /api/jobs/:id/clips/:n/prepare  downloads + crops + uploads the clip ahead of time
//   startReelRender -> POST /api/projects/<job>-<n>/render  plans the render (Next.js) and starts the Lambdas
//   getRender    -> GET  /api/renders/:id                steps, Lambdas, live log and the finished file
//   getHistory   -> GET  /api/history                    every finished reel, read from S3
// The caption editor (frontend/capiyo) makes its own calls to /api/projects/<job>-<n>.
//
// The backend speaks snake_case (start_seconds); the UI uses camelCase (startSeconds). We convert here.

import { toBackendOptions, type ClipOptions } from "./options";
import type { AiEdit, Clip, History, Job, LambdaPiece, LogLine, Render, Step, VideoInfo } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = any;

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Server error ${response.status}`);
  return data;
}

function postJson(url: string, body: object) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  const data = await readJson(await fetch(`/api/video/${videoId}`));
  return {
    videoId: data.video_id,
    title: data.title,
    channel: data.channel,
    thumbnail: data.thumbnail,
    durationSeconds: data.duration_seconds,
  };
}

export async function startJob(videoId: string, options: ClipOptions): Promise<string> {
  const data = await readJson(await postJson("/api/jobs", { video_id: videoId, options: toBackendOptions(options) }));
  return data.job_id;
}

function toClip(clip: Data): Clip {
  return {
    id: clip.id,
    title: clip.title,
    startSeconds: clip.start_seconds,
    endSeconds: clip.end_seconds,
    viralityScore: clip.virality_score,
    scores: clip.scores,
    category: clip.category,
    hookLine: clip.hook_line,
    summary: clip.summary,
    whyViral: clip.why_viral,
    strengths: clip.strengths ?? [],
    watchOut: clip.watch_out,
    audience: clip.audience,
    thumbnail: clip.thumbnail,
    frameQuality: clip.frame_quality,
    words: clip.words ?? [],
  };
}

export async function getJob(id: string): Promise<Job> {
  const data = await readJson(await fetch(`/api/jobs/${id}`));
  return {
    id: data.id,
    status: data.status,
    steps: data.steps,
    log: data.log,
    clips: data.clips.map(toClip),
    notice: data.notice || undefined,
    error: data.error || undefined,
    hdFrames: data.hd_frames,
  };
}

// Starts cutting, cropping and uploading the clip in the background, so the editor opens sooner later.
export async function prepareClip(jobId: string, clipId: string): Promise<{ status: string }> {
  return readJson(await postJson(`/api/jobs/${jobId}/clips/${clipId}/prepare`, {}));
}

// The caption editor's project id for one clip: the job id and the clip number.
export function projectId(jobId: string, clipId: string) {
  return `${jobId}-${clipId}`;
}

// Sends the editor's render request; the answer is the id of the render to follow.
export async function startReelRender(jobId: string, clipId: string, request: object): Promise<string> {
  const data = await readJson(await postJson(`/api/projects/${projectId(jobId, clipId)}/render`, request));
  return data.render_id;
}

// The AI edit of a clip (backend/optional_extras/ai_edit): it starts on its own once the clip is ready, while the captions are picked.
//   GET   -> where it is (steps, live log) and, once ready, the edit plan with links to every picture and video
//   POST  -> make a new edit; PATCH {off, trims} -> switch single visuals, zooms or the cuts off and on
export async function getAiEdit(project: string): Promise<AiEdit> {
  return readJson(await fetch(`/api/projects/${project}/ai-edit`, { cache: "no-store" }));
}

export async function redoAiEdit(project: string): Promise<AiEdit> {
  return readJson(await postJson(`/api/projects/${project}/ai-edit`, {}));
}

export async function switchAiEdit(project: string, off: string[], trims: boolean): Promise<AiEdit> {
  return readJson(await fetch(`/api/projects/${project}/ai-edit`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ off, trims }),
  }));
}

export async function getRender(id: string): Promise<Render> {
  const data = await readJson(await fetch(`/api/renders/${id}`));
  const lambdas = data.lambdas;
  const result = data.result;
  return {
    id: data.id,
    status: data.status,
    steps: data.steps,
    log: data.log,
    lambdas: lambdas && {
      count: lambdas.count,
      framesTotal: lambdas.frames_total,
      framesDone: lambdas.frames_done,
      pieces: lambdas.pieces as LambdaPiece[],
    },
    result: result && {
      watchUrl: result.watch_url,
      downloadUrl: result.download_url,
      sizeMb: result.size_mb,
      duration: result.duration,
      fileName: result.file_name,
    },
    error: data.error,
    seconds: data.seconds,
  };
}

export async function getHistory(): Promise<History> {
  const data = await readJson(await fetch("/api/history"));
  return {
    bucket: data.bucket,
    region: data.region,
    folder: data.folder,
    consoleUrl: data.console_url,
    renders: data.renders.map((item: Data) => ({
      id: item.id,
      createdAt: item.created_at,
      videoId: item.video_id,
      videoTitle: item.video_title,
      channel: item.channel,
      clipTitle: item.clip_title,
      startSeconds: item.start_seconds,
      endSeconds: item.end_seconds,
      styleName: item.style_name,
      duration: item.duration,
      sizeMb: item.size_mb,
      fileName: item.file_name,
      reelKey: item.reel_key,
      lambdas: item.lambdas,
      frames: item.frames,
      renderSeconds: item.render_seconds,
      totalSeconds: item.total_seconds,
      watchUrl: item.watch_url,
      downloadUrl: item.download_url,
      coverUrl: item.cover_url,
      consoleUrl: item.console_url,
    })),
  };
}

// How far the server is with getting one clip ready for the caption editor:
// download, then the words (Deepgram) and the speaker crop (Modal GPU) side by side, then the upload to S3.
export type Preparation = { status: "transcribing" | "ready" | "failed"; steps: Step[]; log: LogLine[]; error: string | null };

export async function getPreparation(jobId: string, clipId: string): Promise<Preparation> {
  return readJson(await fetch(`/api/projects/${projectId(jobId, clipId)}/preparation`, { cache: "no-store" }));
}
