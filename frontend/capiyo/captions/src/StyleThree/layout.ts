import { evenSizeCap } from "../CaptionEngine/evenSize";
import {
  clamp,
  type CaptionCue,
  type CaptionWord,
} from "../CaptionEngine/types";
import { createCanvasMeasurer, type TextMeasurer } from "../StyleTwo/layout";
import type { StyleThreeAppearance } from "./config";
import { NO_SIZES, type PartSizes } from "../Premium/sizes";
import { textLength } from "../Script/scripts";
import { topLineWord } from "../Script/mix";

export type MumbaiToken = {
  word: CaptionWord;
  text: string;
  primary: boolean;
  size: number;
  x: number;
  y: number;
  width: number;
  tracking: number;
  startFrame: number;
};
export type MumbaiPage = CaptionCue & {
  tokens: MumbaiToken[];
  left: number;
  top: number;
  width: number;
  height: number;
  primaryLeft: number;
  primaryWidth: number;
  readabilityLimited: boolean;
};

/** Reserve complete lines before revealing words so the text never jumps sideways. */
export const layoutStyleThreePages = (
  cues: CaptionCue[],
  appearance: StyleThreeAppearance,
  width: number,
  height: number,
  fps: number,
  rowBreaks = new Map<string, number>(),
  measure: TextMeasurer = createCanvasMeasurer(),
  sizes: PartSizes = NO_SIZES,
): MumbaiPage[] => {
  const { layout, fonts, glow, motion } = appearance,
    unit = width / 1080;
  const halo = ((glow.enabled ? glow.radius * 3 : 0) + 6) * unit;
  const cx = clamp(
    width * layout.positionX,
    width * layout.safeMargin,
    width * (1 - layout.safeMargin),
  );
  const leftEdge = Math.max(
    width * layout.safeMargin,
    cx - (width * layout.maxWidth) / 2,
  );
  const rightEdge = Math.min(
    width * (1 - layout.safeMargin),
    cx + (width * layout.maxWidth) / 2,
  );
  const available = Math.max(24 * unit, rightEdge - leftEdge - halo * 2);
  const start = (word: CaptionWord) => Math.ceil((word.startMs * fps) / 1000);
  const splitAt = (words: CaptionWord[]) =>
    Math.min(
      words.length,
      rowBreaks.get(words[0].id) ??
        Math.max(1, Math.min(3, Math.ceil(words.length * 0.4))),
    );
  const metrics = (words: CaptionWord[], size: number) => {
    const count = splitAt(words);
    const rows = [words.slice(0, count), words.slice(count)].filter(
      (row) => row.length,
    );
    let y = 0;
    const lines = rows.map((row, rowIndex) => {
      const primary = rowIndex === 0,
        rowSize = size * (primary ? 1 : layout.scriptScale);
      const font = primary ? fonts.body : fonts.highlight;
      const tracking =
        ((primary ? layout.primaryTracking : layout.scriptTracking) *
          unit *
          size) /
        (layout.fontSize * unit);
      let cursor = 0,
        left = 0,
        right = 0,
        ascent = 0,
        descent = 0;
      const tokens = row.map((word) => {
        // Mix: the gold line reads in English letters, the script line in the speaker's script.
        const text = primary ? topLineWord(word).text.toLocaleUpperCase() : word.text;
        const own = rowSize * (primary ? sizes.main : sizes.script) * (sizes.words[word.id] ?? 1);
        const ink = measure(text, font, own),
          x = cursor;
        const advance =
          ink.advance + Math.max(0, Array.from(text).length - 1) * tracking;
        left = Math.min(left, x - ink.left);
        right = Math.max(right, x + ink.right + advance - ink.advance);
        ascent = Math.max(ascent, ink.ascent);
        descent = Math.max(descent, ink.descent);
        cursor += advance + size * layout.wordGap;
        return {
          word,
          text,
          primary,
          size: own,
          x,
          y: 0,
          width: advance,
          tracking,
          startFrame: start(word),
        };
      });
      const lineWidth = Math.max(1, right - left),
        lineHeight = ascent + descent;
      const baseline = y + ascent;
      y +=
        lineHeight + (rowIndex < rows.length - 1 ? layout.lineGap * unit : 0);
      return {
        tokens: tokens.map((t) => ({
          ...t,
          x: t.x - left - lineWidth / 2,
          y: baseline + (primary ? 0 : layout.scriptOffsetY * unit),
        })),
        width: lineWidth,
      };
    });
    return {
      tokens: lines.reduce<MumbaiToken[]>(
        (all, line) => all.concat(line.tokens),
        [],
      ),
      width: Math.max(...lines.map((line) => line.width)),
      height: y,
      primaryWidth: lines[0].width,
    };
  };
  const groups: { cue: CaptionCue; words: CaptionWord[] }[] = [];
  cues.forEach((cue) => {
    let words: CaptionWord[] = [];
    const flush = () => {
      if (words.length) groups.push({ cue, words });
      words = [];
    };
    cue.words.forEach((word) => {
      const candidate = [...words, word];
      const tooLong =
        candidate.length > layout.maxWords ||
        textLength(candidate.map((w) => w.text).join(" ")) > layout.maxCharacters ||
        word.endMs - candidate[0].startMs > layout.maxDurationMs ||
        metrics(candidate, layout.minFontSize * unit).width * (1 + motion.pop) >
          available;
      if (words.length && tooLong && start(word) > start(words[0])) flush();
      words.push(word);
    });
    flush();
  });
  const fits = groups.map(({ words }) => {
    const initial = metrics(words, layout.fontSize * unit);
    return Math.min(
      1,
      available / (initial.width * (1 + motion.pop)),
      (height * (1 - layout.safeMargin * 2) - halo * 2) /
        (initial.height * (1 + motion.pop)),
    );
  });
  const cap = evenSizeCap(fits);
  return groups
    .map(({ cue, words }, index) => {
      const fit = Math.min(cap, fits[index]);
      const result = metrics(
        words,
        layout.fontSize * unit * Math.max(0.01, fit),
      );
      const centerX = (leftEdge + rightEdge) / 2;
      const centerY = clamp(
        height * layout.positionY,
        height * layout.safeMargin + result.height / 2 + halo,
        height * (1 - layout.safeMargin) - result.height / 2 - halo,
      );
      const top = centerY - result.height / 2;
      return {
        ...cue,
        id: `${cue.id}-mumbai-${index}`,
        words,
        startFrame: start(words[0]),
        endFrame: Math.min(
          cue.endFrame,
          groups[index + 1] ? start(groups[index + 1].words[0]) : cue.endFrame,
        ),
        tokens: result.tokens.map((t) => ({
          ...t,
          x: t.x + centerX,
          y: t.y + top,
        })),
        left: centerX - result.width / 2,
        top,
        width: result.width,
        height: result.height,
        primaryLeft: centerX - result.primaryWidth / 2,
        primaryWidth: result.primaryWidth,
        readabilityLimited: layout.fontSize * fit < layout.minFontSize,
      };
    })
    .filter((page) => page.endFrame > page.startFrame);
};
