import { kineticSlices, planKineticEntries } from "../CaptionMotion/kinetic";
import type { Ink } from "../StyleOne/metrics";
import { editorialContour } from "./contours";
import { editorialFont } from "./fonts";
import type { EditorialLayout } from "./layout";
import type { EditorialCue, EditorialSettings } from "./types";

export const prepareEditorialEntries = (layout: EditorialLayout, cue: EditorialCue,
  ctx: CanvasRenderingContext2D, settings: EditorialSettings, width: number, height: number): EditorialLayout => {
  const mainRow = layout.words.find(word => cue.heroIds.includes(word.token.id))?.row;
  const unit = width / 720;
  // Rows around the hero come in from their open side; the rest of a line alternates, so no two neighbours move alike.
  const pathOf = (row: number, index: number, size: number) => {
    const travel = Math.min(size * .42, 30 * unit), sway = index % 2 ? 1 : -1;
    if (cue.kind !== "hero") return index % 2 ? { x: sway * travel * (index % 4 === 1 ? -1 : 1), y: 0 } : { x: 0, y: travel };
    if (row === mainRow) return { x: sway * travel, y: 0 };
    const away = row < mainRow! ? -1 : 1;
    return index % 3 === 1 ? { x: away * travel, y: 0 } : { x: 0, y: away * travel };
  };
  const items = layout.words.map((word, index) => {
    const contour = editorialContour([{ ...word, x: 0 }]);
    const ink: Ink = { left: contour.left, right: contour.right, top: contour.top, bottom: contour.bottom,
      width: contour.right - contour.left, height: contour.bottom - contour.top, cap: word.size * .7,
      advance: word.advance, step: contour.step, skyline: contour.columns };
    const font = editorialFont(word.token.typeRole, word.token.look);
    ctx.font = `${font.style} ${word.weight ?? font.weight} ${word.size}px ${font.family}`;
    ctx.letterSpacing = `${word.tracking}px`; ctx.textAlign = "left";
    return { key: word.token.id, text: word.token.text, x: word.x + ink.left,
      baseline: height * settings.positionY + word.baseline, ink, size: word.size,
      locked: cue.kind === "hero" && word.row === mainRow, path: pathOf(word.row, index, word.size),
      edge: cue.kind === "hero" && word.row !== mainRow ? word.row < mainRow! ? "above" as const : "below" as const : undefined,
      slices: kineticSlices(word.token.text, ink, prefix => ctx.measureText(prefix).width,
        word.token.typeRole === "body" && !word.token.number),
    };
  });
  const plans = planKineticEntries(items, `editorial:${cue.id}:${cue.tokens.map(token => token.text).join(" ")}`, true, { width, height });
  const slices = new Map(items.map(item => [item.key, item.slices]));
  return { ...layout, words: layout.words.map(word => {
    const entry = plans.get(word.token.id);
    return { ...word, slices: slices.get(word.token.id),
      entry: entry && { ...entry, blur: Math.max(entry.blur, Math.min(word.size * .12, 10 * unit)) } };
  }) };
};
