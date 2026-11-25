import { fitEditorialHelper, type EditorialContour } from "../EditorialType/contours";
import { flowFont } from "./fonts";
import { flowEffect } from "./intent";
import { flowPaintPadding } from "./decorations";
import { flowMetricRuns } from "./metric";
import { formatFlowNumber } from "./numbers";
import type { FlowInk } from "./layout";
import type { FlowCue } from "./types";

type RowWord = Omit<FlowInk, "baseline" | "line">;
const cache = new Map<string, EditorialContour>();

export const flowRowContour = (words: RowWord[], cue: FlowCue, unit = 1): EditorialContour => {
  const key = JSON.stringify([unit, words.map((word) => [word.token, word.x, word.size, word.metric, flowEffect(cue, word.token)])]);
  const cached = cache.get(key);
  if (cached) return cached;
  const pad = Math.max(...words.map((word) => word.size * 0.12), 12);
  const left = Math.floor(Math.min(...words.map((word) => word.x + word.left)) - pad);
  const right = Math.ceil(Math.max(...words.map((word) => word.x + word.right)) + pad);
  const top = -Math.ceil(Math.max(...words.map((word) => word.ascent)) + pad);
  const bottom = Math.ceil(Math.max(...words.map((word) => word.descent)) + pad);
  const canvas = document.createElement("canvas"); canvas.width = right - left; canvas.height = bottom - top;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("SmartTextFlow needs canvas contour measurement.");
  ctx.fillStyle = "white";
  for (const word of words) {
    const font = flowFont(word.token.role, word.token.look);
    const draw = (text: string, x: number, y: number, size: number, center = false, weight = font.weight) => {
      ctx.font = `${font.style} ${weight} ${size}px ${font.family}`;
      ctx.letterSpacing = `${size * font.tracking}px`; ctx.textAlign = center ? "center" : "left";
      ctx.fillText(text, x - left, y - top);
    };
    if (word.metric && word.token.number) {
      const original = word.token.number;
      const length = Math.max(1, Math.floor(Math.abs(original.value / original.divisor)).toString().length);
      const values = [original.value, 0];
      for (let count = 1; count <= length; count++) for (let digit = 0; digit < 10; digit++) values.push(
        Number(`${String(digit).repeat(count)}.${String(digit).repeat(original.decimals) || "0"}`) * Math.sign(original.value || 1) * original.divisor);
      for (const value of values) for (const run of flowMetricRuns({ ...word.token, number: { ...original, value } }, word.metric, word.x, 0, word.size)) {
        draw(run.text, run.x, run.y, run.size, run.center, run.weight);
      }
      if (word.metric.kind === "percentage" && original.value >= 0 && original.value <= 100) ctx.fillRect(word.x - left, word.descent + 6 * unit - top, word.width, 5 * unit);
    } else {
      draw(word.token.text, word.token.number ? word.x + word.width / 2 : word.x, 0, word.size, !!word.token.number);
      if (word.token.number) for (const progress of [0, 0.1, 0.5, 0.9]) draw(formatFlowNumber(word.token.number, progress), word.x + word.width / 2, 0, word.size, true);
      const effect = flowEffect(cue, word.token);
      if (effect !== "none" && effect !== "textColor") {
        const pad = flowPaintPadding(effect);
        ctx.fillRect(word.x + word.left - left - pad.x * unit, -word.ascent - top - pad.top * unit,
          word.right - word.left + 2 * pad.x * unit, word.ascent + word.descent + (pad.top + pad.bottom) * unit);
      }
    }
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const columns: EditorialContour["columns"] = [];
  for (let x = 0; x < canvas.width; x++) {
    let first = Infinity, last = -Infinity;
    for (let y = 0; y < canvas.height; y++) if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
      first = Math.min(first, y + top); last = y + top + 1;
    }
    columns.push({ top: first, bottom: last });
  }
  const result = { left, right, top, bottom, columns, step: 1 };
  if (cache.size >= 128) cache.delete(cache.keys().next().value as string);
  cache.set(key, result); return result;
};

/** Shared outline clearance with EditorialType; keep the SmartTextFlow rails centered. */
export const packFlowHelper = (main: EditorialContour, words: RowWord[], cue: FlowCue, side: -1 | 1, gap: number, envelope: number, unit = 1) => {
  const helper = flowRowContour(words, cue, unit);
  return fitEditorialHelper(main, helper, helper.left, side, gap, envelope, true).baseline;
};
