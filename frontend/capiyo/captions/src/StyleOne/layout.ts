import { wordsText, type CaptionCue, type CaptionWord } from "../CaptionEngine/types";
import type { FontSpec, StyleOneConfig } from "./config";
import { measureInk, type Ink } from "./metrics";
import { fitHelperPockets, fitSurroundingHelpers, fitWordPockets, helperInkCollision,
  type InkObstacle, type PocketPart, type PocketEdge, type HelperFlow } from "./pockets";
import { getInlineAccentMaxScale, type EntryMotion } from "./motion";
import type { GlyphSlice, KineticEntry } from "../CaptionMotion/kinetic";

type Role = "hero" | "helper" | "soft" | "plain";
type Span = {
  words: CaptionWord[];
  text: string;
  role: Role;
  font: FontSpec;
  size: number;
  tracking: number;
  ink: Ink;
  inlineTokens?: { word: CaptionWord; text: string; offset: number; size: number; ink: Ink; accented: boolean }[];
};
type Fragment = { span: Span; x: number; baseline: number; pocketSide?: -1 | 1; pocketEdge?: PocketEdge; entryMotion?: EntryMotion };
type Obstacle = InkObstacle;

export type PlacedFragment = {
  text: string;
  role: Role;
  font: FontSpec;
  size: number;
  tracking: number;
  x: number;
  baseline: number;
  left: number;
  top: number;
  width: number;
  height: number;
  startFrame: number;
  endFrame: number;
  readabilityLimited: boolean;
  pocketSide?: -1 | 1;
  pocketEdge?: PocketEdge;
  entryMotion?: EntryMotion;
  tokens: {
    key: string;
    text: string;
    x: number;
    startFrame: number;
    size: number;
    width: number;
    accented: boolean;
    entry?: KineticEntry;
    slices?: GlyphSlice[];
  }[];
};

const displayedText = (words: CaptionWord[], config: StyleOneConfig) => {
  const text = wordsText(words);
  return config.layout.textCase === "lowercase" ? text.toLowerCase()
    : config.layout.textCase === "uppercase" ? text.toUpperCase() : text;
};

const displayedWord = (word: CaptionWord, config: StyleOneConfig) =>
  displayedText([word], config);

const PREFIXES = [
  "under", "inter", "trans", "super", "extra", "multi", "counter",
  "anti", "post", "over", "fore", "auto", "down",
  "dis", "mis", "non", "pre", "sub", "pro", "con",
  "un", "re", "in", "im", "de", "ex",
];

const SUFFIXES = [
  "straight", "throughs", "through",
  "action", "bility", "lessly", "tional", "ically",
  "weight", "ground", "people", "stream", "growth",
  "break", "maker", "proof", "scope", "state",
  "tions", "sions", "ments", "fully", "ables", "ibles",
  "tion", "sion", "ment", "able", "ible", "ness", "less",
  "ship", "hood", "ward", "like", "wise", "fold",
  "ting", "sing", "ling", "ring", "ning", "king",
  "iest", "ally", "ence", "ance", "full",
  "ing", "ies", "ers", "est", "ist", "ism", "ity",
];

const DIGRAPHS = new Set(["th", "ch", "sh", "ph", "wh", "gh", "qu", "ck", "ng"]);

export const findHyphenBreak = (text: string): { part1: string; part2: string } | null => {
  const match = text.match(/[.,!?;:'"()]+$/);
  const trailing = match ? match[0] : "";
  const clean = trailing ? text.slice(0, -trailing.length) : text;
  if (clean.length < 7) return null;

  const hyphens: number[] = [];
  for (let i = 2; i < clean.length - 2; i++) {
    if (clean[i] === "-") hyphens.push(i);
  }
  if (hyphens.length > 0) {
    const mid = clean.length / 2;
    hyphens.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    return {
      part1: clean.slice(0, hyphens[0] + 1),
      part2: clean.slice(hyphens[0] + 1) + trailing,
    };
  }

  const mid = clean.length / 2;
  const candidates: number[] = [];

  for (const prefix of PREFIXES) {
    if (clean.toLowerCase().startsWith(prefix) && clean.length - prefix.length >= 3 && prefix.length >= 3) {
      candidates.push(prefix.length);
    }
  }

  for (const suffix of SUFFIXES) {
    if (clean.toLowerCase().endsWith(suffix) && clean.length - suffix.length >= 3 && suffix.length >= 3) {
      candidates.push(clean.length - suffix.length);
    }
  }

  const isVowel = (c: string) => "aeiouy".includes(c.toLowerCase());
  for (let i = 3; i < clean.length - 3; i++) {
    const c1 = clean[i - 1].toLowerCase();
    const c2 = clean[i].toLowerCase();
    if (!isVowel(c1) && !isVowel(c2) && /[a-z]/i.test(c1) && /[a-z]/i.test(c2)) {
      if (!DIGRAPHS.has(c1 + c2)) {
        candidates.push(i);
      }
    }
  }

  for (let i = 3; i < clean.length - 3; i++) {
    const c1 = clean[i - 1].toLowerCase();
    const c2 = clean[i].toLowerCase();
    if (isVowel(c1) && !isVowel(c2) && /[a-z]/i.test(c1) && /[a-z]/i.test(c2)) {
      const next = clean[i + 1]?.toLowerCase() ?? "";
      if (!DIGRAPHS.has(c2 + next)) {
        candidates.push(i);
      }
    }
  }

  if (candidates.length === 0) {
    candidates.push(Math.round(mid));
  }

  candidates.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  const splitIdx = candidates[0];
  return {
    part1: clean.slice(0, splitIdx) + "-",
    part2: clean.slice(splitIdx) + trailing,
  };
};

export const splitLongWord = (
  word: CaptionWord,
  font: FontSpec,
  size: number,
  tracking: number,
  maxWidth: number,
): CaptionWord[] => {
  const ink = measureInk(word.text, font, size, tracking);
  if (ink.width <= maxWidth) return [word];
  // Preserve joined scripts and combining marks. A Latin overflow may hyphenate;
  // arbitrary character cuts must never break a shaped grapheme in another script.
  if (!/^[A-Za-z0-9'’.,!?;:()-]+$/.test(word.text)) return [word];

  const breakResult = findHyphenBreak(word.text);
  if (!breakResult) return [word];

  const totalChars = word.text.length;
  const part1Chars = Math.max(1, breakResult.part1.length - (breakResult.part1.endsWith("-") ? 1 : 0));
  const ratio = Math.min(0.9, Math.max(0.1, part1Chars / totalChars));
  const duration = Math.max(0, word.endMs - word.startMs);
  const midMs = Math.round(word.startMs + duration * ratio);

  const part1: CaptionWord = {
    ...word,
    id: `${word.id}-h1`,
    text: breakResult.part1,
    startMs: word.startMs,
    endMs: midMs,
  };

  const part2: CaptionWord = {
    ...word,
    id: `${word.id}-h2`,
    text: breakResult.part2,
    startMs: midMs,
    endMs: word.endMs,
  };

  const part2Splits = splitLongWord(part2, font, size, tracking, maxWidth);
  return [part1, ...part2Splits];
};

const makeSpan = (
  words: CaptionWord[], role: Role, config: StyleOneConfig, multiplier = 1, accentIds: string[] = [],
): Span => {
  const { layout, fonts } = config;
  const font = role === "hero" ? fonts.hero : role === "plain" ? fonts.plain
    : role === "soft" ? fonts.soft : fonts.helper;
  const requestedSize = (role === "hero" ? layout.heroFontSize : role === "plain" ? layout.plainFontSize
    : layout.heroFontSize * (role === "soft" ? layout.softRatio : layout.helperRatio)) * multiplier;
  // Pocket searches may reduce a helper slightly, but never below its reading floor.
  const size = role === "hero" ? requestedSize : Math.max(requestedSize,
    role === "plain" ? layout.minPlainFontSize : layout.minHelperFontSize);
  const tracking = role === "hero" ? layout.heroTracking : role === "plain" ? layout.supportTracking
    : role === "soft" ? layout.softTracking : layout.helperTracking;
  const text = displayedText(words, config);
  const ink = measureInk(text, font, size, tracking, role !== "plain");
  if (role !== "plain" || !config.inlineAccent.enabled || !words.some((word) => accentIds.includes(word.id))) {
    return { words, text, role, font, size, tracking, ink };
  }
  // Reserve the enlarged word and pulse before playback: neighbors never jump or overlap.
  let pen = 0;
  const inlineTokens = words.map((word) => {
    const accented = accentIds.includes(word.id);
    const tokenSize = size * (accented ? config.inlineAccent.sizeMultiplier : 1);
    const tokenText = displayedWord(word, config);
    const tokenInk = measureInk(tokenText, font, tokenSize, tracking);
    const maximumScale = accented ? getInlineAccentMaxScale(config.inlineAccent) : 1;
    // Match the SVG's pivot and reserve the real glyph overhangs, rotation, and
    // movement. The static size multiplier is already included in tokenSize.
    const centerX = tokenInk.advance / 2;
    const centerY = -tokenSize * 0.3;
    const sin = accented ? Math.sin(config.inlineAccent.jiggle * Math.PI / 180) : 0;
    const horizontalReach = Math.max(Math.abs(tokenInk.left - centerX), Math.abs(tokenInk.right - centerX));
    const verticalReach = Math.max(Math.abs(tokenInk.top - centerY), Math.abs(tokenInk.bottom - centerY));
    // A readable fit may shrink the requested font to its configured floor,
    // while the animation's translation remains tied to canvas scale.
    const nudge = accented ? config.inlineAccent.jiggle * Math.max(1, size / layout.minPlainFontSize) : 0;
    const bounds = accented ? {
      left: centerX + (Math.min(0, tokenInk.left - centerX) - verticalReach * sin) * maximumScale - nudge,
      right: centerX + (Math.max(0, tokenInk.right - centerX) + verticalReach * sin) * maximumScale + nudge,
      top: centerY + (Math.min(0, tokenInk.top - centerY) - horizontalReach * sin) * maximumScale,
      bottom: centerY + (Math.max(0, tokenInk.bottom - centerY) + horizontalReach * sin) * maximumScale,
    } : tokenInk;
    pen += tokenInk.left - bounds.left;
    const token = { word, text: tokenText, offset: pen, size: tokenSize, ink: tokenInk, accented, bounds };
    pen += measureInk(`${tokenText} `, font, tokenSize, tracking).advance + bounds.right - tokenInk.right;
    return token;
  });
  const left = Math.min(...inlineTokens.map((token) => token.offset + token.bounds.left));
  const right = Math.max(...inlineTokens.map((token) => token.offset + token.bounds.right));
  const top = Math.min(...inlineTokens.map((token) => token.bounds.top));
  const bottom = Math.max(...inlineTokens.map((token) => token.bounds.bottom));
  return { words, text, role, font, size, tracking, inlineTokens,
    ink: { ...ink, left, right, top, bottom, width: right - left, height: bottom - top, advance: pen, skyline: [] } };
};

/** Closest legal ink edge for this horizontal window, with real contour clearance. */
const clearance = (obstacles: Obstacle[], x: number, width: number, pad: number, dir: -1 | 1) => {
  const left = x - pad;
  const right = x + width + pad;
  let edge = 0;
  for (const obstacle of obstacles) {
    if (obstacle.x + obstacle.width <= left || obstacle.x >= right) continue;
    if (!obstacle.ink || !obstacle.ink.skyline.length) {
      edge = dir < 0 ? Math.min(edge, obstacle.top) : Math.max(edge, obstacle.bottom);
      continue;
    }
    const { skyline, step } = obstacle.ink;
    const first = Math.max(0, Math.floor((left - obstacle.x) / step));
    const last = Math.min(skyline.length - 1, Math.ceil((right - obstacle.x) / step));
    for (let column = first; column <= last; column++) {
      const contour = skyline[column];
      // Empty pixels are space, not a synthetic ascender/descender.
      if (dir < 0 && Number.isFinite(contour.top)) edge = Math.min(edge, (obstacle.baseline ?? 0) + contour.top - step);
      if (dir > 0 && Number.isFinite(contour.bottom)) edge = Math.max(edge, (obstacle.baseline ?? 0) + contour.bottom + step);
    }
  }
  return edge;
};

const placeHelper = (
  span: Span, heroWidth: number, obstacles: Obstacle[], dir: -1 | 1,
  config: StyleOneConfig, canNest: boolean, alignRight: boolean,
  availableWidth: number, allowOtherSide: boolean, seed: string,
): Fragment[] => {
  const { layout } = config;
  const pad = Math.max(1.5, span.ink.cap * layout.sideClearance);
  const fallbackX = span.ink.width > heroWidth ? (heroWidth - span.ink.width) / 2
    : alignRight ? heroWidth - span.ink.width : 0;
  const fallbackLimit = clearance(obstacles, fallbackX, span.ink.width, pad, dir);
  let best: { fragments: Fragment[]; score: number } | null = null;
  if (canNest) {
    const scales = [...new Set([1, (1 + layout.helperMinScale) / 2, layout.helperMinScale])];
    for (const multiplier of scales) {
      const parts = new Map<string, PocketPart<Span>>();
      const part = (start: number, end: number) => {
        const key = `${start}:${end}`;
        const existing = parts.get(key);
        if (existing) return existing;
        const value = start === 0 && end === span.words.length && multiplier === 1 ? span
          : makeSpan(span.words.slice(start, end), span.role, config, multiplier);
        const result = { value, ink: value.ink, words: end - start };
        parts.set(key, result); return result;
      };
      const length = span.words.length;
      const partitions: PocketPart<Span>[][] = [[part(0, length)]];
      // This fallback keeps each phrase joined. The surrounding compositor
      // handles wrapping and side columns without inserting enlarged spaces.
      const result = fitHelperPockets({ partitions, obstacles, heroWidth, availableWidth,
        preferredSide: dir, allowOtherSide, sideClearance: layout.sideClearance,
        gapRatio: layout.gap, overhang: layout.overhang, minGain: layout.minNestGain,
        splitPenalty: layout.splitPenalty, variation: config.motion.randomize ? layout.pocketVariation : 0,
        seed });
      if (!result) continue;
      const score = result.score - (1 - multiplier) * 0.7;
      if (!best || score > best.score) {
        const topPieces = result.pieces.filter(p => p.side < 0);
        const bottomPieces = result.pieces.filter(p => p.side > 0);
        const topBaseline = topPieces.length ? Math.min(...topPieces.map(p => p.baseline)) : 0;
        const bottomBaseline = bottomPieces.length ? Math.max(...bottomPieces.map(p => p.baseline)) : 0;
        best = {
          score,
          fragments: result.pieces.map(piece => ({
            span: piece.part.value,
            x: piece.x,
            baseline: piece.side < 0 ? topBaseline : bottomBaseline,
            pocketSide: piece.side,
          })),
        };
      }
    }
  }
  if (best) return best.fragments;
  // Flat edges and genuinely crowded pockets keep the phrase together.
  const gap = Math.max(2, span.ink.cap * layout.gap);
  const heroTop = obstacles[0]?.top ?? 0;
  const heroBottom = obstacles[0]?.bottom ?? 0;
  const sideAnchor = dir < 0 ? heroTop + (heroBottom - heroTop) * 0.2
    : heroBottom - (heroBottom - heroTop) * 0.2;
  const centeredBaseline = sideAnchor - (span.ink.top + span.ink.bottom) / 2;
  const baseline = dir < 0
    ? Math.min(fallbackLimit - gap - span.ink.bottom, centeredBaseline)
    : Math.max(fallbackLimit + gap - span.ink.top, centeredBaseline);
  return [{ span, x: fallbackX, baseline, pocketSide: dir }];
};

const balancedRows = (words: CaptionWord[], role: Role, config: StyleOneConfig, width: number): Span[] => {
  const font = role === "soft" ? config.fonts.soft : config.fonts.helper;
  const requestedSize = config.layout.heroFontSize * (role === "soft" ? config.layout.softRatio : config.layout.helperRatio);
  const size = Math.max(requestedSize, config.layout.minHelperFontSize);
  const tracking = role === "soft" ? config.layout.softTracking : config.layout.helperTracking;
  const expandedWords = words.flatMap((word) => splitLongWord(word, font, size, tracking, width));
  const full = makeSpan(expandedWords, role, config);
  if (full.ink.width <= width || expandedWords.length < 2) return [full];
  let best: Span[] = [full];
  let bestWidth = Infinity;
  for (let split = 1; split < expandedWords.length; split++) {
    const rows = [makeSpan(expandedWords.slice(0, split), role, config), makeSpan(expandedWords.slice(split), role, config)];
    const widest = Math.max(rows[0].ink.width, rows[1].ink.width);
    const cost = widest + Math.abs(rows[0].ink.width - rows[1].ink.width) * 0.12;
    if (widest <= width && cost < bestWidth) { best = rows; bestWidth = cost; }
  }
  if (best.length > 1) return best;
  // Two rows may still be too wide. Wrap additional rows at word boundaries.
  const rows: Span[] = [];
  let pending: CaptionWord[] = [];
  for (const word of expandedWords) {
    if (pending.length && makeSpan([...pending, word], role, config).ink.width > width) {
      rows.push(makeSpan(pending, role, config));
      pending = [];
    }
    pending.push(word);
  }
  if (pending.length) rows.push(makeSpan(pending, role, config));
  return rows;
};

/** The clear space kept around the main word's letters, in all directions, as a share of its cap height. */
const HERO_CLEARANCE = .085;
/**
 * The text above the main word and the text below it end up the same distance from its letters. Each
 * side moves as one block, as close as it can get while keeping that space everywhere, sideways too, so
 * a word tucked beside a tall t or y keeps a margin from it.
 */
const evenClearance = (fragments: Fragment[], hero: Span): Fragment[] => {
  const obstacle: Obstacle = { x: 0, width: hero.ink.width, top: hero.ink.top, bottom: hero.ink.bottom, ink: hero.ink, baseline: 0 };
  const target = Math.max(3, hero.ink.cap * HERO_CLEARANCE);
  const middle = (hero.ink.top + hero.ink.bottom) / 2;
  const helpers = fragments.filter(fragment => fragment.span.role !== "hero");
  const centerOf = (fragment: Fragment) => fragment.baseline + (fragment.span.ink.top + fragment.span.ink.bottom) / 2;
  const beside = (fragment: Fragment) => fragment.pocketEdge === "left" || fragment.pocketEdge === "right";
  const range = hero.ink.cap * 2;
  const shifts = new Map<Fragment, number>();
  for (const dir of [-1, 1] as const) {
    const side = helpers.filter(fragment => !beside(fragment) && (dir < 0 ? centerOf(fragment) < middle : centerOf(fragment) >= middle));
    if (!side.length) continue;
    const others = helpers.filter(fragment => !side.includes(fragment));
    const clear = (shift: number) => side.every(fragment => !helperInkCollision(fragment.span.ink, fragment.x, fragment.baseline + shift, obstacle, target) &&
      others.every(other => !helperInkCollision(fragment.span.ink, fragment.x, fragment.baseline + shift,
        { x: other.x, width: other.span.ink.width, top: other.baseline + other.span.ink.top, bottom: other.baseline + other.span.ink.bottom,
          ink: other.span.ink, baseline: other.baseline }, 2)));
    // Far away (up for the text above, down for the text below) is legal; close in on the nearest legal spot.
    let near = range * dir, far = -range * dir;
    if (!clear(near)) continue;
    for (let i = 0; i < 24; i++) {
      const mid = (near + far) / 2;
      if (clear(mid)) near = mid; else far = mid;
    }
    for (const fragment of side) shifts.set(fragment, near);
  }
  return shifts.size ? fragments.map(fragment => shifts.has(fragment) ? { ...fragment, baseline: fragment.baseline + shifts.get(fragment)! } : fragment) : fragments;
};

const emphasisFragments = (
  cue: CaptionCue, config: StyleOneConfig, helperWidth: number, helperHeight: number, heroMultiplier: number,
): Fragment[] => {
  const fragments: Fragment[] = [];
  const { layout } = config;
  const hero = makeSpan(cue.heroWords, "hero", config, heroMultiplier);
  fragments.push({ span: hero, x: 0, baseline: 0 });
  const obstacles: Obstacle[] = [{ x: 0, width: hero.ink.width, top: hero.ink.top, bottom: hero.ink.bottom, ink: hero.ink }];
  if (layout.surrounding && layout.nesting && cue.nesting !== "off" && cue.helperPlacement === "natural") {
    const flows: HelperFlow<Span>[] = [];
    for (const [words, role, preferredSide] of [
      [cue.beforeWords, "helper", -1], [cue.afterWords, "soft", 1],
    ] as const) {
      if (!words.length) continue;
      const parts = new Map<string, PocketPart<Span>>();
      flows.push({ length: words.length, preferredSide, part: (from, to) => {
        const key = `${from}:${to}`;
        const cached = parts.get(key);
        if (cached) return cached;
        const span = makeSpan(words.slice(from, to), role, config);
        const part = { value: span, ink: span.ink, words: to - from };
        parts.set(key, part); return part;
      } });
    }
    const pocketOptions = { flows, hero: obstacles[0],
      availableWidth: helperWidth, availableHeight: helperHeight,
      sideClearance: layout.sideClearance, gapRatio: layout.gap,
      variation: config.motion.randomize ? layout.pocketVariation : 0,
      seed: `${config.motion.seed}:${cue.id}`, naturalGap: (previous: Span, next: Span) =>
        measureInk(`${previous.text} `, previous.font, previous.size, previous.tracking).advance -
          previous.ink.right + next.ink.left,
    };
    const arranged = fitWordPockets(pocketOptions) ?? fitSurroundingHelpers({ ...pocketOptions,
      maxFragments: layout.maxHelperFragments, split: layout.pocketSplit });
    if (arranged) {
      const pieces: Fragment[] = arranged.map(piece => ({ span: piece.part.value, x: piece.x,
        baseline: piece.baseline, pocketEdge: piece.edge,
        pocketSide: piece.edge === "above" ? -1 : piece.edge === "below" ? 1 : undefined,
      }));
      const proposed: Fragment[] = [];
      for (const piece of pieces) {
        const previous = proposed[proposed.length - 1];
        const normalGap = previous ? measureInk(`${previous.span.text} `, previous.span.font,
          previous.span.size, previous.span.tracking).advance - previous.span.ink.right + piece.span.ink.left : 0;
        if (previous && previous.span.role === piece.span.role && previous.span.font === piece.span.font &&
            Math.abs(previous.baseline - piece.baseline) <= .5 &&
            Math.abs(piece.x - previous.x - previous.span.ink.width - normalGap) <= .75) {
          const merged = makeSpan([...previous.span.words, ...piece.span.words], previous.span.role, config);
          previous.x += merged.ink.left - previous.span.ink.left;
          previous.span = merged;
          if (previous.pocketEdge !== piece.pocketEdge) previous.entryMotion = "still";
        } else proposed.push(piece);
      }
      // A complete independent audit protects the hero and both helper flows.
      // Reject the entire proposal if anything is missing, duplicated or colliding.
      const expected = [...cue.beforeWords, ...cue.afterWords].map(word => word.id).sort();
      const actual = proposed.flatMap(piece => piece.span.words.map(word => word.id)).sort();
      const occupied = [...obstacles];
      const safe = proposed.every(piece => {
        if (occupied.some(obstacle => helperInkCollision(piece.span.ink, piece.x, piece.baseline, obstacle, 1))) return false;
        occupied.push({ x: piece.x, width: piece.span.ink.width, baseline: piece.baseline,
          top: piece.baseline + piece.span.ink.top, bottom: piece.baseline + piece.span.ink.bottom, ink: piece.span.ink });
        return true;
      });
      if (safe && expected.length === actual.length && expected.every((id, index) => id === actual[index]))
        return evenClearance([...fragments, ...proposed], hero);
    }
  }
  const rowWidth = helperWidth;
  const before = cue.beforeWords.length
    ? balancedRows(cue.beforeWords, "helper", config, rowWidth) : [];
  const after = cue.afterWords.length
    ? balancedRows(cue.afterWords, "soft", config, rowWidth) : [];
  const above = cue.helperPlacement === "below" ? []
    : cue.helperPlacement === "above" ? [...before, ...after] : before;
  const below = cue.helperPlacement === "above" ? []
    : cue.helperPlacement === "below" ? [...before, ...after] : after;

  const sides: { rows: Span[]; dir: -1 | 1 }[] = [
    { rows: [...above].reverse(), dir: -1 }, { rows: below, dir: 1 },
  ];
  for (const side of sides) {
    side.rows.forEach((row, index) => {
      const placed = placeHelper(row, hero.ink.width, obstacles, side.dir, config,
        layout.nesting && cue.nesting !== "off", side.dir > 0, helperWidth,
        // Keep the sentence's reading order, even when the opposite edge is emptier.
        false,
        `${config.motion.seed}:${cue.id}:${row.role}:${index}`);
      for (const fragment of placed) {
        fragments.push(fragment);
        obstacles.push({
          x: fragment.x, width: fragment.span.ink.width,
          top: fragment.baseline + fragment.span.ink.top,
          bottom: fragment.baseline + fragment.span.ink.bottom,
          ink: fragment.span.ink, baseline: fragment.baseline,
        });
      }
    });
  }
  return evenClearance(fragments, hero);
};

const positionFragments = (
  fragments: Fragment[], cue: CaptionCue, config: StyleOneConfig, fps: number,
  canvasScale: number, centerX: number, centerY: number, availableW: number, availableH: number,
  endFrame = cue.endFrame,
): PlacedFragment[] => {
  const minX = Math.min(...fragments.map((fragment) => fragment.x));
  const maxX = Math.max(...fragments.map((fragment) => fragment.x + fragment.span.ink.width));
  const minY = Math.min(...fragments.map((fragment) => fragment.baseline + fragment.span.ink.top));
  const maxY = Math.max(...fragments.map((fragment) => fragment.baseline + fragment.span.ink.bottom));
  const fit = Math.max(Number.EPSILON, Math.min(canvasScale,
    availableW / Math.max(1, maxX - minX), availableH / Math.max(1, maxY - minY)));
  const shiftX = centerX - ((minX + maxX) / 2) * fit;
  const shiftY = centerY - ((minY + maxY) / 2) * fit;

  return fragments.map(({ span, x, baseline, pocketSide, pocketEdge, entryMotion: requestedMotion }, fragmentIndex) => {
    let entryMotion = requestedMotion;
    if ((span.role === "helper" || span.role === "soft") && !entryMotion) {
      entryMotion = pocketEdge === "left" ? "left" : pocketEdge === "right" ? "right" :
        pocketEdge === "above" || pocketSide === -1 ? "drop" : "rise";
      const distance = Math.min(span.size * config.timing.travel, 16 * canvasScale / fit);
      const dx = entryMotion === "left" ? -distance : entryMotion === "right" ? distance : 0;
      const dy = entryMotion === "drop" ? -distance * .7 : entryMotion === "rise" ? distance : 0;
      const others = fragments.filter((_, index) => index !== fragmentIndex).map(piece => ({
        x: piece.x, width: piece.span.ink.width, baseline: piece.baseline, ink: piece.span.ink,
        top: piece.baseline + piece.span.ink.top, bottom: piece.baseline + piece.span.ink.bottom,
      }));
      for (const fraction of [1, .75, .5, .25]) {
        if (others.some(obstacle => helperInkCollision(span.ink, x + dx * fraction, baseline + dy * fraction, obstacle, 1))) {
          entryMotion = "still"; break;
        }
      }
    }
    const penX = (x - span.ink.left) * fit + shiftX;
    // Normal lines and multiword highlights follow speech too; only the existing
    // helper switch can opt a supporting phrase out of per-word reveals.
    const wordByWord = span.words.length > 1 &&
      (span.role === "plain" || span.role === "hero" || config.motion.helperWordByWord);
    const tokens = span.inlineTokens ? span.inlineTokens.map((token) => ({
      key: token.word.id, text: token.text, x: penX + token.offset * fit,
      startFrame: token.word.startMs * fps / 1000, size: token.size * fit,
      width: token.ink.advance * fit, accented: token.accented,
    })) : wordByWord ? span.words.map((word, index) => {
      const prefix = index ? `${displayedText(span.words.slice(0, index), config)} ` : "";
      const offset = prefix
        ? measureInk(prefix, span.font, span.size, span.tracking).advance * fit : 0;
      return {
        key: word.id,
        text: displayedWord(word, config),
        x: penX + offset,
        startFrame: word.startMs * fps / 1000,
        size: span.size * fit,
        width: measureInk(displayedWord(word, config), span.font, span.size, span.tracking).advance * fit,
        accented: false,
      };
    }) : [{
      key: span.words.map((word) => word.id).join("-"),
      text: span.text,
      x: penX,
      startFrame: span.words[0].startMs * fps / 1000,
      size: span.size * fit,
      width: span.ink.advance * fit,
      accented: false,
    }];
    return {
      text: span.text, role: span.role, font: span.font, size: span.size * fit,
      tracking: span.tracking, x: penX,
      baseline: baseline * fit + shiftY,
      left: x * fit + shiftX,
      top: (baseline + span.ink.top) * fit + shiftY,
      width: span.ink.width * fit,
      height: span.ink.height * fit,
      startFrame: tokens[0].startFrame,
      endFrame,
      pocketSide,
      pocketEdge,
      entryMotion,
      readabilityLimited: span.size * fit + 0.001 < canvasScale * (
        span.role === "hero" ? config.layout.minHeroFontSize
          : span.role === "plain" ? config.layout.minPlainFontSize : config.layout.minHelperFontSize
      ),
      tokens,
    };
  });
};

const standaloneScale = (cue: CaptionCue, { layout }: StyleOneConfig) =>
  !cue.beforeWords.length && !cue.afterWords.length ? layout.standaloneFontSize / layout.heroFontSize : 1;

/** How much of the full headline size this cue's main word can take in the frame. */
export const styleOneHeroFit = (cue: CaptionCue, config: StyleOneConfig) =>
  cue.mode === "plain" ? 1 : Math.min(1, config.layout.maxWidth * 1080 /
    Math.max(1, makeSpan(cue.heroWords, "hero", config, standaloneScale(cue, config)).ink.width));

/** Computed once per cue/settings change; no layout math depends on the current frame. */
export const layoutStyleOneCue = (
  cue: CaptionCue, input: StyleOneConfig, width: number, height: number, fps: number, heroCap = 1, heroWord = 1,
): PlacedFragment[] => {
  // A smaller pick lowers the headline's floor too, or the cue would give up on its stack.
  // A bigger one may pass the text box, up to the frame's safe edge.
  const config = heroWord === 1 ? input : { ...input, layout: { ...input.layout, ...(heroWord < 1
    ? { minHeroFontSize: input.layout.minHeroFontSize * heroWord }
    : { maxWidth: Math.max(input.layout.maxWidth, Math.min(.94, input.layout.maxWidth * heroWord)) }) } };
  const { layout } = config;
  const canvasScale = width / 1080;
  const glowRadius = Math.max(
    config.glow.enabled && config.glow.opacity > 0 ? config.glow.radius : 0,
    config.inlineAccent.enabled && config.inlineAccent.glowOpacity > 0 &&
      cue.mode === "plain" && cue.accentWordIds?.length ? config.inlineAccent.glowRadius : 0,
    config.shine.enabled && config.shine.glowOpacity > 0 && cue.mode !== "plain" ? 2.5 : 0,
  );
  const glowPad = glowRadius * 3 * canvasScale;
  const margin = Math.min(width, height) * layout.safeMargin + glowPad;
  const centerX = Math.max(margin + 1, Math.min(width - margin - 1, width * layout.positionX));
  const centerY = Math.max(margin + 1, Math.min(height - margin - 1,
    height * layout.positionY + layout.offsetY * canvasScale));
  const availableW = Math.max(1, Math.min(width * layout.maxWidth - glowPad * 2,
    2 * Math.min(centerX - margin, width - margin - centerX)));
  const availableH = Math.max(1, Math.min(height * layout.maxHeight - glowPad * 2,
    2 * Math.min(centerY - margin, height - margin - centerY)));
  const referenceW = availableW / canvasScale;
  const referenceH = availableH / canvasScale;
  const position = (fragments: Fragment[], endFrame = cue.endFrame) => positionFragments(
    fragments, cue, config, fps, canvasScale, centerX, centerY, availableW, availableH, endFrame,
  );

  if (cue.mode !== "plain") {
    const preferredMultiplier = standaloneScale(cue, config) * heroWord;
    const hero = makeSpan(cue.heroWords, "hero", config, preferredMultiplier);
    const firstMultiplier = preferredMultiplier * Math.min(heroCap, 1, referenceW / hero.ink.width);
    const minimumMultiplier = layout.minHeroFontSize / layout.heroFontSize;
    // Bounded retries: shrink the hero independently while helper sizes stay stable.
    const choices = [...new Set([firstMultiplier,
      Math.max(minimumMultiplier, firstMultiplier * 0.82), minimumMultiplier])];
    for (const multiplier of choices) {
      if (multiplier < minimumMultiplier) continue;
      const placed = position(emphasisFragments(cue, config, referenceW, referenceH, multiplier));
      if (placed.every((fragment) => !fragment.readabilityLimited)) return placed;
    }
  }

  // If the stack still cannot fit readably, use timed, compact ordinary phrases.
  // No words or timestamps are invented; each phrase replaces the previous one.
  const plainFont = config.fonts.plain;
  const plainSize = Math.max(config.layout.plainFontSize, config.layout.minPlainFontSize);
  const plainTracking = config.layout.supportTracking;
  const expandedWords = cue.words.flatMap((word) =>
    splitLongWord(word, plainFont, plainSize, plainTracking, referenceW),
  );
  const accentIds = cue.accentWordIds ?? [];
  const expandedAccentIds = cue.words.flatMap((word) => {
    if (!accentIds.includes(word.id)) return [];
    return [`${word.id}`, `${word.id}-h1`, `${word.id}-h2`, `${word.id}-h3`];
  });
  const chunks: CaptionWord[][] = [];
  let pending: CaptionWord[] = [];
  for (const word of expandedWords) {
    const shouldBreakBefore = pending.length && (
      pending.length >= config.engine.maxPlainWords ||
      pending[pending.length - 1].text.endsWith("-") ||
      word.id.includes("-h2") ||
      makeSpan([...pending, word], "plain", config, 1, expandedAccentIds).ink.width > referenceW
    );
    if (shouldBreakBefore) {
      chunks.push(pending);
      pending = [];
    }
    pending.push(word);
  }
  if (pending.length) chunks.push(pending);
  return chunks.reduce<PlacedFragment[]>((placed, words, index) => {
    const span = makeSpan(words, "plain", config, 1, expandedAccentIds);
    const next = chunks[index + 1];
    const endFrame = next
      ? Math.min(cue.endFrame, Math.ceil(next[0].startMs * fps / 1000)) : cue.endFrame;
    placed.push(...position([{ span, x: -span.ink.width / 2, baseline: -span.ink.top }], endFrame));
    return placed;
  }, []);
};
