import { clamp } from "../CaptionEngine/types";
import type { EditorialCue, EditorialSettings, EditorialToken } from "./types";

export const editorialEase = (p: number) => 1 - (1 - clamp(p, 0, 1)) ** 3;
const smooth = (p: number) => { const t = clamp(p, 0, 1); return t * t * (3 - 2 * t); };
export const editorialMotion = (token: EditorialToken, cue: EditorialCue, now: number, settings: EditorialSettings, fps: number) => {
  if (now < token.startMs || now >= cue.endMs) return { opacity: 0, y: 0, blur: 0, count: 0, scale: 1, exit: 1 };
  const available = cue.endMs - token.startMs;
  const entry = Math.min(settings.entryMs, Math.max(1000 / fps, available * 0.38));
  const p = editorialEase((now - token.startMs + 1000 / fps) / entry);
  const exitDuration = Math.min(settings.exitMs, available * 0.18);
  const exit = smooth((now - cue.endMs + exitDuration) / Math.max(1, exitDuration));
  // Closely fitted contours stay locked together during reveals and handoffs.
  return { opacity: p * (1 - exit), y: 0,
    blur: (1 - p) * (token.number ? 0.7 : 2) + exit * 0.8,
    count: 1, scale: 1, exit };
};
