import { clamp } from "../CaptionEngine/types";
import type { FlowCue, FlowToken } from "./types";
export const flowEase = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;
export const flowSmooth = (value: number) => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };

export const flowWordMotion = (now: number, token: FlowToken, cueEnd: number, fps: number) => {
  if (now < token.startMs) return { opacity: 0, presence: 0, y: 0, blur: 0, scale: 1 };
  const available = Math.min(token.endMs, cueEnd) - token.startMs;
  if (available <= 3000 / fps) return { opacity: 1, presence: 1, y: 0, blur: 0, scale: 1 };
  const elapsed = now - token.startMs;
  const progress = flowEase((elapsed + 1000 / fps) / Math.min(260, available * 0.9));
  return { opacity: flowEase((elapsed + 1000 / fps) / 80), presence: progress,
    y: 0, blur: (1 - progress) * 2.1, scale: 1 };
};
export const flowExit = (cue: FlowCue, now: number) => {
  const lastStart = Math.max(...cue.tokens.map((token) => token.startMs));
  const duration = Math.min(130, Math.max(1, (cue.endMs - lastStart) * 0.2));
  return flowSmooth((now - cue.endMs + duration) / duration);
};
export const flowCount = (token: FlowToken, cue: FlowCue, now: number) =>
  flowEase((now - token.startMs) / Math.max(1, Math.min(850, (cue.endMs - token.startMs) * 0.66)));
