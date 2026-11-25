import { familyFor } from "./fonts";
import { chooseAccent, wordReveal } from "./engine";
import type { CoralConfig, StoryCue, StoryItem, StoryLayout } from "./types";

export const layoutCoralStory = (cues: StoryCue[], config: CoralConfig, width: number, height: number,
  ctx: CanvasRenderingContext2D): StoryLayout[] => {
  const unit = Math.min(width / 1920, height / 1080);
  const portrait = height / width > 1.3;
  const railWidth = Math.min(width * (portrait ? Math.min(.84, config.maxWidth + .1) : config.maxWidth), width - 90 * unit);
  const safeTop = height * .1; const safeBottom = height * .92;
  const output: StoryLayout[] = [];
  const measure = (cue: StoryCue, size: number) => {
    const stamp = cue.variant === "stamp";
    const horizontalPadding = size * .4;
    const verticalPadding = size * .11;
    const capacity = railWidth - horizontalPadding * 2 - size * .12;
    const gap = size * .245;
    const metrics = cue.words.map(word => {
      const family = familyFor(word.text, !stamp && cue.beat?.kind === "underline" && cue.beat.wordId === word.id);
      ctx.font = `${config.fontWeight} ${size}px "${family}"`;
      ctx.letterSpacing = `${-size * .01}px`;
      const m = ctx.measureText(word.text);
      const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
      const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
      return { word, text: word.text, family, size,
        width: Math.max(size * .02, left + right), inkOffsetX: left,
        ascent: Math.max(m.actualBoundingBoxAscent, size * .01), descent: Math.max(m.actualBoundingBoxDescent, 0) };
    });
    const lines: typeof metrics[] = [[]]; let used = 0;
    for (const item of metrics) {
      if (used && used + gap + item.width > capacity) { lines.push([]); used = 0; }
      lines[lines.length - 1].push(item); used += item.width + (lines[lines.length - 1].length > 1 ? gap : 0);
    }
    const lineWidths = lines.map(line => line.reduce((n, w) => n + w.width, 0) + Math.max(0, line.length - 1) * gap);
    const lineMetrics = lines.map(line => ({ a: Math.max(...line.map(w => w.ascent)), d: Math.max(...line.map(w => w.descent)) }));
    const lineHeights = lineMetrics.map(m => Math.max(size * 1.15, m.a + m.d + size * .12));
    const boxWidth = Math.max(...lineWidths) + horizontalPadding * 2;
    const boxHeight = lineHeights.reduce((a, b) => a + b, 0) + verticalPadding * 2;
    const x = (width - boxWidth) / 2;
    const y = Math.max(safeTop + 24 * unit, Math.min(height * config.positionY - boxHeight / 2, safeBottom - boxHeight - 24 * unit));
    const items: StoryItem[] = [];
    let lineY = y + verticalPadding;
    lines.forEach((line, i) => {
      let wordX = x + (boxWidth - lineWidths[i]) / 2;
      const baseline = lineY + (lineHeights[i] - lineMetrics[i].a - lineMetrics[i].d) / 2 + lineMetrics[i].a;
      for (const item of line) { items.push({ ...item, x: wordX, baseline, line: i }); wordX += item.width + gap; }
      lineY += lineHeights[i];
    });
    return { items, box: { x, y, width: boxWidth, height: boxHeight }, paddingX: horizontalPadding,
      paddingY: verticalPadding, gap, lineHeights, fits: lines.length <= 2 &&
      boxWidth <= railWidth - size * .08 && boxHeight <= safeBottom - safeTop - 48 * unit };
  };

  const fit = (cue: StoryCue) => {
    const multiplier = cue.variant === "stamp" ? 1.25 : 1;
    let hi = config.fontSize * unit * multiplier;
    let lo = config.minFontSize * unit * multiplier;
    let result = measure(cue, hi);
    const diagnostics: string[] = [];
    if (!result.fits) {
      if (!measure(cue, lo).fits) {
        const legal = cue.words.map((w, i) => i > 0 && w.startMs > cue.words[i - 1].startMs ? i : -1)
          .filter(i => i > 0).sort((a, b) => Math.abs(a - cue.words.length / 2) - Math.abs(b - cue.words.length / 2))[0];
        if (legal !== undefined) {
          const split = (start: number, end: number, endMs: number): StoryCue => {
            const words = cue.words.slice(start, end);
            const beat = words.some(w => w.id === cue.beat?.wordId) ? cue.beat : undefined;
            return { ...cue, id: `${cue.id}-${words[0].id}`, words, startMs: words[0].startMs, endMs, beat,
              accentWordId: words.some(w => w.id === cue.accentWordId) ? cue.accentWordId : chooseAccent(words) };
          };
          fit(split(0, legal, cue.words[legal].startMs));
          fit(split(legal, cue.words.length, cue.endMs)); return;
        }
        // An indivisible timed token remains complete and gets a visible diagnostic.
        hi = lo; lo = Math.max(unit, .25);
        diagnostics.push(`Below-minimum fitting for unusually long token ${cue.words[0].id}.`);
      }
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (measure(cue, mid).fits) lo = mid; else hi = mid; }
      result = measure(cue, lo);
    }
    output.push({ ...cue, items: result.items, box: result.box, unit, diagnostics,
      paddingX: result.paddingX, paddingY: result.paddingY, gap: result.gap, lineHeights: result.lineHeights });
  };
  for (const cue of cues) fit(cue);
  return output;
};

/** Grow the plate with spoken words around the same center as the settled card. */
export const animateCoralLayout = (cue: StoryLayout, now: number, reduced = false): StoryLayout => {
  if (reduced || cue.variant === "stamp") return cue;
  const lineWidths = new Map<number, number>();
  let width = 0; let height = 0;
  for (const item of cue.items) {
    const progress = wordReveal(item.word, now).opacity;
    if (progress <= 0) continue;
    const previousWidth = lineWidths.get(item.line) ?? 0;
    const targetWidth = item.x - cue.box.x + item.width + cue.paddingX;
    const revealedWidth = previousWidth + Math.max(0, targetWidth - previousWidth) * progress;
    lineWidths.set(item.line, revealedWidth);
    width = Math.max(width, revealedWidth);
    const previousHeight = item.line === 0 ? 0 : cue.paddingY * 2 +
      cue.lineHeights.slice(0, item.line).reduce((sum, value) => sum + value, 0);
    const targetHeight = cue.paddingY * 2 +
      cue.lineHeights.slice(0, item.line + 1).reduce((sum, value) => sum + value, 0);
    height = Math.max(height, previousHeight + (targetHeight - previousHeight) * progress);
  }
  const visibleWidth = Math.min(width, cue.box.width);
  const visibleHeight = Math.min(height, cue.box.height);
  const dx = (cue.box.width - visibleWidth) / 2;
  const dy = (cue.box.height - visibleHeight) / 2;
  return { ...cue,
    items: cue.items.map(item => ({ ...item, x: item.x + dx, baseline: item.baseline + dy })),
    box: { x: cue.box.x + dx, y: cue.box.y + dy, width: visibleWidth, height: visibleHeight },
  };
};
