import { flowFont } from "./fonts";
import { flowEffect, flowScene } from "./intent";
import { flowRowContour, packFlowHelper } from "./geometry";
import { measureFlowMetric, type FlowMetric } from "./metric";
import { layoutInlineNumbers } from "./inlineNumberLayout";
import type { FlowCue, FlowSettings, FlowToken } from "./types";

export type FlowInk = {
  token: FlowToken; x: number; baseline: number; width: number; advance: number;
  left: number; right: number; ascent: number; descent: number;
  size: number; tracking: number; line: number; metric?: FlowMetric;
};
export type FlowLayout = { words: FlowInk[]; width: number; height: number; lines: number; gap: number; fit: number;
  kind: "prose" | "statement" | "metric"; inlineNumbers?: boolean };
type Measured = Omit<FlowInk, "x" | "baseline" | "line">;

const measure = (ctx: CanvasRenderingContext2D, token: FlowToken, base: number, limit: number): Measured => {
  const font = flowFont(token.role, token.look);
  let size = base * font.scale;
  const sample = (text: string) => {
    ctx.font = `${font.style} ${font.weight} ${size}px ${font.family}`;
    ctx.letterSpacing = `${size * font.tracking}px`; ctx.textAlign = "left";
    return ctx.measureText(text);
  };
  let ink = sample(token.text);
  let ascent = ink.actualBoundingBoxAscent, descent = Math.max(0, ink.actualBoundingBoxDescent);
  let width = ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight;
  if (token.number) {
    const digits = token.number.devanagari ? [..."०१२३४५६७८९"] : [..."0123456789"];
    const candidates = [token.text, ...digits.map((digit) => token.text.replace(/[0-9०-९]/g, digit))].map(sample);
    width = Math.max(...candidates.map((ink) => ink.width)) * 1.08;
    ascent = Math.max(...candidates.map((ink) => ink.actualBoundingBoxAscent));
    descent = Math.max(...candidates.map((ink) => ink.actualBoundingBoxDescent), 0);
  }
  if (width > limit) { const fit = limit / width; size *= fit; ascent *= fit; descent *= fit; ink = sample(token.text); width = limit; }
  return { token, size, tracking: size * font.tracking, width, advance: token.number ? width : ink.width,
    left: token.number ? 0 : -ink.actualBoundingBoxLeft, right: token.number ? width : ink.actualBoundingBoxRight,
    ascent, descent };
};
const rowMetric = (row: Measured[], gap: number) => {
  let cursor = 0;
  const origins = row.map((word, index) => { if (index) cursor += gap; const x = cursor; cursor += word.advance; return x; });
  const left = Math.min(...row.map((word, i) => origins[i] + word.left));
  const right = Math.max(...row.map((word, i) => origins[i] + word.right));
  return { origins, left, width: right - left, ascent: Math.max(...row.map((word) => word.ascent)), descent: Math.max(...row.map((word) => word.descent)) };
};

export const layoutSmartFlow = (cue: FlowCue, ctx: CanvasRenderingContext2D, width: number, height: number, settings: FlowSettings): FlowLayout => {
  if (settings.numberLayout === "inline" && cue.tokens.some(token => token.number))
    return layoutInlineNumbers(cue, ctx, width, height, settings);
  const unit = width / 720, limit = width * settings.maxWidth;
  const scene = flowScene(cue);
  for (let step = 0; step <= 22; step++) {
    const fit = 1 - step * 0.025, base = settings.fontSize * unit * fit, gap = base * 0.23;
    let rows: Measured[][] = [];
    let mainIndex = -1;
    if (scene.kind !== "prose") {
      const start = cue.tokens.findIndex((token) => scene.heroIds.includes(token.id));
      const end = start + scene.heroIds.length;
      const before = cue.tokens.slice(0, start).map((token) => measure(ctx, token, base * 0.8, limit));
      const after = cue.tokens.slice(end).map((token) => measure(ctx, token, base * 0.8, limit));
      const main = scene.kind === "metric" ? [(() => {
        const metric = measureFlowMetric(ctx, cue.tokens[start], base * 3.8, limit);
        return { ...metric, advance: metric.width };
      })()] : cue.tokens.slice(start, end).map((token) => measure(ctx, token, base * 1.44, limit));
      rows = [before, main, after].filter((row) => row.length);
      mainIndex = before.length ? 1 : 0;
      if (rows.some((row) => rowMetric(row, gap).width > limit + 0.1)) continue;
    } else {
      const measured = cue.tokens.map((token) => measure(ctx, token, base, limit));
      const candidates: Measured[][][] = [];
      const visit = (start: number, stack: Measured[][]) => {
        if (start === measured.length) { candidates.push(stack); return; }
        if (stack.length >= settings.maxLines) return;
        for (let end = start + 1; end <= measured.length; end++) {
          if (end > start + 1 && measured[end - 1].token.breakBefore) break;
          const row = measured.slice(start, end);
          if (rowMetric(row, gap).width <= limit + 0.1) visit(end, [...stack, row]);
        }
      };
      visit(0, []); if (!candidates.length) continue;
      const score = (candidate: Measured[][]) => {
        const widths = candidate.map((row) => rowMetric(row, gap).width), average = widths.reduce((a, b) => a + b, 0) / widths.length;
        return widths.reduce((sum, w) => sum + (w - average) ** 2, 0) + (candidate.length - 1) * limit ** 2 * 0.05 +
          (candidate.length > 1 && candidate[candidate.length - 1].length === 1 ? limit ** 2 * 0.08 : 0);
      };
      candidates.sort((a, b) => score(a) - score(b)); rows = candidates[0];
    }
    const metrics = rows.map((row) => rowMetric(row, gap));
    const envelope = Math.max(...metrics.map((row) => row.width));
    const placed = rows.map((row, index) => ({ baseline: 0, words: row.map((word, i) => ({ ...word,
      x: width / 2 - metrics[index].width / 2 + metrics[index].origins[i] - metrics[index].left })) }));
    const rowGap = 6 * unit * fit;
    if (mainIndex >= 0) {
      const main = flowRowContour(placed[mainIndex].words, cue, unit);
      placed.forEach((row, index) => { if (index !== mainIndex) row.baseline = packFlowHelper(main, row.words, cue, index < mainIndex ? -1 : 1, rowGap, envelope, unit); });
    } else {
      let top = 0;
      placed.forEach((row, index) => {
        const paintPad = rows[index].some((word) => ["circle", "box", "bracket"].includes(flowEffect(cue, word.token))) ? 8 * unit : 4 * unit;
        row.baseline = top + metrics[index].ascent + paintPad;
        top = row.baseline + metrics[index].descent + paintPad + rowGap + 5 * unit;
      });
    }
    const paintedTop = Math.min(...placed.flatMap((row) => row.words.map((word) => row.baseline - word.ascent - 10 * unit)));
    const paintedBottom = Math.max(...placed.flatMap((row) => row.words.map((word) => row.baseline + word.descent + (word.metric?.kind === "percentage" ? 14 : 10) * unit)));
    const blockHeight = paintedBottom - paintedTop, centerY = (paintedTop + paintedBottom) / 2;
    const room = 2 * Math.min(height * settings.positionY - height * 0.04, height * (1 - settings.positionY) - height * 0.04);
    if (blockHeight > room && step < 22) continue;
    const words = placed.flatMap((row, line) => row.words.map((word) => ({ ...word, line, baseline: row.baseline - centerY })));
    return { words, width: envelope, height: blockHeight, lines: rows.length, gap, fit, kind: scene.kind };
  }
  throw new Error(`Cannot fit caption ${cue.id}; reduce chunk size or explicit line breaks.`);
};
