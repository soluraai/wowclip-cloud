import { flowFont } from "./fonts";
import { flowEffect } from "./intent";
import { flowPaintPadding } from "./decorations";
import { measureFlowMetric } from "./metric";
import type { FlowInk, FlowLayout } from "./layout";
import type { FlowCue, FlowSettings, FlowToken } from "./types";

type Measured = Omit<FlowInk, "x" | "baseline" | "line">;
type Row = { words: Measured[]; origins: number[]; left: number; width: number; ascent: number; descent: number };

const measure = (ctx: CanvasRenderingContext2D, token: FlowToken, base: number, limit: number): Measured => {
  const font = flowFont(token.role, token.look);
  let size = base * (token.number ? 1.55 : font.scale);
  if (token.number) {
    const word = measureFlowMetric(ctx, token, size, limit, true);
    return { ...word, advance: word.width };
  }
  const sample = () => {
    ctx.font = `${font.style} ${font.weight} ${size}px ${font.family}`;
    ctx.letterSpacing = `${size * font.tracking}px`;
    ctx.textAlign = "left";
    return ctx.measureText(token.text);
  };
  let ink = sample();
  const fullWidth = Math.max(ink.width, ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight);
  if (fullWidth > limit) { size *= limit / fullWidth; ink = sample(); }
  return { token, size, tracking: size * font.tracking,
    width: Math.max(ink.width, ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight), advance: ink.width,
    left: -ink.actualBoundingBoxLeft, right: ink.actualBoundingBoxRight,
    ascent: Math.max(0, ink.actualBoundingBoxAscent), descent: Math.max(0, ink.actualBoundingBoxDescent) };
};

const measureRow = (words: Measured[], gap: number, cue: FlowCue, unit: number): Row => {
  let cursor = 0;
  const pads = words.map(word => {
    const effect = flowEffect(cue, word.token);
    return word.metric || effect === "none" || effect === "textColor"
      ? { x: 0, top: 0, bottom: 0 } : flowPaintPadding(effect);
  });
  const origins = words.map((word, i) => {
    if (i) cursor += gap;
    const x = cursor - Math.min(0, word.left) + pads[i].x * unit;
    cursor = x + Math.max(word.advance, word.right) + pads[i].x * unit;
    return x;
  });
  const left = Math.min(...words.map((word, i) => origins[i] + word.left - pads[i].x * unit));
  const right = Math.max(...words.map((word, i) => origins[i] + word.right + pads[i].x * unit));
  return { words, origins, left, width: right - left,
    ascent: Math.max(...words.map((word, i) => word.ascent + pads[i].top * unit)),
    descent: Math.max(...words.map((word, i) => word.descent + pads[i].bottom * unit)) };
};

/** Used only for captions with a number; normal text keeps the original layout. */
export const layoutInlineNumbers = (cue: FlowCue, ctx: CanvasRenderingContext2D,
  width: number, height: number, settings: FlowSettings): FlowLayout => {
  const unit = width / 720, limit = width * settings.maxWidth;
  const required = new Set(cue.tokens.flatMap((token, i) => i > 0 && token.breakBefore ? [i] : []));
  const numberIndex = cue.tokens.findIndex(token => token.number);
  let headingEnd = numberIndex + 1;
  const unitWord = /^(?:percent|percentage|million|billion|thousand|lakh|crore|km|kg|लाख|करोड़|प्रतिशत)[.!?,]?$/iu;
  while (headingEnd < cue.tokens.length && unitWord.test(cue.tokens[headingEnd].text)) headingEnd++;
  const numericHeading = required.size === 0 && numberIndex <= 2 &&
    cue.tokens.length - headingEnd >= 2 ? headingEnd : -1;
  for (let step = 0; step <= 24; step++) {
    const fit = 1 - step * .025, base = settings.fontSize * unit * fit, gap = base * .22;
    const measured = cue.tokens.map(token => measure(ctx, token, base, limit - 20 * unit));
    const candidates: Row[][] = [];
    const visit = (start: number, rows: Row[]) => {
      if (start === measured.length) { candidates.push(rows); return; }
      if (rows.length >= settings.maxLines) return;
      for (let end = start + 1; end <= measured.length; end++) {
        if (end > start + 1 && required.has(end - 1)) break;
        const row = measureRow(measured.slice(start, end), gap, cue, unit);
        if (row.width <= limit) visit(end, [...rows, row]);
      }
    };
    visit(0, []);
    if (!candidates.length) continue;
    const score = (rows: Row[]) => {
      let cursor = 0;
      const breaks = rows.slice(0, -1).map(row => { cursor += row.words.length; return cursor; });
      const average = rows.reduce((sum, row) => sum + row.width, 0) / rows.length;
      const imbalance = rows.reduce((sum, row) => sum + (row.width - average) ** 2, 0) * .18;
      const headingPenalty = numericHeading >= 0 && !breaks.includes(numericHeading) ? limit ** 2 * .7 : 0;
      const orphan = rows.length > 1 && rows[rows.length - 1].words.length === 1 ? limit ** 2 * .11 : 0;
      return imbalance + (rows.length - 1) * limit ** 2 * .09 + headingPenalty + orphan;
    };
    candidates.sort((a, b) => score(a) - score(b));
    const rows = candidates[0], rowGap = base * .24;
    const blockHeight = rows.reduce((sum, row) => sum + row.ascent + row.descent, 0) + (rows.length - 1) * rowGap;
    const room = 2 * Math.min(height * settings.positionY - height * .05,
      height * (1 - settings.positionY) - height * .05);
    if (blockHeight > room && step < 24) continue;
    let top = -blockHeight / 2;
    const words = rows.flatMap((row, line) => {
      const baseline = top + row.ascent;
      top += row.ascent + row.descent + rowGap;
      return row.words.map((word, i) => ({ ...word, line, baseline,
        x: width / 2 - row.width / 2 + row.origins[i] - row.left }));
    });
    return { words, width: Math.max(...rows.map(row => row.width)), height: blockHeight,
      lines: rows.length, gap, fit, kind: "prose", inlineNumbers: true };
  }
  throw new Error(`Cannot fit numeric caption ${cue.id}; reduce the number of words per page.`);
};
