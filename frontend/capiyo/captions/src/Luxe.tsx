import { NO_SPACING, useSpacing, type PartSpacing } from "./Premium/sizes";
import { MotionWord } from "./Standard/MotionWord";
import { fourSideFrom, rowsByBaseline } from "./Standard/fourSide";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { CueMotionContext, useCueMotion } from "./BasicCaption/cueMotion";
import type { BasicCaptionPresentation } from "./BasicCaption/BasicCaptionRenderer";
import { chosenEntrance, darken, gradientLine, lighten, usePartFonts, usePartSizes, type PartFace } from "./Premium/parts";
import { NO_SIZES, SAFE_WIDTH, sizeOf, type PartSizes } from "./Premium/sizes";
import { evenSizeCap } from "./CaptionEngine/evenSize";
import { activeCue, normalizeWords } from "./LaunchCaptionPack/timeline";
import type { CaptionSource, Word } from "./LaunchCaptionPack/types";
import transcript from "./StyleTwo/demo.transcript.json";
import { nestLuxeHelper } from "./LuxeNesting";
import { SourceVideo } from "./SourceVideo";

export type LuxeProps = {
  sourceConfig?: CaptionSource & { designSeed?: string | number };
  styleConfig?: { positionY?: number; fontSize?: number; scriptSize?: number;
    maxWidth?: number; palette?: "mixed" | "blue" | "teal" | "purple" | "green";
    heroTreatment?: "original" | "caption-six"; naturalWrap?: boolean; showcase?: boolean;
    /** The blended headline as its own layer, so it can blend with a video outside this one. */
    inkLayer?: "only" | "skip"; onLayout?: (height: number) => void };
  presentationConfig?: Pick<BasicCaptionPresentation, "backgroundColor" | "onLayout" | "reducedMotion" | "parts" | "wordStyles" | "tracking">;
  reducedMotion?: boolean;
};
const SOURCE: NonNullable<LuxeProps["sourceConfig"]> = {
  transcript, durationMs: 44044, background: { src: "why_not_you_hq.mp4" },
};
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const number = (v: number | undefined, fallback: number, lo: number, hi: number) =>
  clamp(typeof v === "number" && Number.isFinite(v) ? v : fallback, lo, hi);
const ease = (v: number) => 1 - (1 - clamp(v)) ** 3;
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const asset = (src: string) => /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);
const hindi = (text: string) => /[\u0900-\u097f]/u.test(text);
const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}']/gu, "");
const hash = (text: string) => {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
};
const STOP = new Set("a an the and or but of to for in on at from with by as is are was were be been being am i my me we our you your they their he his she her it its this that these those can could would should will have has had do does did so just very really now then than not don't एक यह वह और या तो को का की के में पर से है हैं मैं तुम आप हम भी ही जो कि नहीं".split(" "));
for (const word of "i'm i've i'll i'd you're you've you'll you'd we're we've we'll they're they've he's she's it's that's there's isn't aren't wasn't weren't can't couldn't wouldn't shouldn't got".split(" ")) STOP.add(word);
const FONT = [
  { family: "Luxe Outfit", path: "luxe/Outfit-Black.woff2", weight: "900", style: "normal" },
  { family: "Luxe Sans", path: "editorial-type/fonts/roboto-variable.ttf", weight: "100 900", style: "normal" },
  // Clean OFL face: the old demo face replaces apostrophes with a DEMO symbol.
  { family: "Luxe Serif", path: "style-two/fonts/instrument-serif-italic.ttf", weight: "400", style: "italic" },
  { family: "Luxe Hindi", path: "editorial-type/fonts/noto-sans-devanagari.ttf", weight: "100 900", style: "normal" },
  { family: "Luxe CaptionSix", path: "launch-caption-pack/fonts/legacy/poppins-black.ttf", weight: "900", style: "normal" },
  { family: "Luxe Redressed", path: "muse-script/Redressed-Regular.ttf", weight: "400", style: "normal" },
] as const;
const fonts = new Map<string, Promise<void>>();
const loadFonts = (includeHindi: boolean, captionSix = false) => Promise.all((captionSix
  ? [FONT[4], FONT[5], ...(includeHindi ? [FONT[3]] : [])]
  : FONT.slice(0, includeHindi ? 4 : 3)).map(font => {
  if (!fonts.has(font.family)) {
    const promise = new FontFace(font.family, `url(${JSON.stringify(asset(font.path))})`,
      { weight: font.weight, style: font.style }).load().then(face => { document.fonts.add(face); });
    fonts.set(font.family, promise);
    void promise.catch(() => fonts.delete(font.family));
  }
  return fonts.get(font.family)!;
}));

type Role = "hero" | "script" | "label" | "bridge";
type Mode = "signature" | "editorial" | "side-note" | "diagonal" | "duet" | "rail" | "sentence" | "double" | "staggered" | "inset" | "pocket" | "bridge";
type LuxeCue = { id: string; words: Word[]; startMs: number; endMs: number;
  heroIndices: number[]; seed: number; mode: Mode; color: "blue" | "teal" | "purple" | "green";
  glass: boolean; casing: "upper" | "title" | "lower" };
const impact = (word: Word) => (word.emphasis ? 100 : 0) - (word.event ? 100 : 0) -
  (STOP.has(bare(word.text)) ? 24 : 0) + Math.min(9, bare(word.text).length) +
  Math.min(3, (word.endMs - word.startMs) / 220) + (/\d/u.test(word.text) ? 3 : 0);

const compileLuxe = (source: NonNullable<LuxeProps["sourceConfig"]>, referenceLayout = false): LuxeCue[] => {
  const { words } = normalizeWords(source);
  const groups: Word[][] = [];
  let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of words) {
    const previous = group[group.length - 1];
    if (previous && word.startMs > previous.startMs && (previous.pageBreakAfter ||
      previous.speaker !== word.speaker || previous.event !== word.event ||
      /[.!?।॥]["'”’)]?$/u.test(previous.text) || word.startMs - previous.endMs > 360 ||
      group.length >= 5 || [...group, word].map(item => item.text).join(" ").length > 34 ||
      word.endMs - group[0].startMs > 2400)) flush();
    group.push(word);
  }
  flush();
  let previousMode: Mode | undefined;
  let previousColor: LuxeCue["color"] | undefined;
  let bridges = 0;
  return groups.map((entries, index) => {
    const seed = hash(`${source.designSeed ?? "luxe"}:${entries.map(word => word.id).join("/")}`);
    const best = entries.reduce((winner, word, i) => impact(word) > impact(entries[winner]) ? i : winner, 0);
    const content = entries.filter(word => !word.event && !STOP.has(bare(word.text)));
    const keyed = entries.some(word => word.emphasis);
    // Blend Cursor rests on cursive lines for about a third of the video, never on a key word.
    const bridge = entries.every(word => word.event) || content.length === 0 && !keyed ||
      !referenceLayout && entries.length <= 2 && !keyed && (seed >>> 6) % 4 === 0 ||
      referenceLayout && !keyed && (bridges + 1) / (index + 1) <= .38;
    if (bridge) bridges += 1;
    const neighbor = [best + 1, best - 1].find(i => i >= 0 && i < entries.length &&
      !entries[i].event && !STOP.has(bare(entries[i].text)) &&
      bare(entries[i].text).length + bare(entries[best].text).length <= 15);
    const choices: Mode[] = ["signature", "editorial", "side-note", "diagonal"];
    if (entries.length >= 3) choices.push("sentence");
    if (best > 0 && best <= 2 && bare(entries[best].text).length <= 10) choices.push("duet");
    if (best < entries.length - 1 && entries.length - best <= 3 && bare(entries[best].text).length <= 10) choices.push("rail");
    if (neighbor !== undefined && entries.length >= 3) choices.push("double");
    const partner = entries.map((word, i) => ({ word, i })).filter(({ word, i }) =>
      i !== best && !word.event && !STOP.has(bare(word.text)) && bare(word.text).length <= 12 &&
      bare(word.text).length + bare(entries[best].text).length <= 22 && Math.abs(i - best) <= 3)
      .sort((a, b) => impact(b.word) - impact(a.word))[0]?.i;
    if (partner !== undefined && entries.length >= 3) choices.push("staggered", "staggered");
    const shortHelper = best > 0 && best <= 2 || entries.length - best > 1 && entries.length - best <= 3;
    if (shortHelper && bare(entries[best].text).length >= 4) choices.push("inset", "pocket");
    // Blend Cursor uses the reference's clear headline/corner hierarchy.
    // Variation is seeded per phrase, never sampled again during playback.
    const available: Mode[] = referenceLayout ? ["signature", "editorial", "diagonal"] : choices;
    const fresh = available.filter(mode => mode !== previousMode);
    const mode: Mode = bridge ? "bridge" : fresh[(seed >>> 9) % fresh.length];
    const heroIndices = bridge ? [] : mode === "double" && neighbor !== undefined ?
      [best, neighbor].sort((a, b) => a - b) : mode === "staggered" && partner !== undefined ?
        [best, partner].sort((a, b) => a - b) : [best];
    const colors = (["blue", "teal", "purple", "green"] as const).filter(color => color !== previousColor);
    const color = colors[(seed >>> 15) % colors.length];
    previousMode = mode;
    previousColor = color;
    return { id: `luxe-${entries[0].id}`, words: entries, seed, mode, heroIndices,
      color, glass: !bridge,
      casing: mode === "inset" || mode === "pocket" ? (seed % 2 ? "lower" : "title") :
        mode === "staggered" ? "title" : "upper",
      startMs: entries[0].startMs,
      endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 170, groups[index + 1]?.[0].startMs ?? Infinity) };
  });
};

type Ink = { advance: number; left: number; right: number; ascent: number; descent: number };
type Run = { word: Word; text: string; role: Role; row: number; x: number; y: number;
  size: number; family: string; weight: number; style: string; tracking: number; ink: Ink; anchored?: boolean; nested?: boolean };
type LuxeLayout = LuxeCue & { runs: Run[]; top: number; bottom: number; left: number; right: number; fit: number };
/** Spacing picked in the editor, as a share of each word's size; set for the length of one layout pass. */
let extraTracking: PartSpacing = NO_SPACING;
const layoutLuxe = (cues: LuxeCue[], ctx: CanvasRenderingContext2D, height: number,
  config: LuxeProps["styleConfig"], cap = 1, sizes: PartSizes = NO_SIZES, faces: { main?: PartFace; helper?: PartFace } = {}): LuxeLayout[] => {
  const base = number(config?.fontSize, 92, 40, 132);
  const scriptSize = number(config?.scriptSize, 54, 24, 72);
  const captionSix = config?.heroTreatment === "caption-six";
  const capacity = 720 * number(config?.maxWidth, .84, .6, .9);
  const positionY = number(config?.positionY, .76, .25, .83);
  const heroCapacity = Math.max(capacity, Math.min(720 * SAFE_WIDTH, capacity * sizes.main));
  const measure = (word: Word, role: Role, requested: number, casing: LuxeCue["casing"] = "upper", bold = false) => {
    const size = requested * sizeOf(sizes, role === "hero" ? "main" : "helper", word.id);
    const text = role !== "hero" ? word.text : captionSix ? word.text.toUpperCase() : casing === "lower" ? word.text.toLowerCase() :
      casing === "title" ? word.text.replace(/^\p{Ll}/u, first => first.toUpperCase()) : word.text.toUpperCase();
    // A font picked in the editor replaces the glass headline's face or the script's.
    const pick = captionSix ? undefined : role === "hero" ? faces.main : faces.helper;
    const family = pick?.family ?? (captionSix ? role === "hero" ? "Luxe CaptionSix" : "Luxe Redressed" : role === "hero" ? "Luxe Outfit" : "Luxe Serif");
    const style = pick ? pick.italic ? "italic" : "normal" : family === "Luxe Serif" ? "italic" : "normal";
    const weight = pick?.weight ?? (role === "hero" ? 900 : !hindi(text) || !bold ? 400 : 800);
    const tracking = (role === "hero" ? captionSix ? -1.5 : -size * .025 : 0) + size * (role === "hero" ? extraTracking.main : extraTracking.helper);
    ctx.font = `${style} ${weight} ${size}px "${family}"`;
    ctx.letterSpacing = `${tracking}px`;
    const m = ctx.measureText(text);
    const ink: Ink = { advance: m.width,
      left: Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0,
      right: Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width,
      ascent: Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * .8,
      descent: Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * .2 };
    return { word, text, family, style, weight, size, requested, role, tracking, ink };
  };
  return cues.map(cue => {
    const runs: Run[] = [];
    let smallest = 1;
    const headlineSize =base * (.94 + ((cue.seed >>> 20) % 7) * .015);
    const row = (entries: Word[], role: Role, requested: number, rowIndex: number, baseline: number, offset = 0) => {
      if (!entries.length) return { ascent: 0, descent: 0, width: 0 };
      const bold = cue.mode === "inset" || cue.mode === "staggered";
      const natural = entries.map(word => measure(word, role, requested, cue.casing, bold));
      const gap = requested * (role === "script" || role === "bridge" ? .18 : .20);
      const left = -natural[0].ink.left;
      const right = natural.reduce((advance, item, i) => advance + item.ink.advance + (i ? gap : 0), 0) -
        natural[natural.length - 1].ink.advance + natural[natural.length - 1].ink.right;
      const box = role === "hero" ? heroCapacity : capacity;
      const room = Math.min(1, (box - 28) / Math.max(1, right - left));
      if (role === "hero") smallest = Math.min(smallest, room);
      const fit = role === "hero" ? Math.min(cap, room) : room;
      const width = (right - left) * fit;
      const safeOffset = clamp(offset, -(box - width) / 2, (box - width) / 2);
      let x = 360 + safeOffset - (left + right) * fit / 2;
      const fitted = natural.map(item => measure(item.word, role, requested * fit, cue.casing, bold));
      for (const item of fitted) {
        runs.push({ ...item, row: rowIndex, x, y: baseline });
        x += item.ink.advance + gap * fit;
      }
      return { ascent: Math.max(...fitted.map(item => item.ink.ascent)),
        descent: Math.max(...fitted.map(item => item.ink.descent)), width };
    };
    const shiftRow = (rowIndex: number, left: number, baseline?: number) => {
      const entries = runs.filter(run => run.row === rowIndex);
      if (!entries.length) return;
      const inkLeft = Math.min(...entries.map(run => run.x - run.ink.left));
      const inkRight = Math.max(...entries.map(run => run.x + run.ink.right));
      const delta = clamp(left - inkLeft, (720 - capacity) / 2 - inkLeft, (720 + capacity) / 2 - inkRight);
      entries.forEach(run => { run.x += delta; if (baseline !== undefined) run.y = baseline; });
    };
    const naturalWidth = (entries: Word[], role: Role, size: number) => {
      const items = entries.map(word => measure(word, role, size, cue.casing));
      if (!items.length) return 0;
      return items.reduce((sum, item) => sum + item.ink.advance, 0) +
        size * (role === "script" ? .18 : .20) * (items.length - 1) -
        items[items.length - 1].ink.advance + items[items.length - 1].ink.right + items[0].ink.left;
    };
    if (cue.mode === "bridge") {
      row(cue.words, "bridge", scriptSize * (captionSix ? 1.3 : 1), 0, 0);
    } else if (cue.mode === "staggered") {
      // Two staggered title rows, with short white phrases riding their outer edges.
      const [firstIndex, secondIndex] = cue.heroIndices;
      const first = row([cue.words[firstIndex]], "hero", headlineSize * .94, 1, 0, -20);
      const second = row([cue.words[secondIndex]], "hero", headlineSize * .94, 2, 0, 20);
      const secondBaseline = first.descent + second.ascent + 3;
      runs.filter(run => run.row === 2).forEach(run => { run.y = secondBaseline; });
      const before = row(cue.words.slice(0, firstIndex), "label", 38, 0, 0);
      const between = row(cue.words.slice(firstIndex + 1, secondIndex), "label", 39, 3, 0);
      const after = row(cue.words.slice(secondIndex + 1), "label", 39, 4, 0);
      const topWord = runs.find(run => run.row === 1)!;
      const lowerWord = runs.find(run => run.row === 2)!;
      shiftRow(0, topWord.x - topWord.ink.left, -first.ascent - 3 - before.descent);
      // The middle words rest on the lower title, in the step beside the upper one.
      // They never climb onto a title's letters, so a long upper title moves them aside.
      const rightEdge = (720 + capacity) / 2, leftEdge = (720 - capacity) / 2, gutter = 9;
      const topRight = topWord.x + topWord.ink.right, lowerLeft = lowerWord.x - lowerWord.ink.left;
      if (topRight + gutter + between.width <= rightEdge) {
        shiftRow(3, topRight + gutter, secondBaseline - second.ascent - 3 - between.descent);
      } else if (lowerLeft - gutter - between.width >= leftEdge) {
        shiftRow(3, lowerLeft - gutter - between.width, secondBaseline);
      } else {
        shiftRow(3, topRight - between.width, -first.ascent - 3 - before.descent);
      }
      shiftRow(4, lowerWord.x + lowerWord.ink.right - after.width, secondBaseline + second.descent + after.ascent + 3);
      runs.forEach(run => { run.anchored = true; });
    } else if (cue.mode === "sentence") {
      // A flowing editorial sentence is deliberately different from a headline stack.
      const items = cue.words.map((word, i) => measure(word,
        cue.heroIndices.includes(i) ? "hero" : (cue.seed >>> 6) % 2 ? "script" : "label",
        cue.heroIndices.includes(i) ? headlineSize * .79 : (cue.seed >>> 6) % 2 ? scriptSize * .92 : 44));
      const gap = 10;
      const span = (line: typeof items) => line.reduce((sum, item) => sum + item.ink.advance, 0) +
        gap * Math.max(0, line.length - 1) - (line[line.length - 1]?.ink.advance ?? 0) +
        (line[line.length - 1]?.ink.right ?? 0) + (line[0]?.ink.left ?? 0);
      let lines = [items];
      if (span(items) > capacity - 24 && items.length > 1) {
        let cost = Infinity;
        for (let split = 1; split < items.length; split++) {
          const first = items.slice(0, split); const second = items.slice(split);
          const a = span(first); const b = span(second);
          const score = Math.max(a, b) + Math.abs(a - b) * .28;
          if (score < cost) { cost = score; lines = [first, second]; }
        }
      }
      const fit = Math.min(1, (capacity - 24) / Math.max(1, ...lines.map(span)));
      let baseline = 0; let previousDescent = 0;
      lines.forEach((line, index) => {
        const fitted = line.map(item => measure(item.word, item.role, item.requested * fit));
        const ascent = Math.max(...fitted.map(item => item.ink.ascent));
        if (index) baseline += previousDescent + ascent + 4;
        let x = 360 - span(line) * fit / 2 + fitted[0].ink.left;
        fitted.forEach(item => {
          runs.push({ ...item, row: 10 + index, x, y: baseline, anchored: true });
          x += item.ink.advance + gap * fit;
        });
        previousDescent = Math.max(...fitted.map(item => item.ink.descent));
      });
    } else {
      const heroes = cue.heroIndices.map(i => cue.words[i]);
      const first = cue.heroIndices[0];
      const last = cue.heroIndices[cue.heroIndices.length - 1];
      const before = cue.words.slice(0, first);
      const after = cue.words.slice(last + 1);
      let heroTop = 0; let heroBottom = 0;
      let usedBefore = false; let usedAfter = false;
      if (cue.mode === "duet" || cue.mode === "rail") {
        // One horizontal composition, with a shared baseline and no arbitrary text collisions.
        const helper = cue.mode === "duet" ? before : after;
        const mainWidth = naturalWidth(heroes, "hero", headlineSize * .92);
        const helperWidth = naturalWidth(helper, "script", scriptSize);
        const fit = Math.min(1, (capacity - 28) / Math.max(1, mainWidth + helperWidth + 10));
        const main = row(heroes, "hero", headlineSize * .92 * fit, 1, 0);
        const note = row(helper, "script", scriptSize * fit, cue.mode === "duet" ? 0 : 3, 0);
        const left = (720 - main.width - note.width - 10 * fit) / 2;
        shiftRow(cue.mode === "duet" ? 0 : 1, left, 0);
        shiftRow(cue.mode === "duet" ? 1 : 3,
          left + (cue.mode === "duet" ? note.width : main.width) + 10 * fit, 0);
        runs.forEach(run => { run.anchored = true; });
        usedBefore = cue.mode === "duet"; usedAfter = cue.mode === "rail";
        heroTop = -Math.max(main.ascent, note.ascent);
        heroBottom = Math.max(Math.min(main.descent, base * .02), note.descent);
      } else {
        const offset = cue.mode === "diagonal" ? (cue.seed % 2 ? -1 : 1) * (captionSix ? 18 : 34) : 0;
        const main = row(heroes, "hero", headlineSize * (cue.mode === "double" ? .84 : 1), 1, 0, offset);
        heroTop = -main.ascent;
        heroBottom = captionSix || cue.casing !== "upper" ? main.descent : Math.min(main.descent, base * .02);
      }
      const inset = cue.mode === "inset";
      const topRole: Role = cue.mode === "side-note" || inset ? "label" : "script";
      const bottomRole: Role = inset ? "label" : "script";
      const upper = row(usedBefore ? [] : before, topRole, topRole === "script" ? scriptSize : inset ? 39 : 44, 0, 0,
        cue.mode === "signature" ? -18 : 0);
      // Helpers clear the entire main word, so no letter is ever struck through.
      const referenceGap = Math.max(6, base * .08);
      if (!usedBefore) runs.filter(run => run.row === 0).forEach(run => {
        run.y = heroTop - (captionSix ? referenceGap : 3) - upper.descent;
      });
      const lower = row(usedAfter ? [] : after, bottomRole, bottomRole === "script" ? scriptSize : 39, 3, 0,
        cue.mode === "signature" ? 18 : 0);
      if (!usedAfter) runs.filter(run => run.row === 3).forEach(run => {
        run.y = heroBottom + lower.ascent + (captionSix ? referenceGap : 3);
      });
      const headlines = runs.filter(run => run.role === "hero");
      const headlineLeft = Math.min(...headlines.map(run => run.x - run.ink.left));
      const headlineRight = Math.max(...headlines.map(run => run.x + run.ink.right));
      const alignHelper = (rowIndex: number, edge: "left" | "right") => {
        const entries = runs.filter(run => run.row === rowIndex);
        if (!entries.length) return;
        const left = entries[0].x - entries[0].ink.left;
        const last = entries[entries.length - 1];
        const right = last.x + last.ink.right;
        const target = edge === "left" ? headlineLeft : headlineRight;
        const delta = clamp(target - (edge === "left" ? left : right),
          (720 - capacity) / 2 - left, (720 + capacity) / 2 - right);
        entries.forEach(run => { run.x += delta; });
      };
      if (cue.mode === "signature" || cue.mode === "diagonal" || cue.mode === "double" || inset || cue.mode === "pocket") {
        alignHelper(0, "left");
        alignHelper(3, "right");
      } else if (cue.mode === "side-note") alignHelper(3, "right");
      if (inset || cue.mode === "pocket") {
        nestLuxeHelper(headlines, runs.filter(run => run.row === 0), -1, capacity, `${cue.seed}:top`);
        nestLuxeHelper(headlines, runs.filter(run => run.row === 3), 1, capacity, `${cue.seed}:bottom`);
      }
    }
    // Reference corner helpers stay attached to the headline as words reveal.
    if (captionSix) runs.forEach(run => { run.anchored = true; });
    const top = Math.min(...runs.map(run => run.y - run.ink.ascent));
    const bottom = Math.max(...runs.map(run => run.y + run.ink.descent));
    const left = Math.min(...runs.map(run => run.x - run.ink.left));
    const right = Math.max(...runs.map(run => run.x + run.ink.right));
    // Keep the headline's baseline fixed across two- and three-row compositions.
    const anchor = height * positionY;
    const mainRun = runs.find(run => run.role === "hero");
    const target = mainRun ? anchor - mainRun.y + mainRun.ink.ascent * .5 : anchor - (top + bottom) / 2;
    const translateY = config?.showcase || config?.onLayout || config?.naturalWrap
      ? height * positionY - (top + bottom) / 2
      : clamp(target, height * .5 - top, height * .9 - bottom);
    return { ...cue, runs: runs.map(run => ({ ...run, y: run.y + translateY })),
      top: top + translateY, bottom: bottom + translateY, left, right, fit: smallest };
  });
};

// Saturated tones of one hue. No white reflection bands or pale highlights.
const PALETTES = {
  blue: ["#2175b5", "#175d96", "#103f6a"],
  teal: ["#14968c", "#0c7974", "#075451"],
  purple: ["#9140d2", "#7327b1", "#501681"],
  green: ["#31985b", "#227c47", "#175934"],
};
const GLASS_PALETTES = {
  blue: ["#669cd2", "#3974ad", "#28588c"],
  teal: ["#60bbaa", "#369d8c", "#217866"],
  purple: ["#b076db", "#9154c3", "#703ba4"],
  green: ["#6ac38c", "#469e69", "#30784b"],
};
/** keep: a halo or depth copy, which keeps its own color when a text color is picked. */
const InkText: React.FC<{ run: Run; fill: string; keep?: boolean }> = ({ run, fill, keep }) =>
  <text data-paint={keep ? "keep" : undefined} x={run.x} y={run.y} fontFamily={`"${run.family}"`} fontWeight={run.weight}
    fontStyle={run.style} fontSize={run.size} fill={fill} stroke="none"
    letterSpacing={run.tracking}
    style={{ fontSynthesis: "none", whiteSpace: "pre", textRendering: "geometricPrecision" }}>{run.text}</text>;

export const Luxe: React.FC<LuxeProps> = ({ sourceConfig = SOURCE, styleConfig, presentationConfig, reducedMotion = false }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const canvasHeight = height * 720 / width;
  const captionSix = styleConfig?.heroTreatment === "caption-six";
  const settled = styleConfig?.naturalWrap === true;
  const motionReduced = reducedMotion || presentationConfig?.reducedMotion === true;
  const uid = `luxe-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const cues = useMemo(() => compileLuxe(sourceConfig, captionSix), [sourceConfig, captionSix]);
  const needsHindi = useMemo(() => cues.some(cue => cue.words.some(word => hindi(word.text))), [cues]);
  const fontKey = `${needsHindi}:${captionSix}`;
  const [ready, setReady] = useState<string | null>(null);
  const sizes = usePartSizes(presentationConfig);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    setReady(null);
    const handle = delayRender("Loading Luxe typography");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void loadFonts(needsHindi, captionSix).then(() => { if (!disposed) setReady(fontKey); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [needsHindi, captionSix, fontKey, delayRender, continueRender, cancelRender]);
  const picked = usePartFonts(presentationConfig?.parts);
  const pickedFaces = picked.faces, pickedReady = picked.ready;
  const spacing = useSpacing(presentationConfig);
  const layouts = useMemo(() => {
    if (ready !== fontKey || !pickedReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Luxe requires a text-measurement canvas.");
    extraTracking = spacing;
    const cap = evenSizeCap(layoutLuxe(cues, ctx, canvasHeight, styleConfig, 1, NO_SIZES, pickedFaces).map(layout => layout.fit));
    return layoutLuxe(cues, ctx, canvasHeight, styleConfig, cap, sizes, pickedFaces);
  }, [ready, fontKey, cues, canvasHeight, styleConfig, sizes, pickedFaces, pickedReady, spacing]);
  const onLayout = presentationConfig?.onLayout ?? styleConfig?.onLayout;
  useLayoutEffect(() => {
    if (onLayout && layouts.length) onLayout((Math.max(...layouts.map(layout => layout.bottom - layout.top)) + (captionSix ? 24 : 0)) * width / 720);
  }, [onLayout, layouts, width, captionSix]);
  const cue = activeCue(layouts, now) ?? (settled ? layouts[0] : null);
  useCueMotion(cue?.startMs, cue?.endMs);
  const parts = presentationConfig?.parts;
  const motion = useContext(CueMotionContext)?.animation;
  const mainGradient = parts?.main?.gradient, mainColor = mainGradient?.stops[0]?.color ?? parts?.main?.color;
  // A blended headline takes its color from the video, so a chosen color lifts it out of the blend.
  const painted = !!mainColor || !!cue?.words.some(word => presentationConfig?.wordStyles?.[word.id]?.overrideColor);
  const glass = !!cue?.glass && !painted;
  const paletteKey = styleConfig?.palette && styleConfig.palette !== "mixed" ? styleConfig.palette : cue?.color ?? "teal";
  const palette = mainColor ? [lighten(mainColor, .1), mainColor, darken(mainColor, .28)] : (glass ? GLASS_PALETTES : PALETTES)[paletteKey];
  const spokenEnd = cue ? Math.max(...cue.words.map(word => word.endMs)) : 0;
  const exitMs = cue ? Math.min(100, Math.max(0, cue.endMs - spokenEnd)) : 0;
  const exit = cue && !settled && !motionReduced && exitMs > 0 ? smooth((cue.endMs - now) / exitMs) : 1;
  const reveal = (run: Run) => {
    if (settled) return { visible: true, p: 1, opacity: 1 };
    // This is the sole reveal clock for every role, including the headline.
    const age = now - run.word.startMs;
    if (age < 0) return { visible: false, p: 0, opacity: 0 };
    if (chosenEntrance(motion, run.role === "hero", run.word.id)) return { visible: true, p: 1, opacity: 1 };
    const available = Math.max(1, Math.min(run.word.endMs, cue?.endMs ?? Infinity) - run.word.startMs);
    // Blend Cursor builds slower, like Fourfold: long words take their time, quick ones stay short.
    const duration = captionSix ? Math.max(1, Math.min(420, Math.max(170, available * 1.1), available * .95))
      : Math.max(1, Math.min(run.role === "hero" ? 240 : 190, available * .85));
    const firstFrame = 1000 / fps * .3;
    return { visible: true,
      p: motionReduced ? 1 : ease((age + firstFrame) / duration),
      opacity: motionReduced ? 1 : ease((age + firstFrame) / Math.max(1, captionSix ? duration * .55 : Math.min(70, available * .3))) };
  };
  // Like NeonOverlap, helper rows grow around their spoken content. Future words
  // reserve layout space but cannot leave the first spoken word stranded at an edge.
  const rowOffsets = new Map<number, number>();
  if (cue) for (const row of new Set(cue.runs.filter(run => run.role !== "hero" && !run.anchored).map(run => run.row))) {
    const entries = cue.runs.filter(run => run.row === row && !run.anchored && run.role !== "hero");
    const first = entries[0];
    const last = entries[entries.length - 1];
    const fullWidth = last.x + last.ink.right - first.x + first.ink.left;
    let occupied = 0;
    entries.forEach((run, index) => {
      const state = reveal(run);
      const span = index === 0 ? run.ink.left + run.ink.right :
        run.x + run.ink.right - entries[index - 1].x - entries[index - 1].ink.right;
      occupied += span * (index === 0 ? Number(state.visible) : smooth(state.p));
    });
    rowOffsets.set(row, (fullWidth - occupied) / 2);
  }
  const gradients = () => cue?.runs.filter(run => run.role === "hero").map(run => {
    const line = mainGradient && gradientLine(mainGradient.angle);
    const width = run.ink.left + run.ink.right, height = run.ink.ascent + run.ink.descent;
    const left = run.x - run.ink.left, top = run.y - run.ink.ascent;
    return <linearGradient key={run.word.id} id={`${uid}-ink-${cue.runs.indexOf(run)}`} gradientUnits="userSpaceOnUse"
      x1={line ? left + line.x1 * width : 0} y1={line ? top + line.y1 * height : top}
      x2={line ? left + line.x2 * width : 0} y2={line ? top + line.y2 * height : run.y + run.ink.descent}>
      {mainGradient ? mainGradient.stops.map((stop, i) => <stop key={i} offset={stop.position / 100} stopColor={stop.color} />)
        : palette.map((color, i) => <stop key={i} offset={i / (palette.length - 1)} stopColor={color} />)}
    </linearGradient>;
  });
  // Blend Cursor: words close in from all four sides to form the block, softly blurred.
  const sideRows = cue && captionSix ? rowsByBaseline(cue.runs.filter(run => !run.nested), run => run.y, run => run.x, 8) : undefined;
  const renderRun = (run: Run, depth = false, halo = false, inkOnly = false) => {
    if (!cue) return null;
    const hero = run.role === "hero";
    const state = reveal(run);
    if (!state.visible) return null;
    const { p, opacity } = state;
    const horizontal = run.nested ? 0 : cue.mode === "duet" ? hero ? 8 : -5 :
      cue.mode === "rail" ? hero ? -8 : 5 : cue.mode === "diagonal" ? (cue.seed % 2 ? -6 : 6) : 0;
    const dy = run.nested ? 0 : cue.mode === "sentence" ? 4 : hero ? 9 : run.row === 0 ? -4 : 4;
    const [sideX, sideY] = sideRows && !run.nested ? fourSideFrom(run, sideRows, hero, 30) : [horizontal, dy];
    const scale = hero && !run.nested ? .99 + .01 * p : 1;
    const center = run.x + (run.ink.right - run.ink.left) / 2;
    const recenter = hero || run.anchored || chosenEntrance(motion, false, run.word.id) ? 0 : rowOffsets.get(run.row) ?? 0;
    const look = halo ? undefined : depth ? `url(#${uid}-hero-depth)` : hero ? `url(#${uid}-${glass && !captionSix && !inkOnly ? "glass-bevel" : "bevel"})` : `url(#${uid}-helper-glow)`;
    const soft = sideRows && p < 1 ? `blur(${(1 - p) * 4}px)` : undefined;
    return <MotionWord key={run.word.id} id={run.word.id} startMs={run.word.startMs} size={run.size} main={hero}><g opacity={opacity} data-luxe-word={run.word.id}
      data-start-ms={run.word.startMs} data-luxe-role={run.role}
      filter={soft ? undefined : look} style={soft ? { filter: [look, soft].filter(Boolean).join(" ") } : undefined}
      transform={`translate(${center + recenter + sideX * (1 - p)} ${run.y + sideY * (1 - p)}) scale(${scale}) translate(${-center} ${-run.y})`}>
      <InkText run={run} keep={halo || depth} fill={halo ? palette[0] : depth ? "#000000" : captionSix ? "#ffffff" : hero ? `url(#${uid}-ink-${cue.runs.indexOf(run)})` : parts?.helper?.color ?? "#fffaf2"} />
    </g></MotionWord>;
  };
  const background = sourceConfig.background;
  const ink = cue ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
    aria-hidden="true" style={{ overflow: "visible" }}>
    <defs>{captionSix ? null : gradients()}<filter id={`${uid}-bevel`} x="-20%" y="-40%" width="140%" height="200%">
      <feDropShadow dx="1.4" dy="3" stdDeviation=".8" floodColor="#101121" floodOpacity=".8" />
    </filter></defs>
    <g opacity={exit}>{cue.runs.filter(run => run.role === "hero").map(run => renderRun(run, false, false, true))}</g>
  </svg> : null;
  if (styleConfig?.inkLayer === "only") return glass
    ? <AbsoluteFill style={{ color: "#ffffff", pointerEvents: "none", textTransform: captionSix ? "uppercase" : undefined }}>{ink}</AbsoluteFill> : null;
  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? (captionSix ? "#151515" : "#15151a"), overflow: "hidden", pointerEvents: "none",
    isolation: captionSix ? undefined : "isolate" }}>
    {background?.src ? background.kind === "image" ? <Img src={asset(background.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(background.src)} muted={background.muted ?? false}
        volume={number(background.volume, 1, 0, 1)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {/* Outside cue layers: stays steady through pauses, transitions, and layout changes. */}
    {!captionSix && !styleConfig?.showcase && background?.src ? <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.70) 12%, rgba(0,0,0,.48) 25%, rgba(0,0,0,.20) 38%, rgba(0,0,0,.06) 49%, transparent 60%)" }} /> : null}
    {!captionSix && glass ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs><filter id={`${uid}-hero-halo`} x="-25%" y="-60%" width="150%" height="220%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="4.5" result="bloom" />
        <feComposite in="bloom" in2="SourceAlpha" operator="out" result="outer" />
        <feFlood floodColor={palette[0]} floodOpacity=".32" />
        <feComposite in2="outer" operator="in" />
      </filter></defs>
      <g opacity={exit} filter={`url(#${uid}-hero-halo)`}>{cue.runs.filter(run => run.role === "hero").map(run => renderRun(run, false, true))}</g>
    </svg> : null}
    {glass ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        {/* Depth exists only outside the original glyph silhouette, so the
            white face still blends directly with the unmodified video. */}
        <filter id={`${uid}-hero-depth`} x="-20%" y="-30%" width="140%" height="170%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="0.8" result="expanded" />
          <feOffset in="expanded" dx="1.3" dy="2.4" result="shifted" />
          <feComposite in="shifted" in2="SourceAlpha" operator="out" result="outerDepth" />
          <feGaussianBlur in="outerDepth" stdDeviation="0.3" result="blurredDepth" />
          <feComposite in="blurredDepth" in2="SourceAlpha" operator="out" result="softDepth" />
          <feFlood floodColor="#000000" floodOpacity="0.68" />
          <feComposite in2="softDepth" operator="in" result="depth" />
          <feComposite in="expanded" in2="SourceAlpha" operator="out" result="rim" />
          <feFlood floodColor="#000000" floodOpacity="0.42" />
          <feComposite in2="rim" operator="in" result="edge" />
          <feMerge><feMergeNode in="depth" /><feMergeNode in="edge" /></feMerge>
        </filter>
      </defs>
      <g opacity={exit}>{cue.runs.filter(run => run.role === "hero").map(run => renderRun(run, true))}</g>
    </svg> : null}
    {captionSix && glass ? styleConfig?.inkLayer === "skip" ? null : <AbsoluteFill data-blend-cursor="true"
      style={{ color: "#ffffff", mixBlendMode: "difference", textTransform: "uppercase" }}>
      {ink}
    </AbsoluteFill> : glass && styleConfig?.inkLayer !== "skip" ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      aria-hidden="true" data-luxe-glass={paletteKey}
      style={{ position: "absolute", inset: 0, overflow: "visible", mixBlendMode: "difference" }}>
      <defs>{gradients()}
        <filter id={`${uid}-glass-bevel`} x="-20%" y="-40%" width="140%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="bump" />
          <feSpecularLighting in="bump" surfaceScale="3" specularConstant=".7" specularExponent="22" lightingColor="#ffffff" result="light">
            <feDistantLight azimuth="225" elevation="52" />
          </feSpecularLighting>
          <feComposite in="light" in2="SourceAlpha" operator="in" result="highlight" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="highlight" /></feMerge>
        </filter>
      </defs>
      <g opacity={exit}>{cue.runs.filter(run => run.role === "hero").map(run => renderRun(run))}</g>
    </svg> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      role="img" aria-label={cue.words.map(word => word.text).join(" ")}
      data-luxe-layout={cue.mode}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <filter id={`${uid}-bevel`} x="-20%" y="-40%" width="140%" height="200%">
          <feDropShadow dx="1.4" dy="3" stdDeviation=".8" floodColor="#101121" floodOpacity=".8" />
        </filter>
        {!glass && !captionSix ? gradients() : null}
        <filter id={`${uid}-helper-glow`} x="-25%" y="-70%" width="150%" height="240%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="soft" />
          <feFlood floodColor={captionSix ? "#ffffff" : "#fff8eb"} floodOpacity={captionSix ? .35 : .62} />
          <feComposite in2="soft" operator="in" result="halo" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="tight" />
          <feFlood floodColor={captionSix ? "#ffffff" : "#fffaf2"} floodOpacity={captionSix ? .24 : .38} />
          <feComposite in2="tight" operator="in" result="innerGlow" />
          {captionSix ? <feDropShadow in="SourceAlpha" dx="0" dy="2.5" stdDeviation="2" floodColor="#000000" floodOpacity=".72" result="raisedShadow" /> : null}
          <feMerge>{captionSix ? <feMergeNode in="raisedShadow" /> : null}<feMergeNode in="halo" /><feMergeNode in="innerGlow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g opacity={exit}>
        {cue.runs.filter(run => !glass || run.role !== "hero").map(run => renderRun(run))}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolveLuxeMetadata = ({ props }: { props: LuxeProps }) => {
  const source = props.sourceConfig ?? SOURCE;
  const { words } = normalizeWords(source);
  const duration = words.reduce((end, word) => Math.max(end, word.endMs + 170),
    number(source.durationMs, 1000, 1000, 86400000));
  return { fps: 30, durationInFrames: Math.max(1, Math.ceil(duration * 30 / 1000)) };
};
