import type { Ink } from "./metrics";

export type InkObstacle = { x: number; width: number; top: number; bottom: number; ink?: Ink; baseline?: number };
export type PocketPart<T> = { value: T; ink: Ink; words: number };
export type PocketPlacement<T> = { part: PocketPart<T>; x: number; baseline: number; side: -1 | 1; gain: number };
export type PocketEdge = "above" | "below" | "left" | "right";
export type SurroundPlacement<T> = { part: PocketPart<T>; x: number; baseline: number; edge: PocketEdge };
export type HelperFlow<T> = {
  length: number;
  preferredSide: -1 | 1;
  part: (from: number, to: number) => PocketPart<T>;
};

const hash = (value: string) => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0) / 4294967295;
};

// Pool at most 1.25px of ink conservatively; never sample away a thin stroke.
const collisionCache = new WeakMap<Ink, Ink>();
const collisionInk = (ink: Ink): Ink => {
  const cached = collisionCache.get(ink);
  if (cached) return cached;
  const stride = Math.max(1, Math.floor(1.25 / ink.step));
  if (stride === 1 || !ink.skyline.length) return ink;
  const skyline: Ink["skyline"] = [];
  for (let column = 0; column < ink.skyline.length; column += stride) {
    const block = ink.skyline.slice(column, column + stride);
    skyline.push({ top: Math.min(...block.map(item => item.top)), bottom: Math.max(...block.map(item => item.bottom)) });
  }
  const pooled = { ...ink, step: ink.step * stride, skyline };
  collisionCache.set(ink, pooled);
  return pooled;
};

/** Expand the collision contour sideways, conservatively pooling subpixel edges. */
const profiles = (obstacles: InkObstacle[], padding: number) => obstacles.map((obstacle) => {
  if (!obstacle.ink?.skyline.length) return { obstacle, top: [], bottom: [] };
  const { skyline, step } = obstacle.ink;
  const radius = Math.ceil(padding / step) + 1;
  const top: number[] = [];
  const bottom: number[] = [];
  // Sliding extrema keep profile construction linear, even for long highlighted words.
  const minima: number[] = []; const maxima: number[] = [];
  let minHead = 0; let maxHead = 0; let next = 0;
  for (let column = 0; column < skyline.length; column++) {
    const right = Math.min(skyline.length - 1, column + radius);
    for (; next <= right; next++) {
      while (minima.length > minHead && skyline[minima[minima.length - 1]].top >= skyline[next].top) minima.pop();
      while (maxima.length > maxHead && skyline[maxima[maxima.length - 1]].bottom <= skyline[next].bottom) maxima.pop();
      minima.push(next); maxima.push(next);
    }
    const left = column - radius;
    while (minima[minHead] < left) minHead++;
    while (maxima[maxHead] < left) maxHead++;
    top.push(skyline[minima[minHead]].top + (obstacle.baseline ?? 0));
    bottom.push(skyline[maxima[maxHead]].bottom + (obstacle.baseline ?? 0));
  }
  return { obstacle, top, bottom };
});

/** The helper's own descenders/ascenders participate, not just its bounding box. */
const baselineAt = (ink: Ink, x: number, side: -1 | 1,
  expanded: ReturnType<typeof profiles>, padding: number, gap: number, constrainToEdge = true) => {
  const hero = expanded[0]?.obstacle;
  const heroTop = hero?.top ?? 0;
  const heroBottom = hero?.bottom ?? 0;
  const sideAnchor = side < 0 ? heroTop + (heroBottom - heroTop) * 0.2
    : heroBottom - (heroBottom - heroTop) * 0.2;
  const centeredBaseline = sideAnchor - (ink.top + ink.bottom) / 2;
  // Overhanging groups with little ink beneath them still belong visually to
  // its upper/lower edge band, rather than drifting beside its reading baseline.
  const origin = hero?.baseline ?? 0;
  let baseline = side < 0 ? origin - gap - ink.bottom : origin + gap - ink.top;
  if (constrainToEdge) baseline = side < 0 ? Math.min(baseline, centeredBaseline) : Math.max(baseline, centeredBaseline);
  for (const { obstacle, top, bottom } of expanded) {
    if (x + ink.width + padding <= obstacle.x || x - padding >= obstacle.x + obstacle.width) continue;
    if (!top.length || !obstacle.ink?.skyline.length) {
      baseline = side < 0 ? Math.min(baseline, obstacle.top - gap - ink.bottom)
        : Math.max(baseline, obstacle.bottom + gap - ink.top);
      continue;
    }
    const helper = ink.skyline.length ? ink.skyline : [{ top: ink.top, bottom: ink.bottom }];
    const helperStep = ink.skyline.length ? ink.step : ink.width;
    for (let i = 0; i < helper.length; i++) {
      if (!Number.isFinite(side < 0 ? helper[i].bottom : helper[i].top)) continue;
      const start = x + i * helperStep;
      if (start + helperStep < obstacle.x - padding || start > obstacle.x + obstacle.width + padding) continue;
      const first = Math.max(0, Math.min(top.length - 1, Math.floor((start - obstacle.x) / obstacle.ink.step)));
      const last = Math.max(0, Math.min(top.length - 1, Math.ceil((start + helperStep - obstacle.x) / obstacle.ink.step)));
      for (let column = first; column <= last; column++) {
        if (side < 0 && Number.isFinite(top[column])) baseline = Math.min(baseline, top[column] - gap - helper[i].bottom);
        if (side > 0 && Number.isFinite(bottom[column])) baseline = Math.max(baseline, bottom[column] + gap - helper[i].top);
      }
    }
  }
  return baseline;
};

/** Mean visible clearance, rather than rewarding one lucky point of contact. */
const opticalDistance = (ink: Ink, x: number, baseline: number, side: -1 | 1,
  hero: ReturnType<typeof profiles>[number]) => {
  if (!hero?.obstacle.ink || !hero.top.length) return 0;
  let distance = 0;
  let samples = 0;
  const columns = ink.skyline.length || 1;
  const stride = Math.max(1, Math.ceil(columns / 48));
  for (let column = 0; column < columns; column += stride) {
    const edge = ink.skyline.length ? ink.skyline[column] : ink;
    const helperEdge = side < 0 ? edge.bottom : edge.top;
    if (!Number.isFinite(helperEdge)) continue;
    const position = x + (ink.skyline.length ? column * ink.step : ink.width / 2);
    const index = Math.floor((position - hero.obstacle.x) / hero.obstacle.ink.step);
    if (index < 0 || index >= hero.top.length) continue;
    const mainEdge = side < 0 ? hero.top[index] : hero.bottom[index];
    if (!Number.isFinite(mainEdge)) continue;
    distance += Math.max(0, side < 0 ? mainEdge - baseline - helperEdge
      : baseline + helperEdge - mainEdge);
    samples++;
  }
  return samples ? distance / samples / Math.max(1, ink.cap) : 0;
};

/** Keep sentence flow across a tall letter that separates two real pockets. */
const joinCost = <T>(previous: PocketPlacement<T>, next: PocketPlacement<T>,
  hero: InkObstacle | undefined, heroWidth: number, gapRatio: number): number | null => {
  if (previous.side !== next.side) return null;
  const cap = Math.max(previous.part.ink.cap, next.part.ink.cap);
  const left = previous.x + previous.part.ink.width;
  const right = next.x;
  const space = right - left;
  const level = Math.abs(next.baseline - previous.baseline);
  if (space < Math.max(2, cap * 0.18) || level > cap * 1.5) return null;
  if (space > cap * 0.7) {
    // More room is justified only by main-word ink in the intervening band.
    if (!hero?.ink?.skyline.length || space > Math.max(cap * 6, heroWidth * 0.45)) return null;
    const { skyline, step } = hero.ink;
    const first = Math.max(0, Math.floor((left - hero.x) / step));
    const last = Math.min(skyline.length - 1, Math.ceil((right - hero.x) / step));
    const side = previous.side;
    const previousEdge = previous.baseline + (side < 0 ? previous.part.ink.bottom : previous.part.ink.top);
    const nextEdge = next.baseline + (side < 0 ? next.part.ink.bottom : next.part.ink.top);
    const clearance = Math.max(2, cap * gapRatio);
    let occupied = 0;
    for (let column = first; column <= last; column++) {
      const start = Math.max(left, hero.x + column * step);
      const end = Math.min(right, hero.x + (column + 1) * step);
      if (end <= start) continue;
      const edge = (side < 0 ? skyline[column].top : skyline[column].bottom) + (hero.baseline ?? 0);
      const helperEdge = previousEdge + (nextEdge - previousEdge) * ((start + end) / 2 - left) / space;
      if (Number.isFinite(edge) && (side < 0 ? edge <= helperEdge + clearance : edge >= helperEdge - clearance)) {
        occupied += end - start;
      }
    }
    if (occupied < Math.min(step * 2, cap * 0.08)) return null;
  }
  return Math.max(0, space / cap - 0.4) * 0.03 + level / cap * 0.04;
};

/** Bounded beam search over all contiguous word partitions; geometry is frame-independent. */
export const fitHelperPockets = <T>({
  partitions, obstacles, heroWidth, availableWidth, preferredSide, allowOtherSide,
  sideClearance, gapRatio, overhang, minGain, splitPenalty, variation, seed,
}: {
  partitions: PocketPart<T>[][]; obstacles: InkObstacle[]; heroWidth: number; availableWidth: number;
  preferredSide: -1 | 1; allowOtherSide: boolean; sideClearance: number; gapRatio: number;
  overhang: number; minGain: number; splitPenalty: number; variation: number; seed: string;
}): { pieces: PocketPlacement<T>[]; score: number } | null => {
  let best: { pieces: PocketPlacement<T>[]; score: number } | null = null;
  const choices = new Map<PocketPart<T>, (PocketPlacement<T> & { score: number })[]>();
  const profileCache = new Map<number, ReturnType<typeof profiles>>();
  for (const partition of partitions) {
    if (!partition.length || partition.length > 3) continue;
    let beam: { pieces: PocketPlacement<T>[]; score: number; gain: number; width: number }[] = [
      { pieces: [], score: 0, gain: 0, width: 0 },
    ];
    const totalWords = partition.reduce((sum, part) => sum + part.words, 0);
    for (const part of partition) {
      let candidates = choices.get(part);
      if (!candidates) {
        const { ink } = part;
        const padding = Math.max(1.5, ink.cap * sideClearance);
        const gap = Math.max(2, ink.cap * gapRatio);
        const expanded = profileCache.get(padding) ?? profiles(obstacles, padding);
        profileCache.set(padding, expanded);
        const helperContour = collisionInk(ink);
        // A short phrase belongs inside the word's silhouette. Letting it hang
        // almost entirely outside the last letter creates a false "pocket".
        const extension = Math.min(heroWidth * overhang, ink.cap * 0.2);
        const left = ink.width > heroWidth ? heroWidth - ink.width : -extension;
        const right = ink.width > heroWidth ? 0 : heroWidth - ink.width + extension;
        const xs = new Set([0, heroWidth - ink.width, (heroWidth - ink.width) / 2, left, right]);
        const step = Math.max(2, ink.cap / 14, (right - left) / 128);
        for (let x = left; x <= right; x += step) xs.add(x);
        if (obstacles[0]?.ink?.skyline.length) {
          const { skyline, step: hStep } = obstacles[0].ink;
          const stride = Math.max(1, Math.floor(ink.cap / 3));
          for (let col = 0; col < skyline.length; col += stride) {
            const hx = obstacles[0].x + col * hStep;
            if (hx >= left && hx <= right) xs.add(hx);
            if (hx - ink.width >= left && hx - ink.width <= right) xs.add(hx - ink.width);
          }
        }
        candidates = [];
        const sides: (-1 | 1)[] = allowOtherSide ? [preferredSide, preferredSide < 0 ? 1 : -1] : [preferredSide];
        for (const side of sides) {
          // Score against the hero, not an earlier helper's height. Otherwise a
          // previous top helper falsely makes every later phrase "gain" by moving up.
          const flatEdge = side < 0 ? Math.min(0, obstacles[0]?.top ?? 0)
            : Math.max(0, obstacles[0]?.bottom ?? 0);
          const flatBaseline = side < 0 ? flatEdge - gap - ink.bottom : flatEdge + gap - ink.top;
          for (const x of xs) {
            if (Math.max(heroWidth, x + ink.width) - Math.min(0, x) > availableWidth) continue;
            const overlap = Math.max(0, Math.min(heroWidth, x + ink.width) - Math.max(0, x));
            if (overlap < Math.min(ink.width * 0.15, heroWidth * 0.12)) continue;
            const baseline = baselineAt(helperContour, x, side, expanded, padding, gap);
            const gain = Math.max(0, (side < 0 ? baseline - flatBaseline : flatBaseline - baseline) / ink.cap);
            const overhangFraction = (ink.width - overlap) / Math.max(1, ink.width);
            const flowDistance = Math.abs(x - (preferredSide < 0 ? 0 : heroWidth - ink.width))
              / Math.max(1, heroWidth);
            const distance = opticalDistance(helperContour, x, baseline, side, expanded[0]);
            const anchors = [0, heroWidth - ink.width, (heroWidth - ink.width) / 2];
            const alignment = Math.min(...anchors.map(anchor => Math.abs(x - anchor))) / Math.max(1, ink.cap);
            const sidePenalty = 0.25 + (totalWords - 1) * 0.17;
            const gainBonus = gain > 0.15 ? gain * 0.4 : 0;
            const score = gain + gainBonus - distance * 0.14 - overhangFraction * 1.5
              - flowDistance * 0.2 - Math.min(1, alignment) * 0.035
              - (side === preferredSide ? 0 : sidePenalty)
              + hash(`${seed}:${part.words}:${x.toFixed(2)}:${side}`) * variation * 0.004;
            candidates.push({ part, x, baseline, side, gain, score });
          }
        }
        // Keep both edges of each depth band as well as its best alignment.
        // Keeping only the best x used to discard the positions that let two
        // consecutive groups meet on opposite sides of a tall letter.
        const buckets = new Map<string, { best: typeof candidates[number]; left: typeof candidates[number]; right: typeof candidates[number] }>();
        for (const candidate of candidates) {
          const bucket = `${candidate.side}:${Math.floor(candidate.x / Math.max(4, Math.min(heroWidth / 32, ink.cap * 0.75)))}:${Math.round(candidate.gain * 4)}`;
          const existing = buckets.get(bucket);
          if (!existing) buckets.set(bucket, { best: candidate, left: candidate, right: candidate });
          else {
            if (candidate.score > existing.best.score) existing.best = candidate;
            if (candidate.x < existing.left.x) existing.left = candidate;
            if (candidate.x > existing.right.x) existing.right = candidate;
          }
        }
        candidates = [...new Set([...buckets.values()].flatMap(bucket => [bucket.best, bucket.left, bucket.right]))]
          .sort((a, b) => b.score - a.score).slice(0, 96);
        choices.set(part, candidates);
      }
      const next: typeof beam = [];
      for (const state of beam) for (const candidate of candidates) {
        const previous = state.pieces[state.pieces.length - 1];
        const joining = previous ? joinCost(previous, candidate, obstacles[0], heroWidth, gapRatio) : 0;
        if (joining === null) continue;
        const pieces = [...state.pieces, candidate];
        const outerWidth = Math.max(heroWidth, candidate.x + part.ink.width) - Math.min(0, pieces[0].x);
        if (outerWidth > availableWidth) continue;
        const weight = part.words / totalWords;
        next.push({ pieces, score: state.score + candidate.score * weight - joining,
          gain: state.gain + candidate.gain * weight, width: outerWidth });
      }
      next.sort((a, b) => b.score - a.score || a.width - b.width);
      beam = next.slice(0, 24);
      if (!beam.length) break;
    }
    for (const state of beam) {
      if (state.pieces.length !== partition.length || state.gain < minGain) continue;
      const effectiveSplitPenalty = state.gain > 0.25 ? splitPenalty * 0.4 : splitPenalty;
      const score = state.score - effectiveSplitPenalty * (partition.length - 1);
      if (score > 0 && (!best || score > best.score)) {
        const topPieces = state.pieces.filter(p => p.side < 0);
        const bottomPieces = state.pieces.filter(p => p.side > 0);
        const topBaseline = topPieces.length ? Math.min(...topPieces.map(p => p.baseline)) : 0;
        const bottomBaseline = bottomPieces.length ? Math.max(...bottomPieces.map(p => p.baseline)) : 0;
        const pieces = state.pieces.map(p => ({
          ...p,
          baseline: p.side < 0 ? topBaseline : bottomBaseline,
        }));
        best = { pieces, score };
      }
    }
  }
  return best;
};

/** Conservative shaped-ink collision, including detached dots and both tails.
 * Ink x coordinates describe visible left edges; baseline coordinates remain
 * absolute. Empty columns stay empty rather than becoming phantom letter stems.
 */
export const helperInkCollision = (ink: Ink, x: number, baseline: number, obstacle: InkObstacle, gap = 0): boolean => {
  ink = collisionInk(ink);
  const other = obstacle.ink ? collisionInk(obstacle.ink) : undefined;
  if (x + ink.width + gap <= obstacle.x || x >= obstacle.x + obstacle.width + gap ||
      baseline + ink.bottom + gap <= obstacle.top || baseline + ink.top >= obstacle.bottom + gap) return false;
  if (!other?.skyline.length || !ink.skyline.length) return true;
  const first = Math.max(0, Math.floor((obstacle.x - gap - x) / ink.step));
  const last = Math.min(ink.skyline.length - 1, Math.ceil((obstacle.x + obstacle.width + gap - x) / ink.step));
  for (let at = first; at <= last; at++) {
    const column = ink.skyline[at];
    if (!Number.isFinite(column.top)) continue;
    const left = x + at * ink.step, right = left + ink.step;
    const from = Math.max(0, Math.floor((left - gap - obstacle.x) / other.step));
    const to = Math.min(other.skyline.length - 1, Math.ceil((right + gap - obstacle.x) / other.step));
    for (let index = from; index <= to; index++) {
      const edge = other.skyline[index];
      if (!Number.isFinite(edge.top)) continue;
      const top = (obstacle.baseline ?? 0) + edge.top;
      const bottom = (obstacle.baseline ?? 0) + edge.bottom;
      if (baseline + column.bottom + gap > top && bottom + gap > baseline + column.top) return true;
    }
  }
  return false;
};

/** Joint phrase composition around the hero. Each part is a shaped, unchanged
 * word group. Search coordinates come from real contour changes, not letter
 * classes or a fixed sequence of decorative slots. Randomness only selects
 * between complete, similarly compact, collision-free arrangements.
 */
export const fitSurroundingHelpers = <T>({
  flows, hero, availableWidth, availableHeight, sideClearance, gapRatio,
  preferredSide, maxFragments, split, variation, seed, naturalGap, maxOverlap = Infinity,
}: {
  flows: HelperFlow<T>[]; hero: InkObstacle; availableWidth: number; availableHeight: number;
  sideClearance: number; gapRatio: number;
  preferredSide?: -1 | 1; maxFragments: number; split: boolean;
  variation: number; seed: string; naturalGap: (previous: T, next: T) => number;
  maxOverlap?: number;
}): SurroundPlacement<T>[] | null => {
  if (!flows.length) return [];
  const width = hero.width;
  if (![availableWidth, availableHeight, width, hero.top, hero.bottom].every(Number.isFinite) ||
      availableWidth <= 0 || availableHeight <= 0 || width > availableWidth ||
      hero.bottom - hero.top > availableHeight) return null;
  const cap = Math.max(1, hero.ink?.cap ?? hero.bottom - hero.top);
  const railLeft = hero.x + (width - availableWidth) / 2;
  const railRight = railLeft + availableWidth;
  const centerY = (hero.top + hero.bottom) / 2;
  const railTop = centerY - availableHeight / 2, railBottom = centerY + availableHeight / 2;
  const heroHeight = Math.max(1, hero.bottom - hero.top);
  const options = new Map<PocketPart<T>, SurroundPlacement<T>[]>();
  const heroSafe = new WeakSet<SurroundPlacement<T>>();
  const expanded = new Map<number, ReturnType<typeof profiles>>();
  const obstacleFor = (piece: SurroundPlacement<T>): InkObstacle => ({
    x: piece.x, width: piece.part.ink.width, baseline: piece.baseline, ink: piece.part.ink,
    top: piece.baseline + piece.part.ink.top, bottom: piece.baseline + piece.part.ink.bottom,
  });
  const fits = (piece: SurroundPlacement<T>) => piece.x >= railLeft - .01 &&
    piece.x + piece.part.ink.width <= railRight + .01 &&
    piece.baseline + piece.part.ink.top >= railTop - .01 &&
    piece.baseline + piece.part.ink.bottom <= railBottom + .01 &&
    (piece.edge === "above" ? piece.baseline + piece.part.ink.bottom <= hero.top + maxOverlap + .01 :
      piece.edge === "below" ? piece.baseline + piece.part.ink.top >= hero.bottom - maxOverlap - .01 :
      piece.edge === "left" ? piece.x + piece.part.ink.width <= hero.x + maxOverlap + .01 :
      piece.x >= hero.x + width - maxOverlap - .01);
  const candidatesFor = (part: PocketPart<T>): SurroundPlacement<T>[] => {
    const cached = options.get(part);
    if (cached) return cached;
    const ink = collisionInk(part.ink);
    if (ink.width > availableWidth || ink.height > availableHeight) {
      options.set(part, []); return [];
    }
    const padding = Math.max(1.5, ink.cap * sideClearance);
    const gap = Math.max(2, ink.cap * gapRatio);
    const main = expanded.get(padding) ?? profiles([hero], padding);
    expanded.set(padding, main);
    const positions = new Set<number>([hero.x, hero.x + width - ink.width,
      hero.x + (width - ink.width) / 2, railLeft, railRight - ink.width]);
    const step = Math.max(3, ink.cap / 8, availableWidth / 72);
    for (let x = railLeft; x <= railRight - ink.width; x += step) positions.add(x);
    // Include both sides of every actual top/bottom transition, so narrow i/j
    // dots, capitals and multi-tail words are not skipped by a coarse x grid.
    if (hero.ink?.skyline.length) {
      // Align the sentence's existing whitespace with a stem when it fits.
      // This searches real single-space windows without opening a larger gap.
      const spaces: { left: number; right: number }[] = [];
      let start = -1;
      for (let index = 0; index <= ink.skyline.length; index++) {
        const blank = index < ink.skyline.length && !Number.isFinite(ink.skyline[index].top);
        if (blank && start < 0) start = index;
        if (!blank && start >= 0) {
          if (start > 0 && index < ink.skyline.length && (index - start) * ink.step >= Math.max(2, ink.cap * .1))
            spaces.push({ left: start * ink.step, right: index * ink.step });
          start = -1;
        }
      }
      const dilation = (Math.ceil(padding / hero.ink.step) + 1) * hero.ink.step;
      let previousTop = Infinity, previousBottom = -Infinity;
      hero.ink.skyline.forEach((column, index) => {
        if (Math.abs(column.top - previousTop) > ink.cap * .2 ||
            Math.abs(column.bottom - previousBottom) > ink.cap * .2 ||
            Number.isFinite(column.top) !== Number.isFinite(previousTop)) {
          const x = hero.x + index * hero.ink!.step;
          for (const value of [x - padding - ink.width, x + padding]) {
            if (value >= railLeft && value + ink.width <= railRight) positions.add(value);
          }
          for (const space of spaces) for (const value of [x - dilation - space.left, x + dilation - space.right]) {
            if (value >= railLeft && value + ink.width <= railRight) positions.add(value);
          }
        }
        previousTop = column.top; previousBottom = column.bottom;
      });
    }
    const candidates: SurroundPlacement<T>[] = [];
    for (const side of [-1, 1] as const) {
      if (preferredSide !== undefined && side !== preferredSide) continue;
      for (const x of positions) {
        const contact = Math.max(0, Math.min(hero.x + width, x + ink.width) - Math.max(hero.x, x));
        if (contact < Math.min(width * .35, ink.width * .35)) continue;
        const fitted = baselineAt(ink, x, side, main, padding, gap);
        const piece: SurroundPlacement<T> = { part, x,
          baseline: side < 0 ? Math.min(fitted, hero.top + maxOverlap - ink.bottom)
            : Math.max(fitted, hero.bottom - maxOverlap - ink.top), edge: side < 0 ? "above" : "below" };
        if (fits(piece) && !helperInkCollision(ink, x, piece.baseline, hero, gap * .65)) {
          candidates.push(piece); heroSafe.add(piece);
        }
      }
    }
    if (preferredSide === undefined) {
      const bandTop = hero.top - ink.top, bandBottom = hero.bottom - ink.bottom;
      const baselines = new Set([bandTop, bandBottom, (bandTop + bandBottom) / 2]);
      const yStep = Math.max(3, ink.cap / 4, Math.abs(bandBottom - bandTop) / 12);
      for (let y = Math.min(bandTop, bandBottom); y <= Math.max(bandTop, bandBottom); y += yStep) baselines.add(y);
      for (const baseline of baselines) {
        let left = hero.x + width, right = hero.x;
        if (hero.ink?.skyline.length) {
          hero.ink.skyline.forEach((column, index) => {
            if (Number.isFinite(column.top) && (hero.baseline ?? 0) + column.bottom + gap > baseline + ink.top &&
                (hero.baseline ?? 0) + column.top - gap < baseline + ink.bottom) {
              left = Math.min(left, hero.x + index * hero.ink!.step);
              right = Math.max(right, hero.x + (index + 1) * hero.ink!.step);
            }
          });
        } else { left = hero.x; right = hero.x + width; }
        for (const edge of ["left", "right"] as const) {
          const piece = { part, baseline, edge, x: edge === "left"
            ? Math.min(left - gap - padding - ink.width, hero.x + maxOverlap - ink.width)
            : Math.max(right + gap + padding, hero.x + width - maxOverlap) };
          if (fits(piece) && !helperInkCollision(ink, piece.x, baseline, hero, gap)) {
            candidates.push(piece); heroSafe.add(piece);
          }
        }
      }
    }
    const localScore = (piece: SurroundPlacement<T>) => {
      const bounds = obstacleFor(piece);
      const w = Math.max(hero.x + width, bounds.x + bounds.width) - Math.min(hero.x, bounds.x);
      const h = Math.max(hero.bottom, bounds.bottom) - Math.min(hero.top, bounds.top);
      const anchors = [hero.x, hero.x + width - ink.width, hero.x + (width - ink.width) / 2];
      return h / heroHeight + w / availableWidth * .35 +
        Math.min(...anchors.map(anchor => Math.abs(piece.x - anchor))) / cap * .04;
    };
    // Retain candidates from every region, not just the first high-scoring row.
    const selected: SurroundPlacement<T>[] = [];
    for (const edge of ["above", "below", "left", "right"] as const) {
      const rows = candidates.filter(piece => piece.edge === edge).sort((a, b) => localScore(a) - localScore(b));
      const buckets = new Set<string>();
      for (const piece of rows) {
        const key = `${Math.round(piece.x / Math.max(4, ink.cap * .55))}:${Math.round(piece.baseline / Math.max(4, ink.cap * .4))}`;
        if (buckets.has(key)) continue;
        selected.push(piece); buckets.add(key);
        if (buckets.size >= 10) break;
      }
    }
    options.set(part, selected);
    return selected;
  };
  type State = { pieces: SurroundPlacement<T>[]; last?: SurroundPlacement<T>; cost: number };
  const compositionScore = (pieces: SurroundPlacement<T>[]) => {
    const occupied = [hero, ...pieces.map(obstacleFor)];
    const left = Math.min(...occupied.map(value => value.x));
    const right = Math.max(...occupied.map(value => value.x + value.width));
    const top = Math.min(...occupied.map(value => value.top));
    const bottom = Math.max(...occupied.map(value => value.bottom));
    return (bottom - top) / heroHeight * .7 + (right - left) / availableWidth * .35 +
      (right - left) * (bottom - top) / (availableWidth * heroHeight) * .35 + pieces.length * .045;
  };
  const signature = (state: State) => state.pieces.map(piece =>
    `${piece.edge}:${Math.round(piece.x)}:${Math.round(piece.baseline)}:${piece.part.words}`).join("/");
  const prune = (states: State[], limit: number) => {
    if (!states.length) return [];
    const sorted = states.sort((a, b) => a.cost - b.cost);
    const chosen: State[] = [], regions = new Set<string>(), seen = new Set<string>();
    // Keep a good complete alternative from each route before filling by score.
    for (const state of sorted) {
      const region = state.pieces.map(piece => piece.edge).join("/");
      const key = signature(state);
      if (regions.has(region)) continue;
      chosen.push(state); regions.add(region); seen.add(key);
      if (chosen.length >= Math.ceil(limit / 2)) break;
    }
    for (const state of sorted) {
      const key = signature(state);
      if (chosen.length >= limit) break;
      if (seen.has(key)) continue;
      chosen.push(state); seen.add(key);
      if (chosen.length >= limit) break;
    }
    return chosen;
  };
  let beam: State[] = [{ pieces: [], cost: compositionScore([]) }];
  for (const flow of flows) {
    const frontiers: State[][] = Array.from({ length: flow.length + 1 }, () => []);
    frontiers[0] = beam.map(state => ({ ...state, last: undefined }));
    for (let from = 0; from < flow.length; from++) {
      const states = prune(frontiers[from], 12);
      if (!states.length) continue;
      const ends = split ? [...new Set([flow.length, ...Array.from({ length: Math.min(8, flow.length - from) }, (_, i) => from + i + 1)])] : [flow.length];
      for (const to of ends) {
        const part = flow.part(from, to);
        for (const state of states) {
          if (state.pieces.length >= maxFragments) continue;
          const occupied = state.pieces.map(obstacleFor);
          const gap = Math.max(2, part.ink.cap * gapRatio);
          const candidates = [...candidatesFor(part)];
          if (state.last) {
            // Adjacent groups may share a row only at their natural space width.
            const previous = state.last;
            candidates.push({ part, x: previous.x + previous.part.ink.width + naturalGap(previous.part.value, part.value),
              baseline: previous.baseline, edge: previous.edge });
          }
          if (occupied.length) {
            // A new wrapped row uses the real occupied edge, preserving one
            // normal text run rather than stretching spaces around a stem.
            for (const edge of ["above", "below"] as const) {
              if (preferredSide !== undefined && (edge === "above" ? -1 : 1) !== preferredSide) continue;
              const baseline = edge === "above"
                ? Math.min(hero.top, ...occupied.map(value => value.top)) - gap - part.ink.bottom
                : Math.max(hero.bottom, ...occupied.map(value => value.bottom)) + gap - part.ink.top;
              for (const x of [hero.x, hero.x + width - part.ink.width, hero.x + (width - part.ink.width) / 2])
                candidates.push({ part, x, baseline, edge });
            }
          }
          for (const candidate of candidates) {
            if (!fits(candidate)) continue;
            const previous = state.last;
            if (previous) {
              const sameRow = Math.abs(candidate.baseline - previous.baseline) <= 0.5;
              if (sameRow) {
                const actual = candidate.x - previous.x - previous.part.ink.width;
                if (Math.abs(actual - naturalGap(previous.part.value, part.value)) > .75) continue;
              } else if (candidate.baseline + part.ink.top < previous.baseline + previous.part.ink.bottom + gap) continue;
            }
            if ((!heroSafe.has(candidate) && helperInkCollision(part.ink, candidate.x, candidate.baseline, hero, gap * .65)) ||
                occupied.some(value => helperInkCollision(part.ink, candidate.x, candidate.baseline, value, gap * .65))) continue;
            const pieces = [...state.pieces, candidate];
            const sidePenalty = candidate.edge === (flow.preferredSide < 0 ? "above" : "below") ? 0 : .025;
            frontiers[to].push({ pieces, last: candidate, cost: compositionScore(pieces) + sidePenalty });
          }
        }
        if (frontiers[to].length > 48) frontiers[to] = prune(frontiers[to], 24);
      }
    }
    beam = prune(frontiers[flow.length], 16);
    if (!beam.length) return null;
  }
  const best = Math.min(...beam.map(state => state.cost));
  const finalists = beam.filter(state => state.cost <= best + Math.max(.015, best * .035 * variation));
  finalists.sort((a, b) => variation > 0 ? hash(`${seed}:${signature(a)}`) - hash(`${seed}:${signature(b)}`) : a.cost - b.cost);
  return finalists[0]?.pieces ?? null;
};

/** Pack actual words into the valleys between protruding strokes. Each row has
 * one shared baseline; a larger gap is legal only where the hero occupies it.
 * This intentionally allows bounding boxes to overlap while painted ink stays clear.
 */
export const fitWordPockets = <T>({ flows, hero, availableWidth, availableHeight,
  sideClearance, gapRatio, naturalGap, seed, variation = 0,
}: {
  flows: HelperFlow<T>[]; hero: InkObstacle; availableWidth: number; availableHeight: number;
  sideClearance: number; gapRatio: number; naturalGap: (previous: T, next: T) => number;
  seed: string; variation?: number;
}): SurroundPlacement<T>[] | null => {
  if (!flows.length) return [];
  const words = flows.map(flow => Array.from({ length: flow.length }, (_, index) => flow.part(index, index + 1)));
  const all = words.flat();
  if (!all.length || hero.width > availableWidth || hero.bottom - hero.top > availableHeight) return null;
  const cap = Math.max(1, ...all.map(part => part.ink.cap));
  const padding = Math.max(1, cap * sideClearance);
  const gap = Math.max(1.5, cap * gapRatio);
  const helperTop = Math.min(...all.map(part => part.ink.top));
  const helperBottom = Math.max(...all.map(part => part.ink.bottom));
  const quantile = (values: number[], ratio: number, fallback: number) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * ratio)] ?? fallback;
  };
  const skyline = hero.ink?.skyline ?? [];
  const origin = hero.baseline ?? 0;
  const bodyTop = origin + quantile(skyline.map(column => column.top), .45, hero.top - origin);
  const bodyBottom = origin + quantile(skyline.map(column => column.bottom), .55, hero.bottom - origin);
  const upperInner = bodyTop - gap - helperBottom;
  const upperOuter = hero.top - gap - helperBottom;
  const lowerInner = bodyBottom + gap - helperTop;
  const lowerOuter = hero.bottom + gap - helperTop;
  const levels = (inner: number, outer: number) => [...new Set(Array.from({ length: 7 }, (_, index) => inner + (outer - inner) * index / 6))];
  const extension = Math.min(cap * .35, Math.max(0, availableWidth - hero.width) / 2);
  const left = hero.x - extension, right = hero.x + hero.width + extension;
  const midY = (hero.top + hero.bottom) / 2;
  const railTop = midY - availableHeight / 2, railBottom = midY + availableHeight / 2;
  const expanded = profiles([hero], padding);
  const choiceCache = new Map<PocketPart<T>, { x: number; above: number; below: number }[]>();
  const boundCache = new Map<PocketPart<T>, Map<number, { above: number; below: number }>>();
  const boundsAt = (part: PocketPart<T>, x: number) => {
    let cache = boundCache.get(part);
    if (!cache) { cache = new Map(); boundCache.set(part, cache); }
    const key = Math.round(x * 1000) / 1000;
    const found = cache.get(key);
    if (found) return found;
    const ink = collisionInk(part.ink);
    // Shared body-band rows already supply the optical anchor. An outer-box
    // edge band here would erase valid valleys beside a tall stem or tail.
    const bounds = { above: baselineAt(ink, x, -1, expanded, padding, gap, false),
      below: baselineAt(ink, x, 1, expanded, padding, gap, false) };
    cache.set(key, bounds); return bounds;
  };
  const choices = (part: PocketPart<T>) => {
    const cached = choiceCache.get(part);
    if (cached) return cached;
    const xs = new Set([left, right - part.ink.width, hero.x,
      hero.x + hero.width - part.ink.width, hero.x + (hero.width - part.ink.width) / 2]);
    const step = Math.max(1, cap / 24, (right - left) / 640);
    for (let x = left; x <= right - part.ink.width; x += step) xs.add(x);
    const result = [...xs].filter(x => x >= left - .01 && x + part.ink.width <= right + .01)
      .map(x => ({ x, ...boundsAt(part, x) }));
    choiceCache.set(part, result); return result;
  };
  // Prefix sums measure the actual stem/tail occupying an inter-word gap.
  const bandCache = new Map<number, Float64Array>();
  const occupiedBetween = (from: number, to: number, baseline: number) => {
    if (!hero.ink?.skyline.length || to <= from) return 0;
    let prefix = bandCache.get(baseline);
    if (!prefix) {
      prefix = new Float64Array(skyline.length + 1);
      skyline.forEach((column, index) => {
        const blocked = Number.isFinite(column.top) && origin + column.bottom + gap > baseline + helperTop &&
          origin + column.top - gap < baseline + helperBottom;
        prefix![index + 1] = prefix![index] + (blocked ? hero.ink!.step : 0);
      });
      bandCache.set(baseline, prefix);
    }
    const start = Math.max(0, Math.min(skyline.length, Math.floor((from - hero.x) / hero.ink.step)));
    const end = Math.max(start, Math.min(skyline.length, Math.ceil((to - hero.x) / hero.ink.step)));
    return prefix[end] - prefix[start];
  };
  type WordState = { pieces: SurroundPlacement<T>[]; cost: number; last?: SurroundPlacement<T> };
  const finals: WordState[] = [];
  for (const upper of levels(upperInner, upperOuter)) for (const lower of levels(lowerInner, lowerOuter)) {
    if (upper + helperTop < railTop || lower + helperBottom > railBottom) continue;
    let beam: WordState[] = [{ pieces: [], cost: 0 }];
    for (let flowIndex = 0; flowIndex < flows.length && beam.length; flowIndex++) {
      for (const part of words[flowIndex]) {
        const next: WordState[] = [];
        for (const state of beam) for (const side of [-1, 1] as const) {
          const edge = side < 0 ? "above" : "below";
          const baseline = side < 0 ? upper : lower;
          const previous = state.last;
          if (previous?.edge === "below" && side < 0) continue;
          const sameRow = previous?.edge === edge;
          const normal = previous ? naturalGap(previous.part.value, part.value) : 0;
          const minimumX = sameRow ? previous!.x + previous!.part.ink.width + normal : left;
          const candidates = choices(part).filter(choice => choice.x >= minimumX - .01 &&
            (side < 0 ? baseline <= choice.above + .01 : baseline >= choice.below - .01));
          if (sameRow && minimumX + part.ink.width <= right) candidates.push({ x: minimumX, ...boundsAt(part, minimumX) });
          const valid: { piece: SurroundPlacement<T>; cost: number }[] = [];
          for (const choice of candidates) {
            if (side < 0 ? baseline > choice.above + .01 : baseline < choice.below - .01) continue;
            let spacingCost = 0;
            if (sameRow) {
              const actual = choice.x - previous!.x - previous!.part.ink.width;
              const extra = Math.max(0, actual - normal);
              if (extra > Math.max(1, cap * .05)) {
                const occupied = occupiedBetween(previous!.x + previous!.part.ink.width, choice.x, baseline);
                if (occupied <= 0 || extra > Math.max(cap * 3.5, hero.width * .3) ||
                    extra - occupied - padding * 2 > cap * .48) continue;
                spacingCost = Math.max(0, extra - occupied) / cap * .12 + occupied / cap * .025;
              }
            }
            const piece: SurroundPlacement<T> = { part, x: choice.x, baseline, edge };
            const clashes = state.pieces.some(placed => helperInkCollision(part.ink, choice.x, baseline, {
              x: placed.x, width: placed.part.ink.width, baseline: placed.baseline, ink: placed.part.ink,
              top: placed.baseline + placed.part.ink.top, bottom: placed.baseline + placed.part.ink.bottom,
            }, Math.min(1.5, gap * .5)));
            if (clashes) continue;
            const distance = side < 0 ? bodyTop - baseline - helperBottom : baseline + helperTop - bodyBottom;
            const preference = side === flows[flowIndex].preferredSide ? 0 : .055;
            const anchor = !previous || !sameRow ? (choice.x - left) / Math.max(1, hero.width) * .035 : 0;
            const cost = distance / cap * .32 + spacingCost + preference + anchor + (previous && !sameRow ? .025 : 0);
            valid.push({ piece, cost });
          }
          // Earlier legal x positions leave room for the remaining source words.
          valid.sort((a, b) => a.cost - b.cost || a.piece.x - b.piece.x);
          const kept = new Set<number>();
          for (const item of valid) {
            const bucket = Math.round(item.piece.x / Math.max(2, cap * .35));
            if (kept.has(bucket)) continue;
            kept.add(bucket); next.push({ pieces: [...state.pieces, item.piece], last: item.piece, cost: state.cost + item.cost });
            if (kept.size >= 5) break;
          }
        }
        next.sort((a, b) => a.cost - b.cost);
        const rows = new Set<string>();
        beam = [];
        for (const state of next) {
          const key = `${state.last!.edge}:${Math.round(state.last!.x / Math.max(2, cap * .3))}:${state.pieces.filter(piece => piece.edge === "below").length}`;
          if (rows.has(key)) continue;
          rows.add(key); beam.push(state);
          if (beam.length >= 10) break;
        }
        if (!beam.length) break;
      }
    }
    for (const state of beam) {
      if (state.pieces.length !== all.length) continue;
      const upperCount = state.pieces.filter(piece => piece.edge === "above").length;
      const lowerCount = state.pieces.length - upperCount;
      const imbalance = all.length >= 5 ? Math.max(0, Math.max(upperCount, lowerCount) - Math.ceil(all.length * .72)) * .06 : 0;
      finals.push({ ...state, cost: state.cost / all.length + imbalance });
    }
  }
  if (!finals.length) return null;
  finals.sort((a, b) => a.cost - b.cost);
  const best = finals[0].cost;
  const candidates = finals.filter(state => state.cost <= best + .008 * variation).slice(0, 12);
  candidates.sort((a, b) => variation > 0 ? hash(`${seed}:${a.pieces.map(piece => `${piece.edge}:${piece.x.toFixed(1)}`).join("/")}`) -
    hash(`${seed}:${b.pieces.map(piece => `${piece.edge}:${piece.x.toFixed(1)}`).join("/")}`) : a.cost - b.cost);
  return candidates[0].pieces;
};
