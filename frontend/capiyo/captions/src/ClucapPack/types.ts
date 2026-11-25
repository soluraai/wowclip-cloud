import type { Word } from "../LaunchCaptionPack/types";

export type ClucapStyleId = "redline-word-box" | "purple-voice-blink" | "scribble" | "golden-aura" | "filler" | "sunday-script";
export type ClucapWord = { word: Word; text: string; x: number; baseline: number; width: number;
  size: number; ascent: number; descent: number; family: string; weight: number; italic?: boolean; line: number; tracking: number; inkOffset: number;
  role?: "script" | "title"; letters?: { text: string; x: number }[]; emphasized?: boolean };
export type ClucapLayout = { id: string; words: Word[]; startMs: number; endMs: number;
  accentWordId?: string; items: ClucapWord[]; box: { x: number; y: number; width: number; height: number } };
export type ClucapScene = { uid: string; styleId: ClucapStyleId; now: number; reducedMotion: boolean; cue: ClucapLayout;
  settled?: boolean; continuousEntry?: boolean; continuousExit?: boolean; spokenMs?: Record<string, number>;
  /** The text color picked in the editor, for a style that paints its own words. */
  paint?: import("../BasicCaption/cueMotion").RolePaint };
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const out = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
export const wordProgress = (word: Word, now: number, reduced = false, duration = 180) => reduced ? Number(now >= word.startMs) :
  out((now - word.startMs) / Math.max(1, Math.min(duration, word.endMs - word.startMs)));
