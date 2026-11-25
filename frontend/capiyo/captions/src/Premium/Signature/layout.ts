import type { PartSpacing } from "../sizes";
import type { Word } from "../../LaunchCaptionPack/types";
import type { SignatureCue, SignatureVariant } from "./engine";
import type { SignatureFace, SignatureFaces } from "./fonts";
import type { PartSizes } from "../sizes";

export type SignatureRun = { word: Word; text: string; role: "hero" | "before" | "after";
  x: number; y: number; size: number; face: SignatureFace; left: number; right: number; ascent: number; descent: number; tracking: number };
export type SignatureLayout = { runs: SignatureRun[]; top: number; bottom: number; left: number; right: number;
  box: { left: number; top: number; width: number; height: number }; height: number;
  /** How much of the full size this headline could take, for evening sizes across a video. */
  fit: number };

/** Glyph metrics, one parent coordinate system, and stable positions for every word. */
export const layoutSignatureCue = (cue: SignatureCue, ctx: CanvasRenderingContext2D, variant: SignatureVariant,
  faces: SignatureFaces, fontSize: number, maxWidth: number, sizeCap = 1, sizes?: PartSizes, tracking: PartSpacing = { main: 0, helper: 0, script: 0, plain: 0 }): SignatureLayout => {
  /** Spacing picked in the editor, as a share of each word's size. */
  const extraTracking = tracking;
  const heroIndex = cue.words.findIndex(word => word.id === cue.heroId);
  const main = cue.words[heroIndex];
  const measure = (word: Word, role: SignatureRun["role"], requested: number) => {
    const size = requested * (sizes ? sizes[role === "hero" ? "main" : "helper"] * (sizes.words[word.id] ?? 1) : 1);
    const text = role === "hero" ? word.text.toUpperCase() : word.text;
    const face = role === "hero" ? faces.main : faces.text;
    ctx.font = `${face.italic ? "italic " : ""}${face.weight} ${size}px "${face.family}"`;
    const tracking = (variant === "ember-lock" && role === "hero" ? size * -1.5 / 90 : 0) + size * (role === "hero" ? extraTracking.main : extraTracking.helper);
    ctx.letterSpacing = `${tracking}px`;
    const m = ctx.measureText(text);
    return { word, text, role, size, face, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent, descent: Math.max(0, m.actualBoundingBoxDescent), advance: m.width,
      fontAscent: m.fontBoundingBoxAscent, fontDescent: m.fontBoundingBoxDescent, tracking };
  };
  const raw = measure(main, "hero", fontSize);
  const pick = sizes ? sizes.main * (sizes.words[main.id] ?? 1) : 1;
  // A bigger pick may pass the text box, up to the frame's safe edge.
  const widest = Math.max(maxWidth, Math.min(676, maxWidth * pick));
  const room = Math.min(1, (widest - 36) / Math.max(1, raw.left + raw.right));
  const heroSize = fontSize * Math.min(room, sizeCap);
  // Helpers follow the design's headline, so the main word's size pick leaves them alone.
  const heroDesign = fontSize * Math.min(1, room * pick, sizeCap);
  const hero = measure(main, "hero", heroSize);
  const heroWidth = hero.left + hero.right;
  const heroLeft = -heroWidth / 2, heroRight = heroWidth / 2;
  const heroTop = -hero.ascent, heroBottom = hero.descent;
  const runs: SignatureRun[] = [{ ...hero, x: heroLeft + hero.left, y: 0 }];
  const rowWidth = (words: Word[], role: "before" | "after", size: number) =>
    words.map(word => measure(word, role, size)).reduce((sum, run) => sum + run.advance, 0) + size * .22 * (words.length - 1);
  const row = (words: Word[], role: "before" | "after", align: "left" | "right" | "center", bottomOrTop: number, stacked = 0): void => {
    if (!words.length) return;
    const naturalSize = heroDesign * .46;
    const limit = variant === "ember-lock" ? Math.min(maxWidth - 12, Math.max(heroWidth, maxWidth * .72)) : maxWidth - 12;
    // Text too long for one row breaks in two where it balances, and keeps its size.
    if (words.length > 1 && rowWidth(words, role, naturalSize) > limit) {
      let split = 1, best = Infinity;
      for (let at = 1; at < words.length; at++) {
        const worst = Math.max(rowWidth(words.slice(0, at), role, naturalSize), rowWidth(words.slice(at), role, naturalSize));
        if (worst < best) { best = worst; split = at; }
      }
      const near = role === "before" ? words.slice(split) : words.slice(0, split), far = role === "before" ? words.slice(0, split) : words.slice(split);
      row(near, role, align, bottomOrTop, stacked);
      row(far, role, align, bottomOrTop, stacked + 1);
      return;
    }
    const size = naturalSize * Math.min(1, limit / Math.max(1, rowWidth(words, role, naturalSize)));
    const items = words.map(word => measure(word, role, size));
    const advance = items.reduce((sum, run) => sum + run.advance, 0) + size * .22 * (words.length - 1);
    const inkLeft = -items[0].left;
    const inkRight = advance - items[items.length - 1].advance + items[items.length - 1].right;
    const width = inkRight - inkLeft;
    const edge = width > heroWidth ? "center" : align;
    let cursor = (edge === "left" ? heroLeft : edge === "right" ? heroRight - width : -width / 2) - inkLeft;
    // Universal Ember rule: upper ink hugs the headline without crossing it;
    // lower ink nests into the bottom 18%, regardless of the font's ascenders.
    const stack = stacked * naturalSize * 1.2 * (role === "before" ? -1 : 1);
    const baseline = stack + (variant === "ember-lock" ? role === "before"
      ? heroTop - hero.size * .025 - Math.max(...items.map(run => run.descent))
      : heroBottom - (hero.ascent + hero.descent) * .18 + Math.max(...items.map(run => run.ascent)) :
      role === "before" ? bottomOrTop - Math.max(...items.map(run => run.descent)) :
        bottomOrTop + Math.max(...items.map(run => run.ascent)));
    for (const item of items) {
      runs.push({ ...item, x: cursor, y: baseline });
      cursor += item.advance + size * .22;
    }
  };
  const padX = hero.size * .11, padY = hero.size * .1;
  const box = { left: heroLeft - padX, top: heroTop - padY, width: heroWidth + 2 * padX, height: hero.ascent + hero.descent + 2 * padY };
  if (variant === "ember-lock") {
    const mode = cue.index % 4;
    row(cue.words.slice(0, heroIndex), "before", mode === 1 ? "right" : mode === 3 ? "center" : "left", heroTop);
    row(cue.words.slice(heroIndex + 1), "after", mode === 1 ? "left" : mode === 2 ? "center" : "right", heroBottom);
  } else {
    row(cue.words.slice(0, heroIndex), "before", "center", box.top - 9);
    row(cue.words.slice(heroIndex + 1), "after", "center", box.top + box.height + 16);
  }
  let top = Math.min(...runs.map(run => run.y - run.ascent));
  let bottom = Math.max(...runs.map(run => run.y + run.descent));
  let left = Math.min(...runs.map(run => run.x - run.left));
  let right = Math.max(...runs.map(run => run.x + run.right));
  if (variant === "cursor-story") {
    top = Math.min(top, box.top); bottom = Math.max(bottom, box.top + box.height + 18);
    left = Math.min(left, box.left); right = Math.max(right, box.left + box.width + 24);
  }
  const scale = Math.min(1, widest / Math.max(1, right - left));
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  return { runs: runs.map(run => ({ ...run, x: (run.x - centerX) * scale, y: (run.y - centerY) * scale,
    size: run.size * scale, tracking: run.tracking * scale, left: run.left * scale, right: run.right * scale, ascent: run.ascent * scale, descent: run.descent * scale })),
    top: (top - centerY) * scale, bottom: (bottom - centerY) * scale,
    left: (left - centerX) * scale, right: (right - centerX) * scale, height: (bottom - top) * scale,
    box: { left: (box.left - centerX) * scale, top: (box.top - centerY) * scale, width: box.width * scale, height: box.height * scale },
    fit: room * scale,
  };
};
