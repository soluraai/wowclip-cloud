import { activeCue } from "../LaunchCaptionPack/timeline";
import type { CaptionSource } from "../LaunchCaptionPack/types";
import { measureInk } from "../StyleOne/metrics";
import { cleanWord, commonWords, bareWord, compileTypography, textSeed, type TypographyCue } from "../Standard/kinetic/engine";
import { textFont, type TypographyFonts } from "../Standard/kinetic/fonts";
import { finishTypeLayout, type TypographyGeometry, type TypographyItem } from "../Standard/kinetic/layout";

export { activeCue };
export const fourfoldText = (text: string) => cleanWord(text).toLocaleUpperCase();
export const fourfoldSeed = textSeed;
export type FourfoldCue = TypographyCue & { emphasisIds: string[] };
export const compileFourfold = (source: CaptionSource) => {
  const compiled = compileTypography(source, "fourfold");
  return { ...compiled, cues: compiled.cues.map(cue => ({ ...cue, emphasisIds: [cue.words[cue.heroFrom].id] })) };
};
export type FourfoldLayout = ReturnType<typeof layoutFourfold>;

/** The visible type forms the rectangle: no border, empty slots or oversized em boxes. */
export function layoutFourfold(cue: FourfoldCue, fonts: TypographyFonts, geometry: TypographyGeometry) {
  const unit = geometry.preview ? geometry.width / 720 : Math.min(geometry.width, geometry.height) / 720;
  const limit = Math.min(geometry.width * geometry.maxWidth, 405 * unit);
  // Choose a face for the whole row. Weight/case supply variety without
  // changing the size of individual words on a shared baseline.
  const makeRow = (from: number, to: number) => {
    const entries = cue.words.slice(from, to);
    const focus = entries.some(word => cue.emphasisIds.includes(word.id));
    const mono = !focus && entries.every(word => commonWords.has(bareWord(word.text)));
    const face = mono ? "mono" : focus ? "capital" : "light";
    const words = entries.map(word => {
      const text = mono ? cleanWord(word.text).toLocaleLowerCase() : fourfoldText(word.text);
      const font = textFont(text, fonts, face);
      return { word, text, font, ink: measureInk(text, font, 1, 0),
        role: cue.emphasisIds.includes(word.id) ? "hero" as const : "support" as const };
    });
    const width = words.reduce((sum, word) => sum + word.ink.width, 0) + Math.max(0, words.length - 1) * .28;
    // A lone word stays in family with the full rows around it in the video.
    return { words, width, maxSize: (cue.words.length === 1 ? 130 : entries.length === 1 ? 104 : 76) * unit };
  };
  const count = cue.words.length;
  // The style is a tall block: about two words a row, three or four rows whenever the words allow.
  const targetRows = Math.min(4, Math.max(1, Math.ceil(count / 2)));
  const rowCache = new Map<string, ReturnType<typeof makeRow>>();
  const getRow = (from: number, to: number) => {
    const key = `${from}:${to}`;
    if (!rowCache.has(key)) rowCache.set(key, makeRow(from, to));
    return rowCache.get(key)!;
  };
  let best = Infinity;
  let chosen: ReturnType<typeof makeRow>[] = [];
  let boxWidth = limit;
  const search = (from: number, rows: ReturnType<typeof makeRow>[]) => {
    if (from === count) {
      const width = Math.min(limit, ...rows.map(row => row.width * row.maxSize));
      const sizes = rows.map(row => width / row.width);
      const min = Math.min(...sizes), max = Math.max(...sizes);
      const score = sizes.reduce((sum, size) => sum + Math.log(size / (54 * unit)) ** 2, 0) +
        Math.max(0, max / min - 1.5) ** 2 * 5 + (1 - width / limit) ** 2 * 5 + (rows.length - targetRows) ** 2 * 3 +
        rows.filter(row => row.words.length === 1 && row.words[0].role !== "hero" && row.words[0].text.length < 4).length * 4;
      if (score < best) { best = score; chosen = rows; boxWidth = width; }
      return;
    }
    if (rows.length === 4) return;
    for (let to = from + 1; to <= count; to++) search(to, [...rows, getRow(from, to)]);
  };
  search(0, []);
  const items: TypographyItem[] = [];
  let top = 0;
  chosen.forEach((row, index) => {
    const size = boxWidth / row.width;
    const fitted = row.words.map(entry => ({ ...entry, size,
      ink: measureInk(entry.text, entry.font, size, 0) }));
    const inkWidth = fitted.reduce((sum, entry) => sum + entry.ink.width, 0);
    const gap = fitted.length > 1 ? (boxWidth - inkWidth) / (fitted.length - 1) : 0;
    const ascent = Math.max(...fitted.map(entry => -entry.ink.top));
    const descent = Math.max(...fitted.map(entry => entry.ink.bottom));
    const baseline = top + ascent;
    let x = fitted.length === 1 ? (boxWidth - inkWidth) / 2 : 0;
    fitted.forEach(entry => {
      items.push({ ...entry, x: x - entry.ink.left, baseline, line: `fourfold-row-${index}` });
      x += entry.ink.width + gap;
    });
    top += ascent + descent + Math.max(10 * unit, size * .18);
  });
  return { ...finishTypeLayout(cue, items, geometry), emphasisIds: cue.emphasisIds, rows: chosen.length };
}
