import { clamp } from "../CaptionEngine/types";

export const smooth = (value: number) => {
  const p = clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};
export const out = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;
export const mix = (a: number, b: number, progress: number) => a + (b - a) * progress;
const random = (seed: number) => {
  const value = Math.sin(seed * 78.233 + 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

/** Unequal relay outages and double strikes, separated by steady illumination. */
export const neonCurrent = (elapsed: number, seed: number, intensity: number) => {
  if (elapsed < 0) return 0;
  const outage = (start: number, duration: number) =>
    smooth((elapsed - start) / 5) * (1 - smooth((elapsed - start - duration) / 7));
  let dip = Math.max(outage(38, 32), outage(116, 53), outage(238, 22));
  const cell = Math.floor(elapsed / 1250);
  for (let index = Math.max(0, cell - 1); index <= cell + 1; index++) {
    const start = index * 1250 + 480 + random(seed + index * 43 + 6) * 480;
    const duration = 27 + random(seed + index * 11 + 3) * 48;
    dip = Math.max(dip, outage(start, duration));
    if (random(seed + index * 17) < 0.55) dip = Math.max(dip, outage(start + duration + 42, 19 + random(seed + index * 71) * 30));
  }
  return clamp(1 - dip * 0.99 * intensity, 0.01, 1);
};

export const countProgress = (now: number, startMs: number, endMs: number) => {
  const available = Math.max(1, endMs - startMs);
  const duration = Math.min(900, available * 0.67);
  return out((now - startMs) / duration);
};

export const wordReveal = (now: number, startMs: number, endMs: number, duration = 190) =>
  now < startMs ? 0 : smooth((now - startMs) / Math.max(200, duration));

/** A single spoken-word punch, then a stable hold; safe to seek in either direction. */
export const emphasisScale = (elapsed: number, amount = 0.07) =>
  elapsed < 0 ? 1 : 1 + Math.sin(Math.PI * clamp(elapsed / 360, 0, 1)) * amount;

/** Horizontal slide entrance for headline keyword; replaces vertical perspective pop. */
export const heroSlideOffset = (
  intro: number,
  distance: number,
  direction: "left" | "right" | "from-left" | "from-right" | "to-left" | "to-right" | string = "left",
) => {
  const sign = direction === "right" || direction === "from-right" || direction === "to-left" ? 1 : -1;
  const offset = (1 - clamp(intro, 0, 1)) * distance * sign;
  return offset === 0 ? 0 : offset;
};
