import { editorialFont } from "./fonts";
import { isComplexScript } from "../Script/scripts";
import { flowNumberParts } from "../SmartTextFlow/numbers";
import { editorialContour, nestEditorialRows } from "./contours";
import { scaleEditorialNumber, type EditorialNumberSlot } from "./numerals";
import type { GlyphSlice, KineticEntry } from "../CaptionMotion/kinetic";
import type { EditorialCue, EditorialSettings, EditorialToken } from "./types";

export type EditorialInk = {
  token: EditorialToken; x: number; baseline: number; size: number; tracking: number;
  advance: number; left: number; right: number; ascent: number; descent: number; row: number;
  weight?: number;
  number?: EditorialNumberSlot;
  entry?: KineticEntry; slices?: GlyphSlice[];
};
export type EditorialLayout = { words: EditorialInk[]; height: number; width: number; fit: number; gap: number; rows: number };
type Measured = Omit<EditorialInk, "x" | "baseline" | "row">;

const measure = (ctx: CanvasRenderingContext2D, token: EditorialToken, size: number, weight?: number, extra = 0): Measured => {
  const base = editorialFont(token.typeRole, token.look);
  const font = { ...base, tracking: base.tracking + extra };
  const sample = (text: string, s = size) => {
    ctx.font = `${font.style} ${weight ?? font.weight} ${s}px ${font.family}`;
    ctx.letterSpacing = `${s * font.tracking}px`;
    return ctx.measureText(text);
  };
  const ink = sample(token.text);
  if (token.number) {
    const parts = flowNumberParts(token.number, 1, token.text);
    const affixSize = size * 0.4, gap = size * 0.055;
    const prefix = sample(parts.prefix, affixSize), suffix = sample(parts.suffix, affixSize);
    const valueInk = sample(parts.value);
    const valueWidth = Math.max(valueInk.width,
      2 * (valueInk.actualBoundingBoxRight - valueInk.width / 2),
      2 * (valueInk.width / 2 + valueInk.actualBoundingBoxLeft)) + size * 0.025;
    const prefixWidth = parts.prefix ? Math.max(prefix.width, prefix.actualBoundingBoxLeft + prefix.actualBoundingBoxRight) + gap : 0;
    const suffixWidth = parts.suffix ? Math.max(suffix.width, suffix.actualBoundingBoxLeft + suffix.actualBoundingBoxRight) + gap : 0;
    const advance = prefixWidth + valueWidth + suffixWidth;
    return { token, size, weight, tracking: size * font.tracking, advance, left: 0, right: advance,
      ascent: Math.max(valueInk.actualBoundingBoxAscent, prefix.actualBoundingBoxAscent, suffix.actualBoundingBoxAscent),
      descent: Math.max(valueInk.actualBoundingBoxDescent, prefix.actualBoundingBoxDescent, suffix.actualBoundingBoxDescent, size * 0.025),
      number: { prefixWidth, valueWidth, suffixWidth, affixSize, gap } };
  }
  return { token, size, weight, tracking: size * font.tracking, advance: ink.width,
    left: -ink.actualBoundingBoxLeft, right: ink.actualBoundingBoxRight,
    ascent: Math.max(ink.actualBoundingBoxAscent, size * 0.25), descent: Math.max(ink.actualBoundingBoxDescent, 0) };
};
const rowMeasure = (words: Measured[], gap: number) => {
  let cursor = 0, left = Infinity, right = -Infinity;
  const origins = words.map((word, index) => {
    if (index) {
      const prev = words[index - 1];
      const heroGap = prev.token.typeRole === "serif" && word.token.typeRole === "serif";
      cursor += heroGap ? Math.max(gap, word.size * 0.24) : gap;
    }
    const origin = cursor;
    left = Math.min(left, origin + word.left); right = Math.max(right, origin + word.right);
    cursor += word.advance;
    return origin;
  });
  return { origins, left, right, width: right - left,
    ascent: Math.max(...words.map((word) => word.ascent)), descent: Math.max(...words.map((word) => word.descent)) };
};

const wrapHelpers = (words: Measured[], limit: number, gap: number): Measured[][] => {
  const rows: Measured[][] = [];
  let row: Measured[] = [];
  for (const word of words) {
    if (row.length && (word.token.breakBefore || rowMeasure([...row, word], gap).width > limit)) {
      rows.push(row); row = [];
    }
    row.push(word);
  }
  if (row.length) rows.push(row);
  return rows;
};

const finishLayout = (cue: EditorialCue, placed: EditorialInk[], width: number, height: number,
  settings: EditorialSettings, rowGap: number): EditorialLayout => {
  const left = Math.min(...placed.map(word => word.x + word.left));
  const right = Math.max(...placed.map(word => word.x + word.right));
  const top = Math.min(...placed.map(word => word.baseline - word.ascent));
  const bottom = Math.max(...placed.map(word => word.baseline + word.descent));
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  const originY = height * settings.positionY;
  const unit = width / 720;
  // Reserve a few final pixels for antialiasing, shadows and thin script strokes.
  const room = Math.max(1, 2 * Math.min(originY - height * 0.055, height * 0.945 - originY));
  const fit = Math.max(0.001, Math.min(1, (width * settings.maxWidth - 8 * unit) / Math.max(1, right - left),
    (room - 8 * unit) / Math.max(1, bottom - top)));
  const byId = new Map(placed.map(word => [word.token.id, word]));
  const rowIndices = new Map([...new Set(placed.map(word => word.row))].sort((a, b) => a - b).map((row, index) => [row, index]));
  const words = cue.tokens.map(token => {
    const word = byId.get(token.id)!;
    return { ...word, row: rowIndices.get(word.row)!, x: width / 2 + (word.x - centerX) * fit,
      baseline: (word.baseline - centerY) * fit, size: word.size * fit, tracking: word.tracking * fit,
      left: word.left * fit, right: word.right * fit, advance: word.advance * fit,
      ascent: word.ascent * fit, descent: word.descent * fit,
      number: word.number ? scaleEditorialNumber(word.number, fit) : undefined };
  });
  return { words, height: (bottom - top) * fit, width: (right - left) * fit,
    fit, gap: rowGap * fit, rows: rowIndices.size };
};

export const layoutEditorialType = (cue: EditorialCue, ctx: CanvasRenderingContext2D, width: number, height: number, settings: EditorialSettings, requested = settings.heroSize): EditorialLayout => {
  const unit = width / 720;
  // A bigger main word may pass the text box, up to the frame's safe edge.
  const limit = width * Math.max(settings.maxWidth, Math.min(.94, settings.maxWidth * (settings.mainPick ?? 1)));
  // Beside a hero the helpers are small enough to sit in its valleys.
  const bodySize = cue.kind === "hero" ? settings.helperSize : settings.fontSize;
  const tokenSize = (token: EditorialToken) => token.typeRole === "number" ? settings.numberSize :
    token.typeRole === "serif" ? settings.heroSize : token.typeRole === "strong" ?
      bodySize * (cue.kind === "hero" ? 1.2 : 1.7) : bodySize;
  const measured = cue.tokens.map((token) => measure(ctx, token, tokenSize(token) * unit, undefined, token.typeRole === "body" ? settings.tracking?.helper ?? 0 : settings.tracking?.main ?? 0));
  const gap = bodySize * unit * 0.19;
  const rowGap = Math.max(settings.rowGap * unit, 3 * unit);
  if (cue.kind === "comparison" || cue.kind === "metric") {
    // One intact, upright figure row, then the complete supporting sentence.
    // Currency and units have separate small slots without shrinking any digits.
    const row = measured.filter(word => word.token.number);
    const rowMetric = rowMeasure(row, gap * 2);
    const placed: EditorialInk[] = row.map((word, index) => ({ ...word,
      x: -rowMetric.width / 2 + rowMetric.origins[index] - rowMetric.left,
      baseline: 0, row: 0 }));
    let edge = rowMetric.descent;
    const support = wrapHelpers(measured.filter(word => !word.token.number), limit, gap);
    for (const [index, words] of support.entries()) {
      const metric = rowMeasure(words, gap);
      const baseline = edge + rowGap + metric.ascent;
      placed.push(...words.map((word, i) => ({ ...word,
        x: -metric.width / 2 + metric.origins[i] - metric.left, baseline, row: index + 1 })));
      edge = baseline + metric.descent;
    }
    return finishLayout(cue, placed, width, height, settings, rowGap);
  }
  if (cue.kind === "hero") {
    const mainWords = measured.filter(word => cue.heroIds.includes(word.token.id));
    const metric = rowMeasure(mainWords, gap);
    const main = mainWords.map((word, index) => ({ ...word,
      x: -metric.width / 2 + metric.origins[index] - metric.left, baseline: 0, row: 1 }));
    const first = measured.findIndex(word => cue.heroIds.includes(word.token.id));
    if (mainWords.some(word => isComplexScript(word.token.text))) {
      // Joined scripts hang their letters from one headline: the main word has no valleys to tuck helpers into,
      // so the words before it sit in rows above and the words after it in rows below, as on the card.
      const placed: EditorialInk[] = [...main];
      const above = wrapHelpers(measured.slice(0, first), limit, gap);
      let edge = -metric.ascent;
      above.reverse().forEach((words, index) => {
        const row = rowMeasure(words, gap), baseline = edge - rowGap - row.descent;
        placed.push(...words.map((word, i) => ({ ...word, x: -row.width / 2 + row.origins[i] - row.left, baseline, row: -index })));
        edge = baseline - row.ascent;
      });
      edge = metric.descent;
      wrapHelpers(measured.slice(first + mainWords.length), limit, gap).forEach((words, index) => {
        const row = rowMeasure(words, gap), baseline = edge + rowGap + row.ascent;
        placed.push(...words.map((word, i) => ({ ...word, x: -row.width / 2 + row.origins[i] - row.left, baseline, row: 2 + index })));
        edge = baseline + row.descent;
      });
      const layout = finishLayout(cue, placed, width, height, settings, rowGap);
      return layout.fit >= .995 || settings.heroSize !== requested ? layout : layoutEditorialType(cue, ctx, width, height,
        { ...settings, heroSize: settings.heroSize * layout.fit, helperSize: settings.helperSize * Math.min(1, layout.fit * (settings.mainPick ?? 1)) }, requested);
    }
    const fitted = nestEditorialRows(editorialContour(main), measured.slice(0, first),
      measured.slice(first + mainWords.length), bodySize * unit * .24, limit - 8 * unit);
    const layout = finishLayout(cue, [...main, ...fitted.map(({ word, x, baseline, row }) => ({ ...word, x, baseline, row }))],
      width, height, settings, rowGap);
    // Glyphs do not scale linearly, so a shrunken lockup is fitted again at its real size.
    return layout.fit >= .995 || settings.heroSize !== requested ? layout : layoutEditorialType(cue, ctx, width, height,
      { ...settings, heroSize: settings.heroSize * layout.fit, helperSize: settings.helperSize * Math.min(1, layout.fit * (settings.mainPick ?? 1)) }, requested);
  }
  // Exhaustive small-phrase partition: fixed final positions, never progressive re-centering.
  const candidates: Measured[][][] = [];
  const visit = (from: number, stack: Measured[][]) => {
    if (from === measured.length) { candidates.push(stack); return; }
    if (stack.length === 3) return;
    for (let end = from + 1; end <= measured.length; end++) {
      if (end > from + 1 && measured[end - 1].token.breakBefore) break;
      const row = measured.slice(from, end);
      if (rowMeasure(row, gap).width <= limit || end === from + 1) visit(end, [...stack, row]);
    }
  };
  visit(0, []);
  const score = (candidate: Measured[][]) => {
    const lengths = candidate.map((row) => rowMeasure(row, gap).width);
    const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
    return lengths.reduce((sum, length) => sum + (length - average) ** 2 + Math.max(0, length - limit) ** 2 * 20, 0) + (lengths.length - 1) * limit ** 2 * 0.06;
  };
  // A strong phrase holds a row of its own, so the line steps from light to heavy and back.
  const strong = measured.filter(word => word.token.typeRole === "strong").length;
  const held = candidates.filter(rows => rows.some(row => row.length === strong && row.every(word => word.token.typeRole === "strong")));
  const pool = strong && held.length ? held : candidates;
  pool.sort((a, b) => score(a) - score(b));
  const rows = pool[0] ?? [measured];
  const placed: EditorialInk[] = [];
  let top = 0;
  rows.forEach((row, index) => {
    const metric = rowMeasure(row, gap);
    const baseline = top + metric.ascent;
    placed.push(...row.map((word, i) => ({ ...word, x: -metric.width / 2 + metric.origins[i] - metric.left, baseline, row: index })));
    top += metric.ascent + metric.descent + rowGap;
  });
  return finishLayout(cue, placed, width, height, settings, rowGap);
};
