import { flowNumberParts } from "../SmartTextFlow/numbers";
import { editorialFont } from "./fonts";
import { editorialNumberRuns } from "./numerals";
import type { EditorialInk } from "./layout";

type ContourWord = Omit<EditorialInk, "baseline" | "row">;
export type EditorialContour = {
  left: number; right: number; top: number; bottom: number; step: number;
  columns: { top: number; bottom: number }[];
};
const cache = new Map<string, EditorialContour>();
const CONTOUR_MARGIN = 2;

/** Like StyleOne's skyline measurement, sample shaped glyph ink, including joined scripts. */
export const editorialContour = (words: ContourWord[]): EditorialContour => {
  const key = JSON.stringify(words.map((word) => [word.token.text, word.token.typeRole, word.token.number,
    word.x, word.size, word.weight, word.tracking, word.ascent, word.descent, word.number]));
  const cached = cache.get(key);
  if (cached) return cached;
  const left = Math.floor(Math.min(...words.map((word) => word.x + word.left))) - CONTOUR_MARGIN;
  const right = Math.ceil(Math.max(...words.map((word) => word.x + word.right))) + CONTOUR_MARGIN;
  const top = -Math.ceil(Math.max(...words.map((word) => word.ascent))) - CONTOUR_MARGIN;
  const bottom = Math.ceil(Math.max(...words.map((word) => word.descent))) + CONTOUR_MARGIN;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, right - left); canvas.height = Math.max(1, bottom - top);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("EditorialType needs a canvas to fit glyph contours.");
  ctx.fillStyle = "white"; ctx.textBaseline = "alphabetic"; ctx.fontKerning = "normal";
  const draw = (word: ContourWord, text: string, x: number, size: number, center = false) => {
    const font = editorialFont(word.token.typeRole, word.token.look);
    ctx.font = `${font.style} ${word.weight ?? font.weight} ${size}px ${font.family}`;
    ctx.letterSpacing = `${size * (word.size ? word.tracking / word.size : font.tracking)}px`; ctx.textAlign = center ? "center" : "left";
    ctx.fillText(text, x - left, -top);
  };
  for (const word of words) {
    const number = word.number;
    if (!number) { draw(word, word.token.text, word.x, word.size); continue; }
    const parts = flowNumberParts(word.token.number!, 1, word.token.text);
    for (const run of editorialNumberRuns(number, parts, word.x, word.size)) draw(word, run.text, run.x, run.size, run.center);
  }
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const columns: EditorialContour["columns"] = [];
  for (let x = 0; x < canvas.width; x++) {
    let first = Infinity, last = -Infinity;
    for (let y = 0; y < canvas.height; y++) if (data[(y * canvas.width + x) * 4 + 3] > 12) {
      first = Math.min(first, y + top); last = y + top + 1;
    }
    columns.push({ top: first, bottom: last });
  }
  const result = { left, right, top, bottom, step: 1, columns };
  if (cache.size >= 256) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
};

const quantile = (values: number[], ratio: number) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0;
};

/** Compact optical body bands ignore an isolated tall ascender or sweeping descender. */
const editorialBody = (contour: EditorialContour) => ({
  top: quantile(contour.columns.map((column) => column.top), 0.42),
  bottom: quantile(contour.columns.map((column) => column.bottom), 0.58),
});

export const fitEditorialHelper = (
  main: EditorialContour, helper: EditorialContour, preferredX: number, side: -1 | 1,
  gap: number, envelope: number, centered: boolean,
) => {
  const body = editorialBody(main);
  const helperWidth = helper.right - helper.left;
  const padding = Math.max(1.5, gap * 0.5);
  const left = -envelope / 2, right = envelope / 2 - helperWidth;
  const xs = new Set([preferredX]);
  // Preserve the left/right rail. A bounded nudge can avoid a single flourish.
  if (!centered) for (let offset = -Math.min(24, envelope * 0.055); offset <= Math.min(24, envelope * 0.055); offset += 2) {
    xs.add(Math.max(left, Math.min(right, preferredX + offset)));
  }
  let best: { x: number; baseline: number; score: number } | null = null;
  const helperInkTop = Math.min(...helper.columns.map((column) => column.top));
  const helperInkBottom = Math.max(...helper.columns.map((column) => column.bottom));
  for (const x of xs) {
    const shift = x - helper.left;
    // Keep the phrase above/below the body, never tucked beside the reading line.
    let baseline = side < 0 ? body.top - gap - helperInkBottom : body.bottom + gap - helperInkTop;
    for (let column = 0; column < helper.columns.length; column++) {
      const edge = helper.columns[column];
      if (!Number.isFinite(side < 0 ? edge.bottom : edge.top)) continue;
      const position = helper.left + column + shift;
      const first = Math.max(0, Math.floor(position - padding - main.left));
      const last = Math.min(main.columns.length - 1, Math.ceil(position + padding - main.left));
      for (let at = first; at <= last; at++) {
        const obstacle = main.columns[at];
        if (side < 0 && Number.isFinite(obstacle.top)) baseline = Math.min(baseline, obstacle.top - gap - edge.bottom);
        if (side > 0 && Number.isFinite(obstacle.bottom)) baseline = Math.max(baseline, obstacle.bottom + gap - edge.top);
      }
    }
    const distance = side < 0 ? body.top - baseline - helperInkBottom : baseline + helperInkTop - body.bottom;
    const score = distance + Math.abs(x - preferredX) * 0.3;
    if (!best || score < best.score) best = { x, baseline, score };
  }
  return best!;
};

type Placed<T> = { word: T; x: number; baseline: number; row: number };
type RowFit<T> = { words: T[]; xs: number[]; depth: number; start: number; end: number; score: number; ink: number };
type Side = -1 | 1;

const MOST_ROWS = 3;

/**
 * Finds the arrangement of the helpers that holds on to the hero best. All the space around the
 * hero is open: over its short letters, between its tall strokes, past its tails and beside it.
 * Helpers may break into smaller rows down to one word, the row nearest the hero is placed first,
 * and each further row fits against the hero and everything already placed. Words before the hero
 * stay above or to its left and words after it stay below or to its right, so the sentence always
 * reads in order. A row keeps one baseline and sits as close to the hero's body as its gaps allow:
 * a word may step over a tall stroke, so a wider space is legal only around a stroke that fills it.
 * Above and below are the same search with the vertical axis flipped.
 */
export const nestEditorialRows = <T extends Omit<ContourWord, "x">>(main: EditorialContour, before: T[], after: T[],
  space: number, limit: number): Placed<T>[] => {
  const helpers = [...before, ...after];
  if (!helpers.length) return [];
  const cap = Math.max(...helpers.map(word => word.size)) * .7;
  const gap = Math.max(2.5, cap * .13), padding = Math.max(2, cap * .11);
  // Close enough to read as touching, and the full line height stacked rows keep so they stay readable.
  const reach = cap * .38, lineStep = Math.max(...helpers.map(word => word.ascent)) + Math.max(...helpers.map(word => word.descent)) + 1;
  const res = Math.max(1, Math.round(cap / 20));
  const contours = new Map(helpers.map(word => [word, editorialContour([{ ...word, x: 0 }])]));
  const widest = Math.max(...[...contours.values()].map(contour => contour.right - contour.left));
  const heroWidth = main.right - main.left, heroHeight = main.bottom - main.top;
  const overhang = Math.max((limit - heroWidth) / 2, (widest - heroWidth) / 2 + 1, 0);
  const left = main.left - overhang;
  const cells = Math.ceil((heroWidth + overhang * 2) / res);
  const heroStart = (main.left - left) / res, heroEnd = (main.right - left) / res, heroCenter = (heroStart + heroEnd) / 2;
  const body = editorialBody(main);
  // Only the letters' bodies close the hero's sides: a tail or flourish leaves its space open.
  const inBody = (column: EditorialContour["columns"][number]) => column.top <= body.top + cap * .5 && column.bottom >= body.top;
  const bodyStart = (main.left + main.columns.findIndex(inBody) - left) / res;
  const bodyEnd = (main.left + main.columns.length - 1 - [...main.columns].reverse().findIndex(inBody) - left) / res;
  const spread = Math.ceil(padding / res) + 1;
  const stamp = (edge: Float64Array, cell: number, value: number, by: number) => {
    for (let at = Math.max(0, cell - by); at <= Math.min(cells - 1, cell + by); at++) edge[at] = Math.min(edge[at], value);
  };
  const heroInk = (side: Side, by: number, floor: (cell: number) => number) => {
    const edge = new Float64Array(cells);
    for (let cell = 0; cell < cells; cell++) edge[cell] = floor(cell);
    main.columns.forEach((column, index) => {
      const value = side < 0 ? column.top : -column.bottom;
      if (Number.isFinite(value)) stamp(edge, Math.round((main.left + index - left) / res), value, by);
    });
    return edge;
  };
  // How far a helper may go in each column: to the hero's baseline on the side the sentence comes
  // from, to the top of its body on the side it continues to, never past the far end of the body.
  const heroEdge = (side: Side) => heroInk(side, spread, cell => side < 0
    ? cell < bodyStart ? 0 : body.top
    : cell > bodyEnd ? -body.top : -body.bottom);
  const heroNear = (side: Side) => heroInk(side, Math.ceil(reach / res), () => Infinity);
  const sampled = new Map<T, Map<string, Float64Array>>();
  // Each cell keeps the column that reaches furthest, so a coarse fit can never touch real ink.
  const cellsOf = (word: T, side: Side, facing: boolean) => {
    const key = `${side}${facing}`;
    const known = sampled.get(word)?.get(key);
    if (known) return known;
    const { columns } = contours.get(word)!;
    const result = new Float64Array(Math.ceil(columns.length / res)).fill(-Infinity);
    columns.forEach((column, index) => {
      const value = facing ? side < 0 ? column.bottom : -column.top : side < 0 ? -column.top : column.bottom;
      if (Number.isFinite(value)) result[Math.floor(index / res)] = Math.max(result[Math.floor(index / res)], value);
    });
    if (!sampled.has(word)) sampled.set(word, new Map());
    sampled.get(word)!.set(key, result);
    return result;
  };
  const rooms = new WeakMap<Float64Array, Map<string, Float64Array>>();
  // The deepest baseline at which a word still clears the edge at each x.
  const roomFor = (word: T, side: Side, edge: Float64Array) => {
    if (!rooms.has(edge)) rooms.set(edge, new Map());
    const known = rooms.get(edge)!, key = helpers.indexOf(word) + "";
    if (known.has(key)) return known.get(key)!;
    const ink = cellsOf(word, side, true);
    const room = new Float64Array(Math.max(0, cells - ink.length + 1));
    for (let x = 0; x < room.length; x++) {
      let depth = Infinity;
      for (let column = 0; column < ink.length; column++) {
        if (ink[column] !== -Infinity) depth = Math.min(depth, edge[x + column] - ink[column] - gap);
      }
      room[x] = depth;
    }
    known.set(key, room);
    return room;
  };
  /** The share of a row's ink close enough to something to read as touching it. */
  const nearShare = (inks: Float64Array[], xs: number[], depth: number, edge: Float64Array) => {
    let close = 0, total = 0;
    inks.forEach((ink, index) => {
      for (let column = 0; column < ink.length; column++) {
        if (ink[column] === -Infinity) continue;
        total++;
        if (edge[xs[index] + column] - depth - ink[column] <= reach) close++;
      }
    });
    return close / Math.max(1, total);
  };
  const fitRow = (words: T[], side: Side, edge: Float64Array, near: Float64Array, nearer: RowFit<T>[]): RowFit<T> | null => {
    const inks = words.map(word => cellsOf(word, side, true));
    const room = words.map(word => roomFor(word, side, edge));
    if (room.some(item => !item.length)) return null;
    const natural = Math.max(1, Math.round((space - CONTOUR_MARGIN * 2) / res));
    const ordered = (start: number, end: number, depth: number) => nearer.every(row =>
      depth <= row.depth - lineStep || (side < 0 ? end <= row.start : start >= row.end));
    const rigid = (first: number) => {
      const xs = [first];
      let depth = room[0][first];
      for (let index = 1; index < words.length; index++) {
        const x = xs[index - 1] + inks[index - 1].length + natural;
        if (x >= room[index].length) return null;
        depth = Math.min(depth, room[index][x]);
        xs.push(x);
      }
      return { xs, depth };
    };
    let deepest = -Infinity;
    for (let first = 0; first < room[0].length; first++) {
      const row = rigid(first);
      if (row && ordered(first, row.xs[row.xs.length - 1] + inks[inks.length - 1].length, row.depth)) deepest = Math.max(deepest, row.depth);
    }
    if (deepest === -Infinity) return null;
    // Where the row would rest on the hero's body, or on the row before it.
    const reachInk = Math.max(...inks.flatMap(ink => [...ink]));
    const seat = nearer.length ? nearer[nearer.length - 1].depth - lineStep : (side < 0 ? body.top : -body.bottom) - gap - reachInk;
    let best: RowFit<T> | null = null;
    const offer = (xs: number[], depth: number, stretch: number) => {
      const start = xs[0], end = xs[xs.length - 1] + inks[inks.length - 1].length;
      if (!ordered(start, end, depth)) return;
      const width = end - start;
      const hero = nearShare(inks, xs, depth, near), neighbours = nearer.length ? nearShare(inks, xs, depth, edge) : 0;
      const outside = (Math.max(0, heroStart - start) + Math.max(0, end - heroEnd)) / Math.max(1, width);
      const score = Math.min(1, hero / .4) + Math.min(1, neighbours / .4) * .35 - Math.max(0, seat - depth) / cap * .3 -
        Math.abs((start + end) / 2 - heroCenter) * res / heroWidth * .25 - outside * .32 - stretch * res / cap * .05;
      if (!best || score > best.score) best = { words, xs, depth, start, end, score, ink: width };
    };
    for (let first = 0; first < room[0].length; first++) {
      const row = rigid(first);
      if (!row) break;
      if (row.depth >= deepest - cap * 1.2) offer(row.xs, row.depth, 0);
    }
    // Deeper still, the row settles between tall strokes and only steps over the ones in its way.
    const leap = cap * 2.6 / res, stride = Math.max(1, Math.round(cap * .25 / res));
    const open = room[0], lowest = Math.min(Math.max(...open), deepest + cap * 7);
    for (let depth = deepest + cap * .16; depth <= lowest; depth += cap * .16) {
      let chosen: { xs: number[]; stretch: number; cost: number } | null = null;
      for (let first = 0; first < open.length; first++) {
        const rim = first === 0 || first === open.length - 1 || open[first - 1] < depth || open[first + 1] < depth;
        if (open[first] < depth || (first % stride && !rim)) continue;
        const xs = [first];
        let stretch = 0;
        for (let index = 1; index < words.length; index++) {
          const start = xs[index - 1] + inks[index - 1].length + natural;
          let x = start;
          while (x < room[index].length && x - start <= leap && room[index][x] < depth) x++;
          if (x >= room[index].length || x - start > leap) break;
          stretch += x - start;
          xs.push(x);
        }
        if (xs.length < words.length) continue;
        const end = xs[xs.length - 1] + inks[inks.length - 1].length;
        if (!ordered(first, end, depth)) continue;
        const cost = Math.abs((first + end) / 2 - heroCenter) + (Math.max(0, heroStart - first) + Math.max(0, end - heroEnd)) * 1.5 + stretch * .4;
        if (!chosen || cost < chosen.cost) chosen = { xs, stretch, cost };
      }
      if (chosen) offer(chosen.xs, depth, chosen.stretch);
    }
    return best;
  };
  const raised = (edge: Float64Array, row: RowFit<T>, side: Side) => {
    const result = edge.slice();
    row.words.forEach((word, index) => {
      cellsOf(word, side, false).forEach((value, column) => {
        if (value !== -Infinity) stamp(result, row.xs[index] + column, row.depth - value, spread);
      });
    });
    return result;
  };
  const placeSide = (words: T[], side: Side): Placed<T>[] => {
    if (!words.length) return [];
    const count = words.length, near = heroNear(side), start = heroEdge(side);
    const top = Math.min(...start);
    const take = (from: number, length: number) => side < 0 ? words.slice(count - from - length, count - from) : words.slice(from, from + length);
    let best: { rows: RowFit<T>[]; score: number } | null = null;
    const visit = (from: number, rows: RowFit<T>[], edge: Float64Array, left: number) => {
      if (from === count) {
        const ink = rows.reduce((sum, row) => sum + row.ink, 0);
        const outer = Math.min(...rows.flatMap(row => row.words.map(word =>
          row.depth - Math.max(...cellsOf(word, side, false)))));
        const height = Math.max(0, top - outer) / heroHeight;
        const score = rows.reduce((sum, row) => sum + row.score * row.ink, 0) / Math.max(1, ink) - height * .45 - (rows.length - 1) * .05;
        if (!best || score > best.score) best = { rows, score };
        return;
      }
      if (!left) return;
      for (let length = count - from; length >= 1; length--) {
        const row = fitRow(take(from, length), side, edge, near, rows);
        if (row) visit(from + length, [...rows, row], raised(edge, row, side), left - 1);
      }
    };
    for (let most = Math.min(MOST_ROWS, count); !best && most <= count; most++) visit(0, [], start, most);
    if (!best) throw new Error("EditorialType could not place a helper row.");
    return (best as { rows: RowFit<T>[] }).rows.flatMap((row, index) => row.words.map((word, at) => ({ word,
      x: left + row.xs[at] * res - contours.get(word)!.left, baseline: side < 0 ? row.depth : -row.depth,
      row: side < 0 ? -index : 2 + index })));
  };
  return [...placeSide(before, -1), ...placeSide(after, 1)];
};
