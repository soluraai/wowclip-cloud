import { NO_SPACING, type PartSpacing } from "../Premium/sizes";
import type { SignatureCue } from "../Premium/Signature/engine";
import type { SignatureFace } from "../Premium/Signature/fonts";
import type { Word } from "../LaunchCaptionPack/types";
import type { CuratedFaces } from "./fonts";
import { measureLetterEdges } from "./letterHighlight";
import type { PartSizes } from "../Premium/sizes";
import { latinText, mixText } from "../Script/mix";
import { compactInk } from "../Script/scripts";

export type CuratedVariant = "red-wipe" | "creator" | "hind" | "dynamic-simple" | "relay-flow" | "luma-script" | "verse-flow";
export type CuratedRun = { word: Word; text: string; face: SignatureFace; size: number; x: number; y: number;
  left: number; right: number; ascent: number; descent: number; advance: number; tracking: number; row: number; hero: boolean;
  letterEdges?: number[] };
export type CuratedLayout = { runs: CuratedRun[]; width: number; height: number; left: number; top: number; bottom: number;
  rows: { left: number; top: number; width: number; height: number; baseline: number }[];
  /** How far this caption had to shrink to fit by itself. */
  fit: number;
  treatment?: "inline" | "stack" | "plain" };

/** Red Wipe and Creator have a headline row, not a headline word. */
export const curatedMain = (variant: CuratedVariant, row: number, hero: boolean) =>
  variant === "red-wipe" || variant === "creator" ? row === 1 : hero;

const sized = (sizes: PartSizes | undefined, main: boolean, id: string) =>
  sizes ? sizes[main ? "main" : "helper"] * (sizes.words[id] ?? 1) : 1;

/** Luma keeps its serif word inline. Verse Flow stacks the sentence on a diagonal around a large
 * serif word that overlaps the rows beside it, with quiet all-sans beats between. */
const layoutMixedCue = (cue: SignatureCue, ctx: CanvasRenderingContext2D, variant: "luma-script" | "verse-flow",
  faces: CuratedFaces, size: number, maxWidth: number, cap: number, sizes?: PartSizes): CuratedLayout => {
  const verse = variant === "verse-flow";
  const authored = cue.words.some(word => word.emphasis);
  const heroed = authored || cue.words.some(word => word.id === cue.heroId);
  const treatment: NonNullable<CuratedLayout["treatment"]> = !verse ? "inline" :
    !heroed || !authored && cue.index % 3 === 1 ? "plain" : "stack";
  const entries = cue.words.map(word => {
    const hero = treatment !== "plain" && (authored ? word.emphasis : word.id === cue.heroId);
    const text = hero ? mixText(word) : word.text;
    const face = hero ? faces.serif : faces.main;
    const fontSize = size * (hero ? verse ? 1.46 : .98 : verse ? .66 : .73) * sized(sizes, !!hero, word.id);
    const tracking = fontSize * ((hero ? -.015 : -.02) + (hero ? extraTracking.main : extraTracking.helper));
    ctx.font = `${face.italic ? "italic " : ""}${face.weight} ${fontSize}px "${face.family}"`;
    ctx.letterSpacing = `${tracking}px`;
    const m = ctx.measureText(text);
    return { word, text, face, hero, size: fontSize, tracking, row: 0,
      left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, advance: m.width,
      ...compactInk(ctx, text, m.actualBoundingBoxAscent, Math.max(0, m.actualBoundingBoxDescent)), x: 0, y: 0 };
  });
  const gap = size * .17;
  // Italic overhang can extend past the advance width. Separate actual ink,
  // otherwise adjacent serif keywords visually run into one another.
  const inkWidth = (items: typeof entries) => items.reduce((n, item) => n + item.left + item.right, 0) +
    Math.max(0, items.length - 1) * gap;
  const balanced = (items: typeof entries) => {
    if (items.length < 2 || items.length <= 4 && inkWidth(items) < maxWidth * .88) return [items];
    let split = 1, best = Infinity;
    for (let i = 1; i < items.length; i++) {
      const a = inkWidth(items.slice(0, i)), b = inkWidth(items.slice(i));
      const score = Math.abs(a - b) + Math.max(0, a - maxWidth, b - maxWidth) * 4 +
        (items.length > 3 && (i === 1 || i === items.length - 1) ? size * .7 : 0);
      if (score < best) { best = score; split = i; }
    }
    return [items.slice(0, split), items.slice(split)];
  };
  let groups: typeof entries[];
  const heroAt = entries.findIndex(item => item.hero);
  if (treatment === "stack") {
    groups = [...(heroAt ? balanced(entries.slice(0, heroAt)) : []), entries.slice(heroAt, heroAt + 1),
      ...(heroAt + 1 < entries.length ? balanced(entries.slice(heroAt + 1)) : [])];
  } else groups = balanced(entries);
  const heroRow = groups.findIndex(items => items.some(item => item.hero));
  const runs: CuratedRun[] = [], rows: CuratedLayout["rows"] = [];
  let top = 0;
  groups.forEach((items, row) => {
    const w = inkWidth(items), ascent = Math.max(...items.map(item => item.ascent)), descent = Math.max(...items.map(item => item.descent));
    const left = -w / 2 + (treatment === "stack" ? Math.sign(row - heroRow) * size * .42 : 0);
    let x = left;
    for (const item of items) {
      runs.push({ ...item, row, x: x + item.left, y: top + ascent });
      x += item.left + item.right + gap;
    }
    rows.push({ left, top, width: w, height: ascent + descent, baseline: top + ascent });
    top += ascent + descent + size * (treatment !== "stack" ? .12 : row === heroRow || row + 1 === heroRow ? -.13 : .03);
  });
  const inkLeft = Math.min(...runs.map(run => run.x - run.left)), inkRight = Math.max(...runs.map(run => run.x + run.right));
  const bottom = Math.max(...runs.map(run => run.y + run.descent));
  const padding = size * .22, fullWidth = inkRight - inkLeft + padding * 2;
  const fit = Math.min(1, maxWidth / Math.max(1, fullWidth)), scale = Math.min(cap, fit);
  const cx = (inkLeft + inkRight) / 2, cy = bottom / 2;
  return { treatment, fit, runs: runs.map(run => ({ ...run, x: (run.x - cx) * scale, y: (run.y - cy) * scale,
    size: run.size * scale, tracking: run.tracking * scale, left: run.left * scale, right: run.right * scale,
    ascent: run.ascent * scale, descent: run.descent * scale, advance: run.advance * scale })),
    rows: rows.map(row => ({ ...row, left: (row.left - cx) * scale, top: (row.top - cy) * scale,
      width: row.width * scale, height: row.height * scale, baseline: (row.baseline - cy) * scale })),
    left: (inkLeft - padding - cx) * scale, width: fullWidth * scale, height: bottom * scale, top: -cy * scale, bottom: cy * scale };
};

/** Measure the complete cue once. Word entrances never move an already placed word. */
const layoutRows = (cue: SignatureCue, ctx: CanvasRenderingContext2D, variant: CuratedVariant,
  faces: CuratedFaces, size: number, maxWidth: number, cap: number, sizes?: PartSizes): CuratedLayout => {
  if (variant === "luma-script" || variant === "verse-flow") return layoutMixedCue(cue, ctx, variant, faces, size, maxWidth, cap, sizes);
  const heroIndex = cue.words.findIndex(word => word.id === cue.heroId);
  const middle = Math.max(1, Math.ceil(cue.words.length / 2));
  const dynamic = variant === "dynamic-simple", relay = variant === "relay-flow";
  const mode = cue.index % 3;
  const letters = (words: Word[]) => words.reduce((sum, word) => sum + word.text.length, 0) + words.length - 1;
  let split = middle, even = Infinity;
  for (let at = 1; at < cue.words.length; at++) {
    const gapAt = Math.abs(letters(cue.words.slice(0, at)) - letters(cue.words.slice(at)));
    if (gapAt < even) { even = gapAt; split = at; }
  }
  const groups = dynamic && mode === 1 && heroIndex > 0 && heroIndex < cue.words.length - 1
    ? [cue.words.slice(0, heroIndex), [cue.words[heroIndex]], cue.words.slice(heroIndex + 1)]
    : cue.words.length === 1 ? [cue.words] : [cue.words.slice(0, split), cue.words.slice(split)];
  const runs: CuratedRun[] = [];
  const rows: CuratedLayout["rows"] = [];
  let top = 0;
  groups.forEach((words, row) => {
    const entries = words.map(word => {
      const hero = word.emphasis === true || word.id === cue.heroId;
      // Mix captions: Red Wipe and Creator set their top row in English letters and keep the bottom row in the
      // speaker's script; other variants show the main word in English letters.
      const twoLine = variant === "red-wipe" || variant === "creator";
      const own = twoLine ? row === 0 ? latinText(word) : word.text : hero ? mixText(word) : word.text;
      const text = variant === "creator" || relay ? own.toUpperCase() : own;
      const fontSize = size * (variant === "red-wipe" ? row === 0 ? .73 : .88 :
        variant === "creator" ? row === 0 ? .72 : .84 :
        variant === "hind" ? hero ? .94 : cue.heroId ? .62 : .74 : dynamic ? hero ? 1.08 : row === 1 && mode !== 1 ? .86 : .68 : .79) *
        sized(sizes, curatedMain(variant, row, hero), word.id);
      const face = variant === "red-wipe" ? row === 0 ? faces.sans : faces.main :
        variant === "creator" ? row === 0 ? faces.sans : faces.main : relay ? hero ? faces.main : faces.sans : hero || dynamic && row === 1 ? faces.main : faces.sans;
      const tracking = (variant === "creator" ? fontSize * (row === 0 ? .04 : -.03) : dynamic ? fontSize * -.03 : 0) + fontSize * (hero ? extraTracking.main : extraTracking.plain);
      ctx.font = `${face.italic ? "italic " : ""}${face.weight} ${fontSize}px "${face.family}"`;
      ctx.letterSpacing = `${tracking}px`;
      const m = ctx.measureText(text);
      return { word, text, hero, row, face, size: fontSize, tracking,
        left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, advance: m.width,
        ...compactInk(ctx, text, m.actualBoundingBoxAscent, Math.max(0, m.actualBoundingBoxDescent)),
        ...(dynamic && hero ? { letterEdges: measureLetterEdges(ctx, text, m.actualBoundingBoxLeft + m.actualBoundingBoxRight) } : {}) };
    });
    const gap = size * (variant === "hind" ? .13 : .17);
    const advance = entries.reduce((sum, item) => sum + item.advance, 0) + gap * (entries.length - 1);
    const inkLeft = -entries[0].left, inkRight = advance - entries[entries.length - 1].advance + entries[entries.length - 1].right;
    const rowWidth = inkRight - inkLeft;
    const ascent = Math.max(...entries.map(item => item.ascent)), descent = Math.max(...entries.map(item => item.descent));
    let x = -rowWidth / 2 - inkLeft;
    const baseline = top + ascent;
    for (const entry of entries) { runs.push({ ...entry, x, y: baseline }); x += entry.advance + gap; }
    rows.push({ left: -rowWidth / 2, top, width: rowWidth, height: ascent + descent, baseline });
    top += ascent + descent + size * (variant === "creator" ? .11 : variant === "red-wipe" ? .15 : .18);
  });
  const bottom = Math.max(...runs.map(run => run.y + run.descent));
  // Reserve highlight padding and the Creator row's seven-degree skew.
  const inset = variant === "creator" ? size * .16 : dynamic || relay || variant === "red-wipe" ? size * .13 : 0;
  const left = Math.min(...rows.map(row => row.left)) - inset;
  const right = Math.max(...rows.map(row => row.left + row.width)) + inset;
  const fit = Math.min(1, maxWidth / Math.max(1, right - left)), scale = Math.min(cap, fit);
  const centerY = bottom / 2;
  return { fit, runs: runs.map(run => ({ ...run, x: run.x * scale, y: (run.y - centerY) * scale,
    size: run.size * scale, tracking: run.tracking * scale, left: run.left * scale, right: run.right * scale,
    ascent: run.ascent * scale, descent: run.descent * scale, advance: run.advance * scale })),
    rows: rows.map(row => ({ left: row.left * scale, top: (row.top - centerY) * scale,
      width: row.width * scale, height: row.height * scale, baseline: (row.baseline - centerY) * scale })),
    width: (right - left) * scale, height: bottom * scale, left: left * scale, top: -centerY * scale, bottom: centerY * scale };
};

/** Spacing picked in the editor, as a share of each word's size; set for the length of one layout pass. */
let extraTracking: PartSpacing = NO_SPACING;
export const layoutCuratedCue = (cue: SignatureCue, ctx: CanvasRenderingContext2D, variant: CuratedVariant,
  faces: CuratedFaces, size: number, maxWidth: number, cap = 1, sizes?: PartSizes, tracking: PartSpacing = NO_SPACING): CuratedLayout => {
  extraTracking = tracking;
  const lay = (own: PartSizes | undefined, box = maxWidth) => layoutRows(cue, ctx, variant, faces, size, box, cap, own);
  if (!sizes || sizes.main <= 1) return lay(sizes);
  // A bigger pick may pass the text box, up to the frame's safe edge.
  const box = Math.max(maxWidth, Math.min(676, maxWidth * sizes.main));
  let placed = lay(sizes, box);
  // A main word that outgrows the box stops there, rather than shrinking the words around it.
  const floor = Math.min(cap, lay(undefined).fit);
  let main = sizes.main;
  for (let pass = 0; pass < 3 && main > 1 && placed.fit < floor; pass++) {
    main = Math.max(1, main * placed.fit / floor);
    placed = lay({ ...sizes, main }, box);
  }
  return placed;
};
