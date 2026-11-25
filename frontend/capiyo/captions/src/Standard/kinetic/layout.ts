import { measureInk, type Ink } from "../../StyleOne/metrics";
import { fitHelperPockets, type InkObstacle, type PocketPart } from "../../StyleOne/pockets";
import type { FontSpec } from "../../StyleOne/config";
import { evenSizeCap } from "../../CaptionEngine/evenSize";
import { clamp } from "../../CaptionEngine/types";
import { cleanWord, type KineticVariant, type TypographyCue, type TypographyWord } from "./engine";
import { textFont, type TypographyFonts } from "./fonts";
import { NO_SIZES, SAFE_WIDTH, type PartSizes } from "../../Premium/sizes";
import { topLineWord } from "../../Script/mix";
import { isComplexScript } from "../../Script/scripts";

export type TypographyItem = {
  word: TypographyWord; text: string; font: FontSpec; size: number; ink: Ink;
  x: number; baseline: number; role: "hero" | "support"; line: string;
};
export type TypographyLayout = TypographyCue & {
  items: TypographyItem[]; x: number; y: number; width: number; height: number; scale: number;
};
export type TypographyGeometry = { width: number; height: number; maxWidth: number; positionX: number; positionY: number; preview: boolean; sizes?: PartSizes };
type Span = { words: TypographyWord[]; text: string; font: FontSpec; size: number; ink: Ink; items: TypographyItem[] };

export function makeTypeSpan(words: TypographyWord[], font: FontSpec, size: number,
  transform: (text: string) => string, role: TypographyItem["role"], line: string, contour = false, picks: Record<string, number> = {}): Span {
  const texts = words.map(word => transform(word.text));
  const text = texts.join(" ");
  if (words.some(word => picks[word.sourceId])) {
    // A word with its own size: the span is its words side by side, boxed by what they cover.
    let cursor = 0;
    const placed = words.map((word, index) => {
      const own = size * (picks[word.sourceId] ?? 1), ink = measureInk(texts[index], font, own, 0, contour), x = cursor;
      cursor += ink.advance + own * .26;
      return { word, own, ink, x, text: texts[index] };
    });
    const left = Math.min(...placed.map(item => item.x + item.ink.left)), right = Math.max(...placed.map(item => item.x + item.ink.right));
    const top = Math.min(...placed.map(item => item.ink.top)), bottom = Math.max(...placed.map(item => item.ink.bottom));
    const width = right - left;
    const ink: Ink = { ...placed[0].ink, left: 0, right: width, top, bottom, width, height: bottom - top, advance: width, step: 1,
      skyline: Array.from({ length: Math.max(1, Math.ceil(width)) }, () => ({ top, bottom })) };
    return { words, text, font, size, ink, items: placed.map(item => ({ word: item.word, text: item.text, font, size: item.own, ink: item.ink,
      x: item.x - left, baseline: 0, role, line })) };
  }
  const ink = measureInk(text, font, size, 0, contour);
  const items = words.map((word, index) => {
    const prefix = index ? `${texts.slice(0, index).join(" ")} ` : "";
    return { word, text: texts[index], font, size, ink: measureInk(texts[index], font, size, 0, contour),
      x: (prefix ? measureInk(prefix, font, size, 0).advance : 0) - ink.left,
      baseline: 0, role, line };
  });
  return { words, text, font, size, ink, items };
}
const moveSpan = (span: Span, x: number, baseline: number) => span.items.map(item => ({ ...item, x: item.x + x, baseline }));
const obstacleFor = (span: Span, x: number, baseline: number): InkObstacle => ({
  x, width: span.ink.width, top: baseline + span.ink.top, bottom: baseline + span.ink.bottom, baseline, ink: span.ink,
});

export function finishTypeLayout(cue: TypographyCue, items: TypographyItem[], geometry: TypographyGeometry): TypographyLayout {
  if (!items.length) return { ...cue, items, x: geometry.width / 2, y: geometry.height / 2, width: 0, height: 0, scale: 1 };
  const left = Math.min(...items.map(item => item.x + item.ink.left));
  const right = Math.max(...items.map(item => item.x + item.ink.right));
  const top = Math.min(...items.map(item => item.baseline + item.ink.top));
  const bottom = Math.max(...items.map(item => item.baseline + item.ink.bottom));
  const naturalWidth = Math.max(1, right - left), naturalHeight = Math.max(1, bottom - top);
  const pick = Math.max(geometry.sizes?.main ?? 1, geometry.sizes?.helper ?? 1);
  const room = geometry.width * Math.max(geometry.maxWidth, Math.min(SAFE_WIDTH, geometry.maxWidth * pick));
  const scale = Math.min(1, room / naturalWidth, geometry.height * .42 / naturalHeight);
  const width = naturalWidth * scale, height = naturalHeight * scale;
  return { ...cue, items: items.map(item => ({ ...item, x: item.x - left, baseline: item.baseline - top })),
    ...placeType(geometry, width, height), width, height, scale };
}

const placeType = (geometry: TypographyGeometry, width: number, height: number) => {
  const margin = Math.min(geometry.width, geometry.height) * .04;
  return {
    x: clamp(geometry.width * geometry.positionX - width / 2, margin, Math.max(margin, geometry.width - width - margin)),
    y: clamp(geometry.height * geometry.positionY - height / 2, margin, Math.max(margin, geometry.height - height - margin)),
  };
};

/** Keeps short captions from towering over the long ones in the same video. */
export function evenTypeLayouts<T extends TypographyLayout>(layouts: T[], geometry: TypographyGeometry): T[] {
  const cap = evenSizeCap(layouts.map(layout => layout.scale));
  return layouts.map(layout => {
    if (layout.scale <= cap) return layout;
    const width = layout.width * cap / layout.scale, height = layout.height * cap / layout.scale;
    return { ...layout, ...placeType(geometry, width, height), width, height, scale: cap };
  });
}

function contourCollision(span: Span, x: number, baseline: number, obstacle: InkObstacle, gap: number) {
  if (x + span.ink.width <= obstacle.x || x >= obstacle.x + obstacle.width) return false;
  const left = Math.max(x, obstacle.x), right = Math.min(x + span.ink.width, obstacle.x + obstacle.width);
  for (let position = left; position < right; position += Math.max(.6, Math.min(span.ink.step, obstacle.ink?.step ?? 1))) {
    const a = span.ink.skyline[Math.min(span.ink.skyline.length - 1, Math.max(0, Math.floor((position - x) / span.ink.step)))];
    const b = obstacle.ink?.skyline[Math.min(obstacle.ink.skyline.length - 1, Math.max(0, Math.floor((position - obstacle.x) / obstacle.ink.step)))];
    const aTop = baseline + (a?.top ?? span.ink.top), aBottom = baseline + (a?.bottom ?? span.ink.bottom);
    const bTop = b ? (obstacle.baseline ?? 0) + b.top : obstacle.top;
    const bBottom = b ? (obstacle.baseline ?? 0) + b.bottom : obstacle.bottom;
    if (Number.isFinite(aTop) && Number.isFinite(bTop) && aBottom + gap > bTop && bBottom + gap > aTop) return true;
  }
  return false;
}

function placeHelpers(words: TypographyWord[], side: -1 | 1, hero: Span, obstacles: InkObstacle[],
  font: FontSpec, size: number, width: number, line: string, seed: string, hybrid = false, picks: Record<string, number> = {}) {
  if (!words.length) return [];
  const cache = new Map<string, PocketPart<Span>>();
  const part = (from: number, to: number): PocketPart<Span> => {
    const key = `${from}:${to}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const entries = words.slice(from, to);
    let span = makeTypeSpan(entries, font, size, text => cleanWord(text).toLocaleLowerCase(), "support", `${line}-${from}`, true, picks);
    // Only an indivisible long token may shrink. Normal helper phrases wrap.
    if (entries.length === 1 && span.ink.width > width) span = makeTypeSpan(entries, font, size * width / span.ink.width,
      text => cleanWord(text).toLocaleLowerCase(), "support", `${line}-${from}`, true, picks);
    const value = { value: span, ink: span.ink, words: entries.length };
    cache.set(key, value); return value;
  };
  const partitions = [[part(0, words.length)]];
  for (let cut = 1; cut < words.length; cut++) partitions.push([part(0, cut), part(cut, words.length)]);
  for (let a = 1; a < words.length - 1; a++) for (let b = a + 1; b < words.length; b++) {
    partitions.push([part(0, a), part(a, b), part(b, words.length)]);
  }
  const readablePartitions = partitions.filter(parts => parts.every(piece => piece.ink.width <= width));
  type Placement = { span: Span; x: number; baseline: number };
  let best: { placements: Placement[]; score: number } | null = null;
  const gap = Math.max(6, size * .22);
  // Compare complete arrangements, including the other helper group. A side
  // column may share the headline's height; its remaining words can continue
  // on a row aligned to either headline edge. No random offsets or tiny type.
  const consider = (placements: Placement[]) => {
    const occupied = [...obstacles];
    for (const { span, x, baseline } of placements) {
      if (occupied.some(obstacle => contourCollision(span, x, baseline, obstacle, size * .16))) return;
      occupied.push(obstacleFor(span, x, baseline));
    }
    const left = Math.min(...occupied.map(obstacle => obstacle.x));
    const right = Math.max(...occupied.map(obstacle => obstacle.x + obstacle.width));
    const top = Math.min(...occupied.map(obstacle => obstacle.top));
    const bottom = Math.max(...occupied.map(obstacle => obstacle.bottom));
    if (right - left > width + .01) return;
    const height = bottom - top;
    const score = (right - left) * height / (width * Math.max(size, hero.ink.height)) +
      height / Math.max(size, hero.ink.height) * .85 + (placements.length - 1) * .055;
    if (!best || score < best.score) best = { placements, score };
  };
  const result = readablePartitions.length ? fitHelperPockets({ partitions: readablePartitions, obstacles, heroWidth: hero.ink.width, availableWidth: width,
    preferredSide: side, allowOtherSide: false, sideClearance: .15, gapRatio: .2, overhang: .08,
    minGain: .05, splitPenalty: .25, variation: 0, seed }) : null;
  if (result) {
    consider(result.pieces.map(piece => ({ span: piece.part.value, x: piece.x, baseline: piece.baseline })));
  }
  for (const partition of readablePartitions) {
    for (let sideCount = 1; sideCount <= partition.length; sideCount++) {
      // Leading words run above -> left; trailing words run right -> below.
      const sideParts = (side < 0 ? partition.slice(-sideCount) : partition.slice(0, sideCount)).map(piece => piece.value);
      const rowParts = (side < 0 ? partition.slice(0, -sideCount) : partition.slice(sideCount)).map(piece => piece.value);
      const columnWidth = Math.max(...sideParts.map(span => span.ink.width));
      if (hero.ink.width + gap + columnWidth > width) continue;
      const columnHeight = sideParts.reduce((sum, span) => sum + span.ink.height, 0) + gap * (sideParts.length - 1);
      const rowHeight = rowParts.reduce((sum, span) => sum + span.ink.height, 0) + gap * Math.max(0, rowParts.length - 1);
      for (const vertical of [0, .5, 1]) for (const align of [0, 1]) {
        const placements: Placement[] = [];
        let top = hero.ink.top + (hero.ink.height - columnHeight) * vertical;
        const columnTop = top, columnBottom = top + columnHeight;
        for (const span of sideParts) {
          const x = side < 0 ? -gap - span.ink.width : hero.ink.width + gap;
          placements.push({ span, x, baseline: top - span.ink.top });
          top += span.ink.height + gap;
        }
        const sidePlacements = [...placements];
        top = side < 0 ? Math.min(hero.ink.top, columnTop) - gap - rowHeight
          : Math.max(hero.ink.bottom, columnBottom) + gap;
        for (const span of rowParts) {
          const x = align === 0 ? 0 : hero.ink.width - span.ink.width;
          placements.push({ span, x, baseline: top - span.ink.top });
          top += span.ink.height + gap;
        }
        consider(placements);
        if (hybrid && rowParts.length) {
          // Keep a readable contour pocket when only the remaining groups
          // need the side column. Compare this with the existing aligned row.
          const remaining = side < 0 ? partition.slice(0, -sideCount) : partition.slice(sideCount);
          const occupied = [...obstacles, ...sidePlacements.map(piece => obstacleFor(piece.span, piece.x, piece.baseline))];
          const mixed = fitHelperPockets({ partitions: [remaining], obstacles: occupied,
            heroWidth: hero.ink.width, availableWidth: width, preferredSide: side,
            allowOtherSide: false, sideClearance: .15, gapRatio: .2, overhang: .08,
            minGain: .05, splitPenalty: .25, variation: 0, seed });
          if (mixed) consider([...sidePlacements, ...mixed.pieces.map(piece => ({
            span: piece.part.value, x: piece.x, baseline: piece.baseline,
          }))]);
        }
      }
    }
  }
  const rows: Span[] = [];
  for (let from = 0; from < words.length;) {
    let to = from + 1;
    while (to < words.length && part(from, to + 1).ink.width <= width) to++;
    rows.push(part(from, to).value); from = to;
  }
  const totalHeight = rows.reduce((sum, span) => sum + span.ink.height, 0) + gap * Math.max(0, rows.length - 1);
  const fallback: Placement[] = [];
  const occupiedLeft = Math.min(...obstacles.map(obstacle => obstacle.x));
  const occupiedWidth = Math.max(...obstacles.map(obstacle => obstacle.x + obstacle.width)) - occupiedLeft;
  for (const envelope of [false, true]) for (const align of [0, 1, .5]) {
    let top = side < 0 ? Math.min(...obstacles.map(obstacle => obstacle.top)) - gap - totalHeight
      : Math.max(...obstacles.map(obstacle => obstacle.bottom)) + gap;
    const placements = rows.map(span => {
      const x = envelope ? occupiedLeft + (Math.max(occupiedWidth, span.ink.width) - span.ink.width) * align
        : (hero.ink.width - span.ink.width) * align;
      const placement = { span, x, baseline: top - span.ink.top };
      top += span.ink.height + gap;
      return placement;
    });
    if (envelope && align === 0) fallback.push(...placements);
    consider(placements);
  }
  const chosen = best as { placements: Placement[]; score: number } | null;
  return (chosen?.placements ?? fallback).flatMap(({ span, x, baseline }) => {
    obstacles.push(obstacleFor(span, x, baseline));
    return moveSpan(span, x, baseline);
  });
}

function redLayout(cue: TypographyCue, fonts: TypographyFonts, geometry: TypographyGeometry) {
  const unit = geometry.preview ? geometry.width / 720 : Math.min(geometry.width, geometry.height) / 720;
  const sizes = geometry.sizes ?? NO_SIZES;
  const size = 66 * unit * sizes.main;
  const supportSize = 36 * unit * sizes.helper;
  const limit = Math.min(geometry.width * SAFE_WIDTH, Math.min(geometry.width * geometry.maxWidth, 450 * unit) * Math.max(1, sizes.main, sizes.helper));
  const transform = (text: string) => cleanWord(text).toLocaleUpperCase();
  let split = Math.max(1, Math.ceil(cue.words.length * .45));
  let best = Infinity;
  for (let cut = 1; cut <= Math.min(4, cue.words.length); cut++) {
    if (cut === cue.words.length && cue.words.length > 2) continue;
    // Mix: the red top line reads in English letters, the white line under it in the speaker's script.
    const a = makeTypeSpan(cue.words.slice(0, cut).map(topLineWord), textFont("", fonts, "condensed"), size, transform, "hero", "red-top");
    const b = makeTypeSpan(cue.words.slice(cut), textFont(cue.words.slice(cut).map(w => w.text).join(" "), fonts, "sans"), supportSize, transform, "support", "red-bottom");
    const cost = Math.abs(a.ink.width - b.ink.width * 1.15) / limit + Math.max(0, a.ink.width / limit - 1) * 8 +
      Math.max(0, b.ink.width / limit - 1) * 8 + Math.abs(cut / cue.words.length - .48) * .25;
    if (cost < best) { best = cost; split = cut; }
  }
  const upper = cue.words.slice(0, split).map(topLineWord), lower = cue.words.slice(split);
  let main = makeTypeSpan(upper, textFont("", fonts, "condensed"), size, transform, "hero", "red-top", false, sizes.words);
  let sub = makeTypeSpan(lower, textFont(lower.map(w => w.text).join(" "), fonts, "sans"), supportSize, transform, "support", "red-bottom", false, sizes.words);
  if (main.ink.width > limit) main = makeTypeSpan(upper, main.font, size * limit / main.ink.width, transform, "hero", "red-top", false, sizes.words);
  if (sub.ink.width > limit) sub = makeTypeSpan(lower, sub.font, supportSize * limit / sub.ink.width, transform, "support", "red-bottom", false, sizes.words);
  const width = Math.max(main.ink.width, lower.length ? sub.ink.width : 0);
  const items = moveSpan(main, (width - main.ink.width) / 2, -main.ink.top);
  if (lower.length) items.push(...moveSpan(sub, (width - sub.ink.width) / 2, main.ink.height + 12 * unit - sub.ink.top));
  return finishTypeLayout(cue, items, geometry);
}

export function layoutKinetic(cue: TypographyCue, variant: KineticVariant, fonts: TypographyFonts, geometry: TypographyGeometry): TypographyLayout {
  if (variant === "crimson-rise") return redLayout(cue, fonts, geometry);
  const unit = geometry.preview ? geometry.width / 720 : Math.min(geometry.width, geometry.height) / 720;
  const prism = variant === "prism-relay";
  const sizes = geometry.sizes ?? NO_SIZES;
  const limit = Math.min(geometry.width * SAFE_WIDTH, Math.min(geometry.width * geometry.maxWidth, 520 * unit) * Math.max(1, sizes.main));
  const heroTo = cue.serif ? cue.heroFrom + 1 : cue.heroTo;
  const heroWords = cue.words.slice(cue.heroFrom, heroTo);
  const face = prism ? "capital" : cue.serif ? "italic" : "heavy";
  const font = textFont(heroWords.map(word => word.text).join(" "), fonts, face);
  const transform = (text: string) => cleanWord(text).toLocaleUpperCase();
  // A joined-script main word carries signs above and below its letters: a little smaller reads as large as the English one.
  const preferred = (cue.serif ? 92 : prism ? 84 : 88) * unit * sizes.main * (isComplexScript(heroWords.map(word => word.text).join("")) ? .88 : 1);
  let hero = makeTypeSpan(heroWords, font, preferred, transform, "hero", "hero", true, sizes.words);
  if (hero.ink.width > limit) hero = makeTypeSpan(heroWords, font, preferred * limit / hero.ink.width, transform, "hero", "hero", true, sizes.words);
  const helpersSize = (prism ? 42 : 44) * unit * sizes.helper;
  const supportFont = textFont(cue.words.map(word => word.text).join(" "), fonts, prism ? "mono" : "sans");
  const items = moveSpan(hero, 0, 0);
  const obstacles = [obstacleFor(hero, 0, 0)];
  const lead = cue.words.slice(0, cue.heroFrom);
  const tail = cue.words.slice(heroTo);
  items.push(...placeHelpers(lead, -1, hero, obstacles, supportFont, helpersSize, limit, "lead", `${cue.id}:lead`, !prism, sizes.words));
  items.push(...placeHelpers(tail, 1, hero, obstacles, supportFont, helpersSize, limit, "tail", `${cue.id}:tail`, !prism, sizes.words));
  return finishTypeLayout(cue, items, geometry);
}
