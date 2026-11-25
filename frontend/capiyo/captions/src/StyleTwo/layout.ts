import { evenSizeCap } from "../CaptionEngine/evenSize";
import {
  clamp,
  type CaptionCue,
  type CaptionWord,
} from "../CaptionEngine/types";
import type { StyleTwoAppearance, StyleTwoFont } from "./config";
import { fontFamily } from "./fonts";

export type TextInk = {
  advance: number;
  left: number;
  right: number;
  ascent: number;
  descent: number;
};
export type TextMeasurer = (
  text: string,
  font: StyleTwoFont,
  size: number,
) => TextInk;
export type StyleTwoToken = {
  word: CaptionWord;
  font: StyleTwoFont;
  size: number;
  x: number;
  y: number;
  width: number;
  highlighted: boolean;
  startFrame: number;
};
export type StyleTwoPage = CaptionCue & {
  tokens: StyleTwoToken[];
  left: number;
  top: number;
  width: number;
  height: number;
  readabilityLimited: boolean;
};

/** A fresh cache after font loading prevents fallback measurements from sticking. */
export const createCanvasMeasurer = (): TextMeasurer => {
  const context =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  const cache = new Map<string, TextInk>();
  return (text, font, size) => {
    const key = JSON.stringify([text, font, size]),
      cached = cache.get(key);
    if (cached) return cached;
    if (!context)
      return {
        advance: text.length * size * 0.54,
        left: 0,
        right: text.length * size * 0.54,
        ascent: size * 0.75,
        descent: size * 0.2,
      };
    context.font = `${font.style} ${font.weight} ${size}px ${JSON.stringify(fontFamily(font))}, ${font.style === "italic" ? "Georgia" : "Arial"}`;
    const ink = context.measureText(text);
    const result = {
      advance: ink.width,
      left: Number.isFinite(ink.actualBoundingBoxLeft)
        ? ink.actualBoundingBoxLeft
        : 0,
      right: Number.isFinite(ink.actualBoundingBoxRight)
        ? ink.actualBoundingBoxRight
        : ink.width,
      ascent: Number.isFinite(ink.actualBoundingBoxAscent)
        ? ink.actualBoundingBoxAscent
        : size * 0.75,
      descent: Number.isFinite(ink.actualBoundingBoxDescent)
        ? ink.actualBoundingBoxDescent
        : size * 0.16,
    };
    cache.set(key, result);
    return result;
  };
};

export const layoutStyleTwoPages = (
  cues: CaptionCue[],
  appearance: StyleTwoAppearance,
  width: number,
  height: number,
  fps: number,
  measure: TextMeasurer = createCanvasMeasurer(),
): StyleTwoPage[] => {
  const { layout, fonts, glow, motion } = appearance;
  const unit = width / 1080;
  const centerX = clamp(
    width * layout.positionX,
    width * layout.safeMargin,
    width * (1 - layout.safeMargin),
  );
  const leftEdge = Math.max(
    width * layout.safeMargin,
    centerX - (width * layout.maxWidth) / 2,
  );
  const rightEdge = Math.min(
    width * (1 - layout.safeMargin),
    centerX + (width * layout.maxWidth) / 2,
  );
  const halo = (glow.enabled ? glow.radius * 3 : 0) * unit + 4 * unit;
  const available = Math.max(24 * unit, rightEdge - leftEdge - halo * 2);
  const startFrame = (word: CaptionWord) =>
    Math.ceil((word.startMs * fps) / 1000);
  const groups: { cue: CaptionCue; words: CaptionWord[] }[] = [];
  const isHighlighted = (cue: CaptionCue, word: CaptionWord) =>
    cue.heroWords.some((hero) => hero.id === word.id) ||
    cue.accentWordIds?.includes(word.id) === true;
  const metricsFor = (
    cue: CaptionCue,
    words: CaptionWord[],
    bodySize: number,
  ) => {
    let cursor = 0,
      previousRight = -Infinity,
      minX = Infinity,
      maxX = -Infinity,
      top = 0,
      bottom = 0;
    const tokens = words.map((word) => {
      const highlighted = isHighlighted(cue, word);
      const font = highlighted ? fonts.highlight : fonts.body;
      const size = bodySize * (highlighted ? layout.heroScale : 1);
      const ink = measure(word.text, font, size);
      // Reserve the italic overhang as well as the advance, so adjacent words
      // keep their visible clearance when the emphasis font or size changes.
      const x = Math.max(
        cursor,
        previousRight + bodySize * layout.wordGap + ink.left,
      );
      minX = Math.min(minX, x - ink.left);
      maxX = Math.max(maxX, x + ink.right);
      top = Math.min(top, -ink.ascent);
      bottom = Math.max(bottom, ink.descent);
      previousRight = x + ink.right;
      cursor = x + ink.advance + bodySize * layout.wordGap;
      return {
        word,
        font,
        size,
        x,
        y: 0,
        width: ink.advance,
        highlighted,
        startFrame: startFrame(word),
      };
    });
    return {
      tokens,
      left: minX,
      top,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, bottom - top),
    };
  };
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
        candidate.map((item) => item.text).join(" ").length >
          layout.maxCharacters ||
        word.endMs - candidate[0].startMs > layout.maxDurationMs ||
        metricsFor(cue, candidate, layout.minFontSize * unit).width *
          (1 + motion.pop) >
          available;
      // Words with the same start frame must stay together rather than disappearing on a zero-frame page.
      if (words.length && tooLong && startFrame(word) > startFrame(words[0]))
        flush();
      words.push(word);
    });
    flush();
  });
  const normalSize = layout.fontSize * unit;
  const fits = groups.map(({ cue, words }) =>
    Math.min(1, available / (metricsFor(cue, words, normalSize).width * (1 + motion.pop))));
  const cap = evenSizeCap(fits);
  return groups
    .map(({ cue, words }, index) => {
      const fit = Math.min(cap, fits[index]);
      const result = metricsFor(cue, words, normalSize * fit);
      const x = (leftEdge + rightEdge) / 2 - result.width / 2 - result.left;
      const centerY = clamp(
        height * layout.positionY,
        height * layout.safeMargin + result.height / 2 + halo,
        height * (1 - layout.safeMargin) - result.height / 2 - halo,
      );
      const y = centerY - result.height / 2 - result.top;
      const nextStart = groups[index + 1]
        ? startFrame(groups[index + 1].words[0])
        : cue.endFrame;
      return {
        ...cue,
        id: `${cue.id}-page-${index}`,
        words,
        heroWords: cue.heroWords.filter((word) =>
          words.some((item) => item.id === word.id),
        ),
        accentWordIds: cue.accentWordIds?.filter((id) =>
          words.some((word) => word.id === id),
        ),
        startFrame: startFrame(words[0]),
        endFrame: Math.min(cue.endFrame, nextStart),
        tokens: result.tokens.map((token) => ({ ...token, x: token.x + x, y })),
        left: x + result.left,
        top: y + result.top,
        width: result.width,
        height: result.height,
        readabilityLimited: normalSize * fit < layout.minFontSize * unit,
      };
    })
    .filter((page) => page.endFrame > page.startFrame);
};
