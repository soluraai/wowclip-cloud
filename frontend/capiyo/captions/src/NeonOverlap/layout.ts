import { NO_SPACING, type PartSpacing } from "../Premium/sizes";
import type { CaptionWord } from "../CaptionEngine/types";
import { clamp } from "../CaptionEngine/types";
import { neonFonts } from "./fonts";
import type { NeonCue, NeonSettings } from "./types";
import type { PartFace } from "../Premium/parts";
import type { PartSizes } from "../Premium/sizes";

export type NeonTextGroup = {
  words: { word: CaptionWord; x: number; y: number; width: number; size: number }[];
  size: number;
  family: string;
  weight: number;
  italic: boolean;
  width: number;
  height: number;
  ascent: number;
  left: number;
  top: number;
  align: "left" | "center" | "right";
  /** Extra space between letters, as a share of each word's size. */
  tracking?: number;
};
export type NeonLayout = {
  hero: { text: string; left: number; top: number; width: number; height: number;
    size: number; tracking: number; ascent: number; family: string; weight: number; italic: boolean };
  groups: NeonTextGroup[];
  plain: NeonTextGroup;
  /** How much of the full size this headline could take, for evening sizes across a video. */
  fit: number;
};

export const placeNeonCue = (cue: NeonCue, layout: NeonLayout, width: number, height: number, settings: NeonSettings) => {
  const boxes = cue.variant === "plain" ? [layout.plain] : [layout.hero, ...layout.groups];
  const pad = 28 * width / 720;
  const safe = Math.min(width, height) * 0.06;
  const top = Math.min(...boxes.map(box => box.top)) - pad;
  const bottom = Math.max(...boxes.map(box => box.top + box.height)) + pad;
  const scale = Math.min(1, (height - safe * 2) / (bottom - top));
  const left = width / 2 + (Math.min(...boxes.map(box => box.left)) - pad - width / 2) * scale;
  const right = width / 2 + (Math.max(...boxes.map(box => box.left + box.width)) + pad - width / 2) * scale;
  return {
    x: clamp(width * (settings.positionX - 0.5), safe - left, width - safe - right),
    y: clamp(height * settings.positionY, safe - top * scale, height - safe - bottom * scale),
    scale,
  };
};

/** Spacing picked in the editor, as a share of each word's size; set for the length of one layout pass. */
let extraTracking = 0;
const metrics = (context: CanvasRenderingContext2D, text: string, size: number, family: string, weight: number, italic = false, tracking = 0) => {
  context.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
  context.letterSpacing = `${tracking + size * extraTracking}px`;
  return context.measureText(text);
};

type Face = { family: string; weight: number; italic: boolean };
const quoted = (face: PartFace | undefined, fallback: Face, generic: string): Face => face
  ? { ...face, family: `"${face.family}", "NeonOverlapDevanagari", ${generic}` } : fallback;

const groupLayout = (
  words: CaptionWord[], context: CanvasRenderingContext2D, size: number, limit: number,
  { family, weight, italic }: Face, singleLine = false, own: Record<string, number> = {},
): NeonTextGroup => {
  const widths = words.map((word) => metrics(context, word.text, size * (own[word.id] ?? 1), family, weight, italic).width);
  const gap = size * (italic ? 0.27 : 0.32);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, words.length - 1);
  let split = words.length;
  if (!singleLine && total > limit && words.length > 1) {
    let cost = Infinity;
    for (let index = 1; index < words.length; index++) {
      const first = widths.slice(0, index).reduce((sum, width) => sum + width, 0) + gap * (index - 1);
      const second = widths.slice(index).reduce((sum, width) => sum + width, 0) + gap * (words.length - index - 1);
      const score = Math.max(first, second) + Math.abs(first - second) * 0.3;
      if (score < cost) { cost = score; split = index; }
    }
  }
  const rows = [words.slice(0, split), words.slice(split)].filter((row) => row.length);
  const rowWidths = rows.map((row, index) => widths.slice(index === 0 ? 0 : split, index === 0 ? split : undefined)
    .reduce((sum, width) => sum + width, 0) + gap * Math.max(0, row.length - 1));
  const fit = Math.min(1, limit / Math.max(1, ...rowWidths));
  const width = Math.max(0, ...rowWidths) * fit;
  // Helpers are positioned by visible glyph edges, not the font's empty line box.
  const ink = words.map(word => metrics(context, word.text, size * fit * (own[word.id] ?? 1), family, weight, italic));
  const ascent = Math.max(0, ...ink.map(item => item.actualBoundingBoxAscent));
  const descent = Math.max(0, ...ink.map(item => item.actualBoundingBoxDescent));
  const rowStep = Math.max(size * fit * 1.1, ascent + descent + size * fit * 0.12);
  let cursor = 0;
  return {
    words: rows.flatMap((row, rowIndex) => {
      let x = (width - rowWidths[rowIndex] * fit) / 2;
      return row.map((word) => {
        const wordWidth = widths[cursor++] * fit;
        const result = { word, x, y: rowIndex * rowStep, width: wordWidth, size: size * fit * (own[word.id] ?? 1) };
        x += wordWidth + gap * fit;
        return result;
      });
    }),
    family, weight, italic, size: size * fit, width, tracking: extraTracking,
    height: rows.length ? ascent + descent + (rows.length - 1) * rowStep : 0,
    ascent, left: 0, top: 0, align: "center",
  };
};

/** The hollow headline runs larger than the solid ones; even sizes are measured against it. */
const LARGEST = 184;

export const layoutNeonCue = (
  cue: NeonCue, context: CanvasRenderingContext2D, width: number, settings: NeonSettings,
  faces: { main?: PartFace; helper?: PartFace } = {}, sizeCap = 1, sizes?: PartSizes, spacing: PartSpacing = NO_SPACING,
): NeonLayout => {
  extraTracking = spacing.plain;
  const unit = width / 720;
  const display = quoted(faces.main, { family: neonFonts.display, weight: 900, italic: false }, "sans-serif");
  const helperFace = quoted(faces.helper, { family: neonFonts.serif, weight: 400, italic: true }, "serif");
  // Leave room for the entrance punch and neon halo inside the safe edges.
  const limit = Math.min(width * settings.maxWidth, width * 0.84) / 1.07;
  const heroWord = cue.words[cue.heroIndex];
  const text = cue.variant === "metric" ? heroWord.text.replace(/[.!?;:]$/, "") : heroWord.text.toLocaleUpperCase();
  const designed = cue.variant === "outline" ? LARGEST : 166;
  const helperScale = sizes?.helper ?? 1, wordScales = sizes?.words ?? {};
  const heroPick = (sizes?.main ?? 1) * (wordScales[heroWord.id] ?? 1);
  const nominal = designed * unit * settings.heroScale * heroPick;
  const tracking = -nominal * 0.037;
  extraTracking = spacing.main;
  const raw = metrics(context, text, nominal, display.family, display.weight, display.italic, tracking);
  // A box based on the final value alone clips counts such as 111,111 -> 85,555.
  // Measure the widest digit in this actual font and reserve every numeric position.
  const digitSet = cue.number?.devanagari ? [..."०१२३४५६७८९"] : [..."0123456789"];
  const widestDigit = digitSet.map((digit) => ({ digit, width: metrics(context, digit, nominal, display.family, display.weight).width }))
    .sort((a, b) => b.width - a.width)[0].digit;
  const counterSample = text.replace(/[0-9०-९]/g, widestDigit);
  const widestWidth = cue.variant === "metric" ? metrics(context, counterSample, nominal, display.family, display.weight, display.italic, tracking).width : raw.width;
  const rawWidth = Math.max(raw.width, widestWidth) * (cue.variant === "metric" ? 1.025 : 1);
  // A bigger pick may pass the text box, up to the frame's safe edge.
  const room = Math.min(1, Math.max(limit, Math.min(width * 0.88, limit * heroPick)) / Math.max(1, rawWidth));
  const fit = Math.min(room, sizeCap * LARGEST / designed);
  const size = nominal * fit;
  const final = metrics(context, text, size, display.family, display.weight, display.italic, tracking * fit);
  const heroWidth = rawWidth * fit;
  const heroHeight = Math.max(1, final.actualBoundingBoxAscent + final.actualBoundingBoxDescent);
  const heroLeft = (width - heroWidth) / 2;
  const hero = {
    text, left: heroLeft, top: -heroHeight / 2, width: heroWidth, height: heroHeight,
    size, tracking: tracking * fit + size * extraTracking, ascent: final.actualBoundingBoxAscent, ...display,
  };
  // The word is drawn centered on its advance; its letters (without closing punctuation) may sit off that center.
  const core = text.replace(/[^\p{L}\p{M}\p{N}]+$/u, "") || text;
  const coreInk = metrics(context, core, size, display.family, display.weight, display.italic, tracking * fit);
  const letterCenter = (coreInk.actualBoundingBoxRight - coreInk.actualBoundingBoxLeft) / 2 - final.width / 2;
  const evenFit = room * designed / LARGEST;
  extraTracking = spacing.plain;
  const plain = groupLayout(cue.words, context, settings.normalSize * unit, limit * 0.94, helperFace, false, wordScales);
  extraTracking = spacing.helper;
  plain.left = (width - plain.width) / 2;
  plain.top = -plain.height / 2;
  const helperWords = cue.words.filter((_, index) => index !== cue.heroIndex);
  // Helpers hug the letters with a small safe gap. Measured from the letters, not trailing punctuation:
  // the comma in "GLASSES," hangs below them and would push the lower helper away.
  const helperGap = Math.max(4 * unit, size * 0.03);
  const baseline = hero.top + final.actualBoundingBoxAscent;
  const letterTop = baseline - coreInk.actualBoundingBoxAscent;
  const letterBottom = baseline + Math.max(0, coreInk.actualBoundingBoxDescent);
  /** Helpers keep a readable floor: a long headline shrinks to fit, and must not take its helpers with it. */
  const helperFloor = 30 * unit;
  // Three readable planes within this cue; no copies of past captions are used.
  if (cue.variant === "split" || cue.variant === "echo") {
    const before = cue.words.slice(0, cue.heroIndex);
    const after = cue.words.slice(cue.heroIndex + 1);
    const upper = before.length ? before : after.length > 1 ? after.slice(0, 1) : [];
    const lower = before.length ? after : after.slice(upper.length);
    const groups = [upper, lower].flatMap((words, index) => {
      if (!words.length) return [];
      extraTracking = spacing.helper;
      const group = groupLayout(words, context, Math.min(40 * unit, Math.max(helperFloor, heroHeight / heroPick * 0.46)) * helperScale,
        Math.min(limit, width * 0.72), helperFace, false, wordScales);
      const alignRight = cue.variant === "split" ? index === 1 : index === 0;
      group.align = alignRight ? "right" : "left";
      group.left = clamp(alignRight ? heroLeft + heroWidth - group.width : heroLeft,
        width * 0.06, width * 0.94 - group.width);
      // Align each wrapped helper row with its corner, including shorter rows.
      for (const y of new Set(group.words.map(item => item.y))) {
        const row = group.words.filter(item => item.y === y);
        const rowLeft = row[0].x;
        const rowWidth = row[row.length - 1].x + row[row.length - 1].width - rowLeft;
        const offset = (alignRight ? group.width - rowWidth : 0) - rowLeft;
        row.forEach(item => { item.x += offset; });
      }
      group.top = index === 0 ? letterTop - group.height - helperGap : letterBottom + helperGap;
      return [group];
    });
    return { hero, groups, plain, fit: evenFit };
  }
  const outline = cue.variant === "outline";
  // Long hollow headlines shrink to fit; their center copy must shrink with them.
  const helperSize = (outline ? Math.min(40 * unit, heroHeight * 0.46)
    : Math.min(42 * unit, Math.max(helperFloor, heroHeight / heroPick * 0.48))) * helperScale;
  extraTracking = spacing.helper;
  const helper = groupLayout(helperWords, context, helperSize,
    Math.min(limit, outline ? heroWidth * 0.82 : width * 0.77), helperFace, outline, wordScales);
  helper.left = (width - helper.width) / 2 + (outline ? letterCenter : 0);
  helper.top = outline ? hero.top + (hero.height - helper.height) / 2 : letterBottom + helperGap;
  return { hero, groups: [helper], plain, fit: evenFit };
};
