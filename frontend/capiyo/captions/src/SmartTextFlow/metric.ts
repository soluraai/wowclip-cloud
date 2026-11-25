import { flowNumberParts } from "./numbers";
import { flowFont } from "./fonts";
import type { FlowToken } from "./types";

export type FlowMetric = {
  prefixWidth: number; valueWidth: number; suffixWidth: number; affixSize: number; affixGap: number;
  prefixY: number; suffixRows: { text: string; y: number }[];
  suffixSize: number; top: number; bottom: number;
  kind: "currency" | "percentage" | "compact" | "count";
};
export type FlowMetricRun = { text: string; x: number; y: number; size: number; center: boolean; accent: boolean; weight: number };
export const flowMetricRuns = (token: FlowToken, metric: FlowMetric, x: number, y: number, size: number, count = 1): FlowMetricRun[] => {
  const parts = flowNumberParts(token.number!, count, count >= 1 ? token.text : undefined);
  const runs: FlowMetricRun[] = [];
  if (parts.prefix) runs.push({ text: parts.prefix, x, y: y + metric.prefixY, size: metric.affixSize, center: false, accent: true, weight: 600 });
  const start = x + metric.prefixWidth + (parts.prefix ? metric.affixGap : 0);
  runs.push({ text: parts.value, x: start + metric.valueWidth / 2, y, size, center: true, accent: false, weight: 800 });
  const suffixX = start + metric.valueWidth + metric.affixGap;
  for (const row of metric.suffixRows) runs.push({ text: row.text, x: suffixX, y: y + row.y, size: metric.suffixSize, center: false, accent: true, weight: 600 });
  return runs;
};

export const measureFlowMetric = (ctx: CanvasRenderingContext2D, token: FlowToken, requested: number, limit: number, inline = false) => {
  const font = flowFont("number");
  const sample = (text: string, size: number, weight = 800) => {
    ctx.font = `${weight} ${size}px ${font.family}`; ctx.letterSpacing = `${size * -0.025}px`; ctx.textAlign = "left";
    return ctx.measureText(text);
  };
  const parts = flowNumberParts(token.number!, 1, token.text);
  const digits = token.number!.devanagari ? [..."०१२३४५६७८९"] : [..."0123456789"];
  const values = [parts.value, ...digits.map((digit) => parts.value.replace(/[0-9०-९]/g, digit))];
  const mainInk = values.map((value) => sample(value, requested));
  const valueWidth = Math.max(...mainInk.map((ink) => Math.max(ink.width, 2 * (ink.actualBoundingBoxRight - ink.width / 2),
    2 * (ink.width / 2 + ink.actualBoundingBoxLeft)))) * 1.035;
  const ascent = Math.max(...mainInk.map((ink) => ink.actualBoundingBoxAscent));
  const descent = Math.max(...mainInk.map((ink) => ink.actualBoundingBoxDescent));
  const affixSize = requested * (inline ? 0.72 : 0.32), affixGap = requested * (inline ? 0.025 : 0.055);
  const prefixInk = sample(parts.prefix, affixSize, 600);
  const prefixWidth = parts.prefix ? Math.max(prefixInk.width, prefixInk.actualBoundingBoxRight) : 0;
  const suffixSize = requested * (inline ? 0.55 : parts.suffix.trim().length > 3 ? 0.27 : 0.38);
  const suffixWords = parts.suffix.trim().split(/\s+/u).filter(Boolean);
  const suffixLines = inline ? (parts.suffix ? [parts.suffix] : []) : suffixWords.length > 1 ? [suffixWords.slice(0, -1).join(" "), suffixWords[suffixWords.length - 1]] : suffixWords;
  const suffixInk = suffixLines.map((text) => sample(text, suffixSize, 600));
  const suffixWidth = Math.max(0, ...suffixInk.map((ink) => Math.max(ink.width, ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight)));
  const suffixHeight = suffixInk.reduce((sum, ink) => sum + ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent, 0) + Math.max(0, suffixInk.length - 1) * requested * 0.045;
  let top = -ascent + (ascent + descent - suffixHeight) / 2;
  const suffixRows = suffixLines.map((text, index) => {
    const ink = suffixInk[index], y = inline ? 0 : top + ink.actualBoundingBoxAscent;
    top = y + ink.actualBoundingBoxDescent + requested * 0.045;
    return { text, y };
  });
  const prefixY = inline ? 0 : -ascent + prefixInk.actualBoundingBoxAscent + requested * 0.025;
  const width = prefixWidth + (parts.prefix ? affixGap : 0) + valueWidth + (parts.suffix ? affixGap + suffixWidth : 0);
  const fit = Math.min(1, limit / Math.max(1, width));
  const kind: FlowMetric["kind"] = /%/.test(parts.suffix) ? "percentage" : parts.prefix ? "currency" : token.number!.divisor > 1 || /^[kmb]$/i.test(parts.suffix) ? "compact" : "count";
  const metric: FlowMetric = { prefixWidth: prefixWidth * fit, valueWidth: valueWidth * fit, suffixWidth: suffixWidth * fit,
    affixSize: affixSize * fit, affixGap: affixGap * fit, prefixY: prefixY * fit,
    suffixRows: suffixRows.map((row) => ({ ...row, y: row.y * fit })), suffixSize: suffixSize * fit,
    top: -ascent * fit, bottom: descent * fit, kind };
  const paintedAscent = inline ? Math.max(ascent, prefixInk.actualBoundingBoxAscent, ...suffixInk.map(ink => ink.actualBoundingBoxAscent)) : ascent;
  const paintedDescent = inline ? Math.max(0, descent, prefixInk.actualBoundingBoxDescent, ...suffixInk.map(ink => ink.actualBoundingBoxDescent)) : descent;
  return { token, size: requested * fit, tracking: requested * fit * -0.025, width: width * fit,
    left: 0, right: width * fit, ascent: paintedAscent * fit, descent: paintedDescent * fit, metric };
};
