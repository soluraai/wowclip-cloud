import { serifGlowText } from "./engine";
import { serifGlowFont } from "./fonts";
import type { SerifGlowCue, SerifGlowSettings } from "./types";

export type SerifGlowLayout = {
  text: string;
  size: number;
  tracking: number;
  x: number;
  baseline: number;
  fit: number;
  /** Each word's own start and its offset from x, so plain phrases can enter word by word. */
  words: { text: string; dx: number; startMs: number }[];
};

const measure = (context: CanvasRenderingContext2D, text: string, size: number, tracking: number) => {
  context.font = `400 ${size}px "${serifGlowFont}"`;
  context.fontKerning = "normal";
  const metrics = context.measureText(text);
  const left = metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight + Math.max(0, Array.from(text).length - 1) * tracking;
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  return { left, right, ascent, descent, width: right + left };
};

/** One measured ink center for every phrase, irrespective of font ascent or descenders. */
export const layoutSerifGlow = (
  context: CanvasRenderingContext2D, cue: SerifGlowCue, width: number, settings: SerifGlowSettings, cap = 1,
): SerifGlowLayout => {
  const unit = width / 720;
  const highlight = cue.treatment === "glow";
  const text = serifGlowText(cue, settings.lowercase);
  const originalSize = (highlight ? settings.highlightSize : settings.normalSize) * unit;
  const originalTracking = (highlight ? settings.highlightTracking : settings.normalTracking) * unit;
  const original = measure(context, text, originalSize, originalTracking);
  // Fit the entire phrase once. Entry animation never changes letter spacing or word positions.
  const fit = Math.min(1, width * settings.maxWidth / Math.max(1, original.width));
  const size = originalSize * Math.min(cap, fit);
  const tracking = originalTracking * Math.min(cap, fit);
  const ink = measure(context, text, size, tracking);
  context.font = `400 ${size}px "${serifGlowFont}"`;
  const tokens = text.split(" ");
  const words = tokens.map((token, index) => {
    const before = index ? tokens.slice(0, index).join(" ") + " " : "";
    const dx = before ? context.measureText(before).width + Array.from(before).length * tracking : 0;
    return { text: token, dx, startMs: cue.words[index]?.startMs ?? cue.startMs };
  });
  return { text, size, tracking, fit, words,
    x: width / 2 - (ink.right - ink.left) / 2,
    baseline: (ink.ascent - ink.descent) / 2,
  };
};
