import type { FontSpec } from "./config";
import { fontFamily } from "./fonts";
import { compactInk } from "../Script/scripts";

export type Ink = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  advance: number;
  cap: number;
  step: number;
  /** Actual top/bottom ink contour, in baseline coordinates, including kerning. */
  skyline: { top: number; bottom: number }[];
};

const REFERENCE_SIZE = 256;
const cache = new Map<string, Ink>();

const setFont = (ctx: CanvasRenderingContext2D, font: FontSpec, tracking: number) => {
  ctx.font = `${font.style ?? "normal"} ${font.weight} ${REFERENCE_SIZE}px ${JSON.stringify(fontFamily(font))}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.fontKerning = "normal";
  // CSS and Canvas receive the same pixel spacing, not different em interpretations.
  ctx.letterSpacing = `${tracking * REFERENCE_SIZE}px`;
};

const scaled = (ink: Ink, factor: number): Ink => ({
  left: ink.left * factor, right: ink.right * factor,
  top: ink.top * factor, bottom: ink.bottom * factor,
  width: ink.width * factor, height: ink.height * factor,
  advance: ink.advance * factor,
  cap: ink.cap * factor, step: ink.step * factor,
  skyline: ink.skyline.map((column) => ({ top: column.top * factor, bottom: column.bottom * factor })),
});

export const scaleInk = scaled;

/** Measure shaped words as a whole; letter lists fail on ligatures and joined scripts. */
export const measureInk = (text: string, font: FontSpec, size: number, tracking: number, withContour = false): Ink => {
  const key = JSON.stringify([font, tracking, text, withContour]);
  const cached = cache.get(key);
  if (cached) return scaled(cached, size / REFERENCE_SIZE);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Style One needs a Canvas 2D context to measure its font.");
  setFont(ctx, font, tracking);
  const metrics = ctx.measureText(text);
  const cap = ctx.measureText("H").actualBoundingBoxAscent || REFERENCE_SIZE * 0.7;
  const pad = 4;
  const left = -metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight;
  // Joined scripts: thin vowel signs hang into the line gap (Script/scripts compactInk); the contour keeps the full ink.
  const compact = compactInk(ctx, text, metrics.actualBoundingBoxAscent, metrics.actualBoundingBoxDescent);
  const full = { top: -metrics.actualBoundingBoxAscent, bottom: metrics.actualBoundingBoxDescent };
  const top = -compact.ascent;
  const bottom = compact.descent;
  const skyline: Ink["skyline"] = [];
  // Pocket fitting requests contours for both main and helper words.
  const contourWidth = Math.max(1, Math.ceil(right - left) + pad * 2);
  if (withContour && contourWidth <= 16384) {
    canvas.width = contourWidth;
    canvas.height = Math.max(1, Math.ceil(full.bottom - full.top) + pad * 2);
    setFont(ctx, font, tracking);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, pad - left, pad - full.top);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let x = pad; x < canvas.width - pad; x++) {
      let first = Infinity;
      let last = -Infinity;
      for (let y = pad; y < canvas.height - pad; y++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 12) {
          first = Math.min(first, y - pad + full.top);
          last = y - pad + full.top + 1;
        }
      }
      skyline.push({ top: first, bottom: last });
    }
  }
  const ink: Ink = {
    left, right, top, bottom, width: Math.max(1, right - left),
    height: Math.max(1, bottom - top), advance: metrics.width, cap, step: 1, skyline,
  };
  // Bounded cache, independent of frames and canvas resolution.
  if (cache.size >= 512) cache.delete(cache.keys().next().value as string);
  cache.set(key, ink);
  return scaled(ink, size / REFERENCE_SIZE);
};
