// The shapes the UI uses (api.ts converts the backend's answers into these).

import type { EditPlan } from "../../edit/types";

export type VideoInfo = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number;
};

export type Word = { text: string; start: number; end: number };

export type Clip = {
  id: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  viralityScore: number; // 0 to 100
  scores: { hook: number; emotion: number; shareability: number; clarity: number };
  category: string;
  hookLine: string; // the opening line that grabs attention, copied from the transcript
  summary: string; // what happens in the clip
  whyViral: string; // the AI's opinion on why it works
  strengths: string[];
  watchOut: string; // the one thing that could hold it back
  audience: string; // who will share it
  thumbnail: string;
  frameQuality: "hd" | "preview" | "none";
  words: Word[]; // every spoken word in the clip with its time, for the synced captions
};

// One stage of a long task, shown as a row with its state and time.
export type Step = { key: string; label: string; state: "waiting" | "running" | "done" | "failed"; seconds: number | null };

// One line of the live log: "at" is seconds since the task started.
export type LogLine = { at: number; text: string };

export type Job = {
  id: string;
  status: "working" | "done" | "failed";
  steps: Step[];
  log: LogLine[];
  clips: Clip[];
  notice?: string;
  error?: string;
  hdFrames: "waiting" | "working" | "done";
};

// One finished reel saved in S3 (wowclip/history/<id>.json), with fresh links to watch and download it.
export type HistoryRender = {
  id: string;
  createdAt: string;
  videoId: string;
  videoTitle: string;
  channel: string;
  clipTitle: string;
  startSeconds: number;
  endSeconds: number;
  styleName: string;
  duration: number;
  sizeMb: number | null;
  fileName: string;
  reelKey: string;
  lambdas: number;
  frames: number;
  renderSeconds: number;
  totalSeconds: number;
  watchUrl: string;
  downloadUrl: string;
  coverUrl: string;
  consoleUrl: string;
};

export type History = { bucket: string; region: string; folder: string; consoleUrl: string; renders: HistoryRender[] };

// One AWS Lambda of the render: it draws its own range of frames.
export type LambdaPiece = { start: number; count: number; frames: number; state: "queued" | "rendering" | "done" };

export type Render = {
  id: string;
  status: "rendering" | "done" | "failed";
  steps: Step[];
  log: LogLine[];
  lambdas: { count: number; framesTotal: number; framesDone: number; pieces: LambdaPiece[] } | null;
  result: { watchUrl: string; downloadUrl: string; sizeMb: number; duration: number; fileName: string } | null;
  error: string | null;
  seconds: number;
};

// What the AI director decided and how it went (backend/optional_extras/ai_edit/run_ai_edit.py).
export type AiEditInfo = {
  model: string;
  provider: string;
  seconds: number;
  family: string;
  thinking: number;
  cost: number;
  category: string;
  fallback?: boolean;
  read: string;
  cuts: { text: string; why: string; at: number }[];
  removed: number;
  asked: number;
  found: number;
  made_in: number;
};

export type AiEdit = {
  status: "waiting" | "working" | "ready" | "failed";
  steps: Step[];
  log: LogLine[];
  error: string | null;
  round: number;
  plan?: EditPlan;
  info?: AiEditInfo;
  frames?: number;
};
