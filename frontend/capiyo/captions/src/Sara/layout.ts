import { saraFamily } from "./fonts";
import { topLineWord } from "../Script/mix";
import { selectSaraHooks } from "./engine";
import type { SaraConfig, SaraCue, SaraItem, SaraLayout } from "./types";
import { NO_SIZES, SAFE_WIDTH, sizeOf, type PartSizes } from "../Premium/sizes";
import type { PartFace } from "../Premium/parts";

export const layoutSara = (cues: SaraCue[], config: SaraConfig & { naturalWrap?: boolean; sizes?: PartSizes; picked?: { main?: PartFace; rest?: PartFace } }, width: number, height: number,
  ctx: CanvasRenderingContext2D): SaraLayout[] => {
  // Typography is defined on a 720px-wide canvas in both resting cards and
  // playback. Using the landscape card's height here shrank moving text.
  const unit = width / 720;
  const sizes = config.sizes ?? NO_SIZES;
  const capacity = width * Math.max(config.maxWidth, Math.min(SAFE_WIDTH, config.maxWidth * Math.max(sizes.main, sizes.helper)));
  const result: SaraLayout[] = [];
  const measure = (cue: SaraCue, size: number) => {
    const hooks = selectSaraHooks(cue.words);
    const strongest = hooks[0];
    const tracking = -size * .021;
    // Give the wide italic capitals and joined strokes enough room to read as separate words.
    const gap = size * .21;
    const metrics = cue.words.map(spoken => {
      const hook = hooks.includes(spoken.id);
      // Mix: big words read in English letters, the rest in the speaker's script.
      const word = hook ? topLineWord(spoken) : spoken;
      // Big words and the rest each take the font picked for them; Hindi keeps its own face.
      const pick = /[ऀ-ॿ]/u.test(word.text) ? undefined : hook ? config.picked?.main : config.picked?.rest;
      const family = pick?.family ?? saraFamily(word.text), weight = pick?.weight ?? 400, italic = pick?.italic === true;
      const wordSize = size * (word.id === strongest ? 1.5 : hook ? 1.28 : 0.92) * sizeOf(sizes, hook ? "main" : "helper", word.id);
      ctx.font = `${italic ? "italic " : ""}${weight} ${wordSize}px "${family}"`; ctx.letterSpacing = `${tracking}px`;
      const m = ctx.measureText(word.text);
      const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
      const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
      // Canvas and SVG italic ink overhangs differ slightly; reserve a generous side bearing.
      return { word, family, weight, italic, hook, size: wordSize, inkOffsetX: left, width: Math.max(wordSize * .07, left + right + wordSize * .045),
        ascent: Math.max(m.actualBoundingBoxAscent, wordSize * .01), descent: Math.max(0, m.actualBoundingBoxDescent) };
    });
    const lines: typeof metrics[] = [[]]; let used = 0;
    for (const item of metrics) {
      if (used && used + gap + item.width > capacity) { lines.push([]); used = 0; }
      const line = lines[lines.length - 1]; line.push(item); used += item.width + (line.length > 1 ? gap : 0);
    }
    const widths = lines.map(line => line.reduce((sum, item) => sum + item.width, 0) + (line.length - 1) * gap);
    const lineMetrics = lines.map(line => ({ a: Math.max(...line.map(w => w.ascent)), d: Math.max(...line.map(w => w.descent)) }));
    const heights = lineMetrics.map(m => Math.max(size, m.a + m.d + size * .16));
    const blockHeight = heights.reduce((a, b) => a + b, 0);
    const y = config.naturalWrap
      ? Math.max(0, (height - blockHeight) / 2)
      : Math.max(height * .1, Math.min(height * config.positionY - blockHeight / 2, height * .84 - blockHeight));
    const items: SaraItem[] = []; let top = y;
    lines.forEach((line, i) => {
      let x = (width - widths[i]) / 2;
      const baseline = top + (heights[i] - lineMetrics[i].a - lineMetrics[i].d) / 2 + lineMetrics[i].a;
      for (const item of line) { items.push({ ...item, x, baseline, line: i }); x += item.width + gap; }
      top += heights[i];
    });
    const blockWidth = Math.max(...widths) + size * .24;
    return { items, tracking, bounds: { x: (width - blockWidth) / 2, y, width: blockWidth, height: blockHeight },
      fits: lines.length <= 2 && blockWidth <= capacity && (config.naturalWrap || blockHeight <= height * .7) };
  };
  const fit = (cue: SaraCue) => {
    let hi = config.fontSize * unit; let lo = config.minFontSize * unit;
    let layout = measure(cue, hi); const diagnostics: string[] = [];
    if (!layout.fits) {
      if (!measure(cue, lo).fits) {
        const splitAt = cue.words.map((w, i) => i > 0 && w.startMs > cue.words[i - 1].startMs ? i : -1)
          .filter(i => i > 0).sort((a, b) => Math.abs(a - cue.words.length / 2) - Math.abs(b - cue.words.length / 2))[0];
        if (splitAt !== undefined) {
          fit({ ...cue, id: `${cue.id}-a`, words: cue.words.slice(0, splitAt), endMs: cue.words[splitAt].startMs });
          fit({ ...cue, id: `${cue.id}-b`, words: cue.words.slice(splitAt), startMs: cue.words[splitAt].startMs }); return;
        }
        hi = lo; lo = Math.max(.25, unit);
        diagnostics.push(`Below-minimum fitting for indivisible token ${cue.words[0].id}.`);
      }
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (measure(cue, mid).fits) lo = mid; else hi = mid; }
      hi = lo; layout = measure(cue, hi);
    }
    result.push({ ...cue, size: hi, tracking: layout.tracking, items: layout.items, bounds: layout.bounds, diagnostics });
  };
  cues.forEach(fit); return result;
};
