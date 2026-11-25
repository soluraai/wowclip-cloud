import { clamp } from "../../CaptionEngine/types";

export const out = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;
export const smooth = (value: number) => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };
export const revealAt = (now: number, start: number, end: number, reduced: boolean, settled: boolean) => {
  if (settled) return 1;
  if (now < start) return 0;
  if (reduced) return 1;
  // Follows the speech: a long word gets a long, easy entrance, a quick one stays short.
  return out((now - start + 12) / Math.min(420, Math.max(170, (end - start) * 1.1)));
};

/** The entire caption drifts only after the last word has finished revealing. */
export const captionDrift = (now: number, words: readonly { startMs: number; endMs: number }[], disabled: boolean) => {
  if (disabled || !words.length) return 0;
  const readyAt = Math.max(...words.map(word => word.startMs + Math.min(220, Math.max(100, (word.endMs - word.startMs) * .8)) - 12));
  const age = Math.max(0, now - readyAt);
  return Math.sin(age * Math.PI * 2 / 2400) * 3 * smooth(age / 450);
};
