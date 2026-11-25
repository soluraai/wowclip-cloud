import type { Word } from "../LaunchCaptionPack/types";
import type { ClucapLayout } from "./types";

export const SCRIBBLE_COLOR = "#ff4655";
export const scribbleArrival = (word: Word) => Math.max(1, Math.min(170, (word.endMs - word.startMs) * .7));
type MarkCue = Pick<ClucapLayout, "id" | "words" | "endMs" | "accentWordId">;
export const scribbleMark = (cue: MarkCue) => {
  const word = cue.words.find(entry => entry.id === cue.accentWordId);
  if (!word) return { kind: "none" as const, at: cue.endMs, duration: 1 };
  const at = word.startMs + scribbleArrival(word) + 35;
  const available = cue.endMs - at - 85;
  if (available < 100) return { kind: "none" as const, at, duration: 1 };
  let hash = 0;
  for (const character of cue.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { kind: hash % 4 === 0 && available >= 220 ? "circle" as const : "highlight" as const,
    at, duration: Math.min(320, available) };
};

export const scribblePadding = (width: number, ascent: number, descent: number, size: number, circle: boolean) => {
  const x = Math.max(9, size * .17);
  const halfHeight = (ascent + descent) / 2;
  const power = 2.75;
  // Leave room for the pen's small overshoot around the visible letter shapes.
  const cornerRadiusY = halfHeight / Math.pow(Math.max(.001, 1 - Math.pow((width / 2) / (width / 2 + x), power)), 1 / power);
  const y = circle ? Math.max(size * .12, cornerRadiusY - halfHeight + 3) : Math.max(6, size * .095);
  return { x, y };
};

/** Slightly asymmetric open pen loops; the second pass retraces only part of the word. */
export const scribbleOval = (x: number, y: number, width: number, height: number, seed = "", pass = 0) => {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const phase = (hash % 997) / 997 * Math.PI * 2;
  const cx = x + width / 2 + pass * Math.sin(phase) * 1.2;
  const cy = y + height / 2 + pass * Math.cos(phase) * .9;
  const power = 2.75; const tilt = Math.sin(phase) * .014;
  const start = -Math.PI * .17 + (hash % 7 - 3) * .055 + pass * .52;
  const span = Math.PI * 2 * (pass === 0 ? 1.055 : .76);
  const points = Array.from({ length: 43 }, (_, i) => {
    const angle = start + i * span / 42;
    const cosine = Math.cos(angle); const sine = Math.sin(angle);
    const penX = width / 2 * Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / power) *
      (1 + .012 * Math.sin(angle * 2 + phase) + .008 * Math.sin(angle * 5 - phase));
    const penY = height / 2 * Math.sign(sine) * Math.pow(Math.abs(sine), 2 / power) *
      (1 + .025 * Math.sin(angle * 3 + phase) + .018 * Math.sin(angle * 5 - phase));
    return { x: cx + penX * Math.cos(tilt) - penY * Math.sin(tilt) + Math.sin(angle * .8 + phase) * .5,
      y: cy + penX * Math.sin(tilt) + penY * Math.cos(tilt) + Math.cos(angle * .7 + phase) * .6 };
  });
  const coordinate = (value: number) => Number(value.toFixed(2));
  let path = `M ${coordinate(points[0].x)} ${coordinate(points[0].y)}`;
  points.slice(0, -1).forEach((point, i) => {
    const before = points[Math.max(0, i - 1)];
    const next = points[i + 1]; const after = points[Math.min(points.length - 1, i + 2)];
    path += ` C ${coordinate(point.x + (next.x - before.x) / 6)} ${coordinate(point.y + (next.y - before.y) / 6)}` +
      ` ${coordinate(next.x - (after.x - point.x) / 6)} ${coordinate(next.y - (after.y - point.y) / 6)}` +
      ` ${coordinate(next.x)} ${coordinate(next.y)}`;
  });
  return path;
};
