import { NO_SPACING, useSpacing, type PartSpacing } from "./Premium/sizes";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Composition, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue, normalizeWords } from "./LaunchCaptionPack/timeline";
import { CueMotionContext, useCueMotion } from "./BasicCaption/cueMotion";
import { chosenEntrance, usePartFonts, usePartSizes, type PartFace } from "./Premium/parts";
import { SAFE_WIDTH, sizeOf, type PartSizes } from "./Premium/sizes";
import { MotionWord } from "./Standard/MotionWord";
import type { CaptionSource, Cue, Word } from "./LaunchCaptionPack/types";
import transcript from "./StyleTwo/demo.transcript.json";
import type { BasicCaptionPresentation } from "./BasicCaption/BasicCaptionRenderer";
import { SourceVideo } from "./SourceVideo";
import { mixText } from "./Script/mix";

/** One template: phrase composition, typography, timing, and motion live here. */
export type CadenceProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: {
    seed?: string;
    theme?: "amber" | "sage" | "iris";
    positionY?: number;
    maxWidth?: number;
    scale?: number;
    layeredRatio?: number;
    centered?: boolean;
  };
  reducedMotion?: boolean;
  presentationConfig?: BasicCaptionPresentation;
};

const DEFAULT_SOURCE: CaptionSource = {
  transcript, durationMs: 44044, background: { src: "why_not_you_hq.mp4" },
};
const PALETTES = {
  amber: { accent: "#f6ad73", paper: "#e5d8c6", ink: "#fff5e8" },
  sage: { accent: "#bfda83", paper: "#dbe3ca", ink: "#f5f7e9" },
  iris: { accent: "#b797ee", paper: "#e1d6ec", ink: "#f6f0fc" },
} as const;
const limit = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const setting = (v: number | undefined, fallback: number, lo: number, hi: number) =>
  limit(typeof v === "number" && Number.isFinite(v) ? v : fallback, lo, hi);
const ease = (t: number) => 1 - (1 - limit(t)) ** 3;
const settle = (ms: number) => { const t = Math.max(0, ms) / 42; return limit(1 - (1 + t) * Math.exp(-t)); };
/** Where the supporting words come from, in turn: below, left, below, right. */
const ENTRY_SIDES = [[0, 1], [-1, 0], [0, 1], [1, 0]];
const asset = (src: string) => /^(https?:|data:|blob:|\/)/iu.test(src) ? src : staticFile(src);
const clean = (text: string) => text.toLocaleLowerCase().replace(/’/gu, "'").replace(/[^\p{L}\p{M}\p{N}']/gu, "");
const devanagari = (text: string) => /[\u0900-\u097f]/u.test(text);
const STOP = new Set("a an the and or but of to for in on at from with by as is are was were be been being am i my me we our you your they their he his she her it its this that these those can could would should will have has had do does did so just very really now then than not don't got i'm i've i'll you're you've we'll we're they're it's that's एक यह वह और या तो को का की के में पर से है हैं मैं तुम आप हम भी ही जो कि नहीं".split(" "));
const POWER = new Set("why dreams dream courage courageously freedom discipline purpose success growth believe build create change achieve extraordinary unstoppable confidence financial future decisions opportunity potential strength breakthrough remarkable beautiful happiness love life become better powerful world enough imagine begin start today forever".split(" "));
const hash = (text: string) => {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return n >>> 0;
};
const emphasisScore = (word: Word) => {
  const text = clean(word.text);
  return (word.emphasis ? 80 : 0) + (POWER.has(text) ? 8 : 0) + Math.min(12, [...text].length) * .8 +
    (/\d/u.test(text) ? 7 : 0) - (STOP.has(text) ? 18 : 0) - (word.event ? 50 : 0);
};
const mainOf = (words: Word[]) => {
  if (words.some(word => clean(word.text) === "why") && words.some(word => clean(word.text) === "not") &&
    !words.some(word => word.emphasis)) return words[words.length - 1];
  return words.reduce((best, word) => emphasisScore(word) > emphasisScore(best) ? word : best);
};

/** Partition phrases globally rather than chopping the transcript every N words. */
const phraseCues = (words: Word[]): Cue[] => {
  const segments: Word[][] = [];
  let segment: Word[] = [];
  for (const word of words) {
    const last = segment[segment.length - 1];
    if (last && word.startMs > last.startMs && (last.pageBreakAfter || last.speaker !== word.speaker ||
      last.event !== word.event || word.startMs - last.endMs > 480 || /[.!?।॥]["'”’)]?$/u.test(last.text))) {
      segments.push(segment); segment = [];
    }
    segment.push(word);
  }
  if (segment.length) segments.push(segment);
  const groups: Word[][] = [];
  for (const entries of segments) {
    const costs = Array<number>(entries.length + 1).fill(Infinity);
    const breaks = Array<number>(entries.length).fill(0);
    costs[entries.length] = 0;
    for (let start = entries.length - 1; start >= 0; start--) {
      let maxEnd = Math.min(entries.length, start + 9);
      while (maxEnd < entries.length && entries[maxEnd].startMs === entries[maxEnd - 1].startMs) maxEnd++;
      for (let end = start + 1; end <= maxEnd; end++) {
        if (end < entries.length && entries[end].startMs === entries[end - 1].startMs) continue;
        const slice = entries.slice(start, end);
        const chars = slice.map(word => word.text).join(" ").length;
        const duration = Math.max(...slice.map(word => word.endMs)) - slice[0].startMs;
        const simultaneous = slice.every(word => word.startMs === slice[0].startMs);
        if (slice.length > 1 && !simultaneous && (chars > 58 || duration > 3200)) break;
        const last = slice[slice.length - 1];
        const cost = 2.4 + ((chars - 27) / 19) ** 2 + ((duration - 1700) / 2200) ** 2 +
          (slice.length === 1 && entries.length > 2 ? 7 : 0) +
          (end < entries.length && STOP.has(clean(last.text)) ? 5 : 0) -
          (/[,:;]$/u.test(last.text) ? 1.4 : 0) + costs[end];
        if (cost < costs[start]) { costs[start] = cost; breaks[start] = end; }
      }
    }
    for (let start = 0; start < entries.length;) {
      const end = breaks[start] || start + 1;
      groups.push(entries.slice(start, end)); start = end;
    }
  }
  return groups.map((entries, index) => ({ id: `cadence-${entries[0].id}`, words: entries,
    startMs: entries[0].startMs,
    endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 190, groups[index + 1]?.[0].startMs ?? Infinity) }));
};

const FONTS = [
  { family: "Cadence Display", path: "launch-caption-pack/fonts/anton/Anton-Regular.ttf", weight: "400", style: "normal" },
  { family: "Cadence Body", path: "launch-caption-pack/fonts/spacegrotesk/SpaceGrotesk[wght].ttf", weight: "300 700", style: "normal" },
  { family: "Cadence Serif", path: "style-two/fonts/instrument-serif-italic.ttf", weight: "400", style: "italic" },
  { family: "Cadence Hindi", path: "editorial-type/fonts/noto-sans-devanagari.ttf", weight: "100 900", style: "normal" },
] as const;
const fontCache = new Map<string, Promise<void>>();
const loadFonts = (needsHindi: boolean) => Promise.all(FONTS.slice(0, needsHindi ? 4 : 3).map(font => {
  if (!fontCache.has(font.family)) {
    const promise = new FontFace(font.family, `url(${JSON.stringify(asset(font.path))})`,
      { weight: font.weight, style: font.style }).load().then(face => { document.fonts.add(face); });
    fontCache.set(font.family, promise);
    void promise.catch(() => fontCache.delete(font.family));
  }
  return fontCache.get(font.family)!;
}));

type Role = "body" | "display" | "serif";
type LayeredMode = "stack" | "cascade" | "column";
type Mode = "poster" | "editorial" | "verse" | "statement" | LayeredMode;
type Glyph = { word: Word; text: string; role: Role; family: string; weight: number; italic: boolean;
  size: number; width: number; left: number; ascent: number; descent: number; main: boolean };
type Placed = Glyph & { x: number; y: number; line: number };
type Design = { mode: Mode; items: Placed[]; cost: number };
type Page = Cue & Design & { mainId: string; bounds: { left: number; right: number; top: number; bottom: number }; mark: boolean };
type Measure = (word: Word, role: Role, size: number, main: boolean, uppercase?: boolean) => Glyph;
const gapAfter = (left: Glyph, right: Glyph, gap: number) =>
  (/^[%‰°.,!?;:]+$/u.test(right.text) || /[([{“]$/u.test(left.text)) ? 0 : gap;
const rowWidth = (items: Glyph[], gap: number) => items.reduce((sum, item, index) =>
  sum + item.width + (index ? gapAfter(items[index - 1], item, gap) : 0), 0);
const rowPlace = (items: Glyph[], gap: number, x: number, y: number, line: number): Placed[] => {
  let cursor = x;
  return items.map((item, index) => {
    if (index) cursor += gapAfter(items[index - 1], item, gap);
    const placed = { ...item, x: cursor + item.left, y, line };
    cursor += item.width; return placed;
  });
};

/** Exhaustive line balancing is small (at most nine words), and avoids orphan rows. */
const balancedRows = (items: Glyph[], width: number, gap: number): { rows: Glyph[][]; cost: number } | null => {
  let best: { rows: Glyph[][]; cost: number } | null = null;
  const visit = (start: number, rows: Glyph[][]) => {
    if (start === items.length) {
      const widths = rows.map(row => rowWidth(row, gap));
      const mean = widths.reduce((sum, w) => sum + w, 0) / widths.length;
      const cost = rows.length * 1.7 + widths.reduce((sum, w) => sum + ((w - mean) / width) ** 2 * 11, 0) +
        rows.reduce((sum, row, index) => sum +
          (row.length === 1 && !row[0].main && rows.length > 1 ? 3.8 : 0) +
          (index < rows.length - 1 && STOP.has(clean(row[row.length - 1].text)) ? 1.8 : 0), 0);
      if (!best || cost < best.cost) best = { rows: rows.map(row => [...row]), cost };
      return;
    }
    if (rows.length === 3) return;
    for (let end = start + 1; end <= items.length; end++) {
      const row = items.slice(start, end);
      if (rowWidth(row, gap) > width) break;
      visit(end, [...rows, row]);
    }
  };
  visit(0, []);
  return best;
};

const flowingDesign = (cue: Cue, mode: "editorial" | "verse" | "statement", measure: Measure,
  width: number, scale: number): Design | null => {
  const hero = mainOf(cue.words);
  let best: Design | null = null;
  for (const fit of [1, .94, .88, .82, .76]) {
    const items = cue.words.map(word => {
      const main = word.id === hero.id;
      // Match visible cap heights across families; emphasis does not change the scale.
      const role: Role = mode === "verse" ? "serif" : mode === "statement" ? "display" : main ? "serif" : "body";
      const size = mode === "verse" ? 69 : mode === "statement" ? 72 : main ? 73 : 57;
      return measure(word, role, size * scale * fit, main, role === "display");
    });
    const gap = 10 * scale * fit;
    const result = balancedRows(items, width, gap);
    if (!result) continue;
    const blockWidth = Math.max(...result.rows.map(row => rowWidth(row, gap)));
    let top = 0;
    const placed = result.rows.flatMap((row, line) => {
      const ascent = Math.max(...row.map(item => item.ascent));
      const descent = Math.max(...row.map(item => item.descent));
      const x = 360 - blockWidth / 2;
      const rowItems = rowPlace(row, gap, x, top + ascent, line);
      top += ascent + descent + 5 * scale;
      return rowItems;
    });
    const height = Math.max(...placed.map(item => item.y + item.descent));
    if (height > 274 * scale) continue;
    const cost = result.cost + (1 - fit) * 23 + (height > 200 * scale ? 2 : 0);
    if (!best || cost < best.cost) best = { mode, items: placed, cost };
  }
  return best;
};

const posterDesign = (cue: Cue, measure: Measure, width: number, scale: number): Design | null => {
  if (cue.words.length < 2 || cue.words.length > 9) return null;
  const hero = mainOf(cue.words);
  if (STOP.has(clean(hero.text)) && !hero.emphasis && !/[?？]$/u.test(hero.text)) return null;
  const index = cue.words.findIndex(word => word.id === hero.id);
  // Keep a short neighbour beside the anchor, as in a composed phrase rather than a logo.
  const includeNext = index + 1 < cue.words.length && clean(cue.words[index + 1].text).length <= 4;
  const middle = cue.words.slice(index, index + (includeNext ? 2 : 1));
  const before = cue.words.slice(0, index); const after = cue.words.slice(index + middle.length);
  const rows: Glyph[][] = [];
  let shrink = 0;
  const helper = (words: Word[], role: Role, size: number) => {
    if (!words.length) return true;
    const raw = words.map(word => measure(word, role, size * scale, false));
    const fit = Math.min(1, width / Math.max(1, rowWidth(raw, 10 * scale)));
    if (fit < .83) return false;
    shrink += 1 - fit;
    rows.push(words.map(word => measure(word, role, size * scale * fit, false)));
    return true;
  };
  if (!helper(before, "body", 51)) return null;
  const anchorRow = (fit: number) => middle.map(word => measure(word,
    word.id === hero.id ? "display" : "body", (word.id === hero.id ? 82 : 51) * scale * fit,
    word.id === hero.id, word.id === hero.id));
  const fit = Math.min(1, width / Math.max(1, rowWidth(anchorRow(1), 10 * scale)));
  if (fit < .78) return null;
  rows.push(anchorRow(fit));
  if (!helper(after, "body", 51)) return null;
  const blockWidth = Math.max(...rows.map(row => rowWidth(row, 10 * scale)));
  let top = 0;
  const placed = rows.flatMap((row, line) => {
    const ascent = Math.max(...row.map(item => item.ascent));
    const descent = Math.max(...row.map(item => item.descent));
    const rowItems = rowPlace(row, 10 * scale, 360 - blockWidth / 2, top + ascent, line);
    top += ascent + descent + 5 * scale;
    return rowItems;
  });
  if (top > 284 * scale || blockWidth > width + 1) return null;
  const hasMiddlePhrase = before.length > 0 && after.length > 0 && clean(hero.text).length >= 7;
  return { mode: "poster", items: placed, cost: (hasMiddlePhrase ? 1.8 : 4.8) + shrink * 10 + (1 - fit) * 12 };
};

/** Compose complete, differently dressed rows rather than enlarging one keyword. */
const layeredDesign = (cue: Cue, mode: LayeredMode, measure: Measure,
  width: number, scale: number, seed: string): Design | null => {
  if (cue.words.length < 4 || cue.words.some(word => word.event)) return null;
  const fingerprint = hash(`${seed}:${cue.id}:${mode}:layers`);
  const duration = Math.max(...cue.words.map(word => word.endMs)) - cue.startMs;
  const count = cue.words.length >= 7 && duration >= 1600 &&
    hash(`${seed}:${cue.id}:line-count`) % 100 < 64 ? 4 : 3;
  const patterns: Role[][] = count === 4 ? [
    ["body", "serif", "display", "body"], ["serif", "display", "body", "serif"],
    ["body", "display", "serif", "body"],
  ] : [["body", "display", "serif"], ["serif", "body", "display"], ["display", "serif", "body"]];
  const roles = patterns[Math.floor(fingerprint / 100) % patterns.length];
  const hero = mainOf(cue.words);
  const gap = 10 * scale;
  const rowLimit = width - (mode === "cascade" ? 30 * scale : 0);
  let best: Design | null = null;
  const visit = (start: number, rows: Glyph[][], penalty: number) => {
    const line = rows.length;
    if (line === count) {
      if (start !== cue.words.length) return;
      const widths = rows.map(row => rowWidth(row, gap));
      const blockWidth = Math.min(width, Math.max(...widths) + (mode === "cascade" ? 30 * scale : 0));
      const left = 360 - blockWidth / 2;
      const mean = widths.reduce((sum, value) => sum + value, 0) / count;
      let top = 0;
      const items = rows.flatMap((row, index) => {
        const ascent = Math.max(...row.map(item => item.ascent));
        const descent = Math.max(...row.map(item => item.descent));
        const room = Math.max(0, blockWidth - widths[index]);
        const offset = mode === "cascade" ? Math.min(room, [0, 30, 10, 38][index] * scale) :
          mode === "column" ? room * (index % 2 ? 1 : 0) : 0;
        const placed = rowPlace(row, gap, left + offset, top + ascent, index);
        top += ascent + descent + 5 * scale;
        return placed;
      });
      if (top > 268 * scale) return;
      const raggedness = widths.reduce((sum, value) => sum + ((value - mean) / width) ** 2, 0);
      const cost = 1.4 + penalty + raggedness * 3;
      if (!best || cost < best.cost) best = { mode, items, cost };
      return;
    }
    const remaining = count - line - 1;
    const role = roles[line];
    const base = (role === "body" ? 53 : role === "display" ? 73 : 69) * scale;
    for (let end = start + 1; end <= cue.words.length - remaining; end++) {
      const entries = cue.words.slice(start, end);
      const raw = entries.map(word => measure(word, role, base, word.id === hero.id, role === "display"));
      const fit = Math.min(1, rowLimit / Math.max(1, rowWidth(raw, gap)));
      if (fit < .84) break;
      const row = fit === 1 ? raw : entries.map(word =>
        measure(word, role, base * fit, word.id === hero.id, role === "display"));
      const last = entries[entries.length - 1];
      const singleConnector = entries.length === 1 && STOP.has(clean(last.text));
      const awkwardBreak = end < cue.words.length && STOP.has(clean(last.text));
      const punctuation = /[,;:]$/u.test(last.text);
      visit(end, [...rows, row], penalty + (1 - fit) * 14 + (singleConnector ? 8 : 0) +
        (awkwardBreak ? 2.2 : 0) - (punctuation ? .65 : 0));
    }
  };
  visit(0, [], 0);
  return best;
};

/** Size picks go on a finished design: its mode and rows stay, and each row refits on its own. */
const sizedDesign = (design: Design, measure: Measure, sizes: PartSizes, width: number, scale: number): Design => {
  const pick = (item: Placed) => sizeOf(sizes, item.main ? "main" : "helper", item.word.id);
  if (design.items.every(item => pick(item) === 1)) return design;
  const gap = 10 * scale;
  const box = Math.max(width, Math.min(720 * SAFE_WIDTH, width * sizes.main));
  let top = 0;
  const items = [...new Set(design.items.map(item => item.line))].flatMap(line => {
    const row = design.items.filter(item => item.line === line);
    const glyphs = (fit: number) => row.map(item =>
      measure(item.word, item.role, item.size * pick(item) * fit, item.main, item.text !== shown(item.word, item.role, item.main)));
    const sized = glyphs(Math.min(1, box / Math.max(1, rowWidth(glyphs(1), gap))));
    const wide = rowWidth(sized, gap);
    const last = row[row.length - 1];
    const center = (row[0].x - row[0].left + last.x - last.left + last.width) / 2;
    const left = Math.max(360 - box / 2, Math.min(360 + box / 2 - wide, center - wide / 2));
    const ascent = Math.max(...sized.map(item => item.ascent));
    const placed = rowPlace(sized, gap, left, top + ascent, line);
    top += ascent + Math.max(...sized.map(item => item.descent)) + 5 * scale;
    return placed;
  });
  return { ...design, items };
};

/** Spacing picked in the editor, as a share of each word's size; set for the length of one layout pass. */
let extraTracking: PartSpacing = NO_SPACING;
/** Mix: big words (the main word and the display or serif lines) read in English letters, small text in the speaker's script. */
const shown = (word: Word, role: string, main: boolean) => main || role !== "body" ? mixText(word) : word.text;
const compose = (cues: Cue[], ctx: CanvasRenderingContext2D, height: number,
  config: CadenceProps["styleConfig"], sizes: PartSizes, faces: { main?: PartFace; helper?: PartFace } = {}): Page[] => {
  const scale = setting(config?.scale, 1, .8, 1.2);
  const width = 720 * setting(config?.maxWidth, .82, .64, .88) - 20;
  const baseRail = height * setting(config?.positionY, .825, .2, .87);
  const seed = config?.seed ?? "cadence-01";
  const layeredRatio = setting(config?.layeredRatio, .84, 0, 1);
  const measurements = new Map<string, Omit<Glyph, "word" | "main">>();
  const measure: Measure = (word, role, size, main, uppercase = false) => {
    const own = shown(word, role, main);
    const text = uppercase && !devanagari(own) ? own.toLocaleUpperCase() : own;
    // A font picked in the editor replaces the display face (main word) or the body face (small text).
    // Hindi keeps each role's face too; Script/ScriptFonts draws its letters in a matching face.
    const pick = role === "display" ? faces.main : role === "body" ? faces.helper : undefined;
    const family = pick?.family ?? (role === "display" ? "Cadence Display" : role === "serif" ? "Cadence Serif" : "Cadence Body");
    const italic = pick ? pick.italic : role === "serif";
    const weight = pick?.weight ?? (role === "body" ? 700 : 400);
    const key = JSON.stringify([text, role, size, family, main ? extraTracking.main : extraTracking.helper]);
    let glyph = measurements.get(key);
    if (!glyph) {
      ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${family}"`;
      ctx.letterSpacing = `${size * (main ? extraTracking.main : extraTracking.helper)}px`; ctx.fontKerning = "normal";
      const m = ctx.measureText(text);
      const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
      const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
      glyph = { text, role, family, weight, italic, size, width: Math.max(m.width, left + right) + 2,
        left: Math.max(0, left), ascent: Math.max(size * .35, m.actualBoundingBoxAscent || size * .75),
        descent: Math.max(0, m.actualBoundingBoxDescent || 0) };
      measurements.set(key, glyph);
    }
    return { ...glyph, word, main };
  };
  let lastMode: Mode | undefined;
  const modes: Mode[] = ["poster", "editorial", "verse", "statement", "stack", "cascade", "column"];
  return cues.map(cue => {
    const designs = modes.map(mode => mode === "poster" ? posterDesign(cue, measure, width, scale) :
      mode === "stack" || mode === "cascade" || mode === "column" ? layeredDesign(cue, mode, measure, width, scale, seed) :
      flowingDesign(cue, mode, measure, width, scale)).filter((design): design is Design => design !== null);
    if (!designs.length) {
      // A single exceptionally long token still gets a measured, safe fit.
      const hero = mainOf(cue.words);
      const items: Placed[] = [];
      let y = 0;
      for (const word of cue.words) {
        const raw = measure(word, "body", 58 * scale, word.id === hero.id);
        const item = measure(word, "body", 58 * scale * Math.min(1, width / raw.width), word.id === hero.id);
        y += item.ascent;
        items.push({ ...item, x: 360 - item.width / 2 + item.left, y, line: items.length });
        y += item.descent + 5;
      }
      designs.push({ mode: "editorial", items, cost: 50 });
    }
    const isLayered = (design: Design) => design.mode === "stack" || design.mode === "cascade" || design.mode === "column";
    const preferLayers = designs.some(isLayered) && hash(`${seed}:${cue.id}:density`) % 1000 < layeredRatio * 1000;
    const score = (design: Design) => design.cost + (design.mode === lastMode ? 4.2 : 0) +
      (preferLayers === isLayered(design) ? 0 : 12) +
      (hash(`${seed}:${cue.id}:${design.mode}`) % 1000) / 1000 * 2.5;
    const design = sizedDesign(designs.reduce((best, item) => score(item) < score(best) ? item : best), measure, sizes, width, scale);
    lastMode = design.mode;
    const bottom = Math.max(...design.items.map(item => item.y + item.descent));
    const top = Math.min(...design.items.map(item => item.y - item.ascent));
    const fit = Math.min(1, 286 * scale * Math.max(1, sizes.main, sizes.helper) / Math.max(1, bottom - top));
    const rail = baseRail + (config?.centered ? (bottom - top) * fit / 2 : 0);
    const items = design.items.map(item => ({ ...item,
      x: 360 + (item.x - 360) * fit, y: rail + (item.y - bottom) * fit,
      size: item.size * fit, width: item.width * fit, left: item.left * fit,
      ascent: item.ascent * fit, descent: item.descent * fit }));
    const mainId = mainOf(cue.words).id;
    return { ...cue, ...design, items, mainId,
      bounds: { left: Math.min(...items.map(item => item.x - item.left)),
        right: Math.max(...items.map(item => item.x - item.left + item.width)),
        top: rail + (top - bottom) * fit, bottom: rail },
      mark: cue.words.length > 1 };
  });
};

export const Cadence: React.FC<CadenceProps> = ({ sourceConfig = DEFAULT_SOURCE, styleConfig, reducedMotion = false, presentationConfig }) => {
  const sizes = usePartSizes(presentationConfig);
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps; const canvasHeight = height * 720 / width;
  const id = `cadence-${useId().replace(/[^a-zA-Z0-9]/gu, "")}`;
  const words = useMemo(() => normalizeWords(sourceConfig).words, [sourceConfig]);
  const cues = useMemo(() => phraseCues(words), [words]);
  const needsHindi = useMemo(() => words.some(word => devanagari(word.text)), [words]);
  const [ready, setReady] = useState<boolean | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    const handle = delayRender("Loading Cadence typography");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    setReady(null);
    void loadFonts(needsHindi).then(() => { if (!disposed) setReady(needsHindi); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [needsHindi, delayRender, continueRender, cancelRender]);
  const picked = usePartFonts(presentationConfig?.parts);
  const pickedFaces = picked.faces, pickedReady = picked.ready;
  const spacing = useSpacing(presentationConfig);
  const pages = useMemo(() => {
    if (ready !== needsHindi || !pickedReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Cadence needs a canvas to compose its typography.");
    extraTracking = spacing;
    return compose(cues, ctx, canvasHeight, styleConfig, sizes, pickedFaces);
  }, [ready, needsHindi, cues, canvasHeight, styleConfig, sizes, pickedFaces, pickedReady, spacing]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (pages.length) onLayout?.((Math.max(...pages.map(p => p.bounds.bottom - p.bounds.top)) + 32) * width / 720);
  }, [pages, onLayout, width]);
  const page = activeCue(pages, now);
  useCueMotion(page?.startMs, page?.endMs);
  const main = page?.items.find(item => item.word.id === page.mainId);
  const palette = PALETTES[styleConfig?.theme ?? "amber"] ?? PALETTES.amber;
  const parts = presentationConfig?.parts;
  const motion = useContext(CueMotionContext)?.animation;
  const spokenEnd = page ? Math.max(...page.words.map(word => word.endMs)) : 0;
  const exitWindow = page ? Math.min(110, Math.max(0, page.endMs - spokenEnd)) : 0;
  const pageOpacity = page && exitWindow > 0 && !reducedMotion ? ease((page.endMs - now) / exitWindow) : 1;
  const voice = page?.items.reduce<Placed | undefined>((current, item) =>
    item.word.startMs <= now && now < item.word.endMs ? item : current, undefined);
  const voiceIndex = voice && page ? page.items.indexOf(voice) : -1;
  const previous = page && voiceIndex > 0 ? page.items[voiceIndex - 1] : undefined;
  const voiceAge = voice ? now - voice.word.startMs : 0;
  const tracking = voice && !reducedMotion ? ease(voiceAge / Math.min(140,
    Math.max(50, (voice.word.endMs - voice.word.startMs) * .48))) : 1;
  const connected = voice && previous && previous.line === voice.line && voice.word.startMs - previous.word.endMs < 120;
  const voiceLeft = voice ? voice.x - voice.left : 0;
  const trackLeft = connected && previous ? (previous.x - previous.left) * (1 - tracking) + voiceLeft * tracking :
    voiceLeft + (voice?.width ?? 0) * (1 - tracking) * .5;
  const trackWidth = connected && previous && voice ? previous.width * (1 - tracking) + voice.width * tracking : (voice?.width ?? 0) * tracking;
  const trackOpacity = voice && !reducedMotion ? ease((voice.word.endMs - now) /
    Math.min(65, Math.max(1, (voice.word.endMs - voice.word.startMs) * .35))) : 1;
  const background = sourceConfig.background;
  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "#161714", overflow: "hidden", pointerEvents: "none" }}>
    {background?.src ? background.kind === "image" ? <Img src={asset(background.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(background.src)} muted={background.muted ?? false}
        volume={setting(background.volume, 1, 0, 1)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {!presentationConfig?.onLayout && background?.src && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(8,10,9,.77), rgba(8,10,9,.40) 23%, rgba(8,10,9,.1) 43%, transparent 60%)" }} />}
    {page && main ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      role="img" aria-label={page.words.map(word => word.text).join(" ")}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-ink`} gradientUnits="userSpaceOnUse" x1="0" y1={page.bounds.top} x2="0" y2={page.bounds.bottom}>
          <stop offset="0" stopColor={palette.ink} /><stop offset=".6" stopColor={palette.ink} />
          <stop offset="1" stopColor={palette.paper} />
        </linearGradient>
        <pattern id={`${id}-etch`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-18)">
          <path d="M 0 1 H 5" stroke="#342b22" strokeWidth=".7" />
        </pattern>
        <filter id={`${id}-depth`} x="-30%" y="-55%" width="160%" height="230%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#080a09" floodOpacity=".55" />
        </filter>
      </defs>
      <g opacity={pageOpacity} filter={`url(#${id}-depth)`}>
        {page.items.map((item, index) => {
          const age = now - item.word.startMs;
          // Timing is an invariant: not even a decorative fragment precedes speech.
          if (age < 0) return null;
          const main = item.word.id === page.mainId;
          const still = reducedMotion || chosenEntrance(motion, main, item.word.id);
          const fill = parts?.[main ? "main" : "helper"]?.color ?? `url(#${id}-ink)`;
          const elapsed = age + 1000 / fps * .2;
          const progress = still ? 1 : settle(elapsed * .5);
          const opacity = still ? 1 : ease(elapsed / 150);
          // The main word lands from below; the words around it drift in from alternating sides.
          const [fromX, fromY] = main ? [0, 1] : ENTRY_SIDES[index % ENTRY_SIDES.length];
          const travel = Math.min(item.size * .34, 22);
          const dx = still ? 0 : (1 - progress) * fromX * travel;
          const dy = still ? 0 : (1 - progress) * fromY * travel;
          const printed = item.role === "display";
          const reveal = still ? 1 : ease(elapsed / 145);
          const clip = `${id}-print-${index}`;
          const textProps = { x: item.x, y: item.y, fontFamily: `"${item.family}"`, fontWeight: item.weight,
            fontStyle: item.italic ? "italic" : "normal", fontSize: item.size, letterSpacing: item.size * (item.main ? spacing.main : spacing.helper),
            style: { whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal", textRendering: "geometricPrecision" } as React.CSSProperties };
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main={main}><g opacity={opacity}
            transform={`translate(${dx} ${dy})`}
            style={{ filter: !still && progress < .99 ? `blur(${(1 - progress) * Math.min(item.size * .13, 9)}px)` : undefined }}>
            {printed && reveal < 1 ? <>
              <clipPath id={clip} clipPathUnits="userSpaceOnUse"><rect x={item.x - item.left - 4}
                y={item.y - item.ascent - 5} width={(item.width + 8) * reveal} height={item.ascent + item.descent + 10} /></clipPath>
              <text {...textProps} fill="none" stroke={palette.ink} strokeWidth=".65" opacity=".45">{item.text}</text>
            </> : null}
            <g clipPath={printed && reveal < 1 ? `url(#${clip})` : undefined}>
              <text {...textProps} fill={fill}>{item.text}</text>
              {printed ? <text {...textProps} fill={`url(#${id}-etch)`} opacity=".14">{item.text}</text> : null}
            </g>
          </g></MotionWord>;
        })}
        {page.mark && voice && trackWidth > 0 ? <path
          d={`M ${trackLeft + 1} ${voice.y + voice.descent + 2} q ${trackWidth * .43} 1.4 ${Math.max(0, trackWidth - 2)} -.4`}
          fill="none" stroke={parts?.main?.color ?? palette.accent} strokeWidth="2.3" strokeLinecap="round" opacity={trackOpacity * .78} /> : null}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolveCadenceMetadata = ({ props }: { props: CadenceProps }) => {
  const source = props.sourceConfig ?? DEFAULT_SOURCE;
  const { words } = normalizeWords(source);
  const durationMs = words.reduce((end, word) => Math.max(end, word.endMs + 190),
    setting(source.durationMs, 1000, 1000, 86400000));
  return { fps: 30, durationInFrames: Math.max(1, Math.ceil(durationMs * 30 / 1000)) };
};

export const CadenceComposition: React.FC = () => <Composition id="Cadence" component={Cadence}
  width={720} height={1280} fps={30} durationInFrames={1330} defaultProps={{}}
  calculateMetadata={resolveCadenceMetadata} />;
