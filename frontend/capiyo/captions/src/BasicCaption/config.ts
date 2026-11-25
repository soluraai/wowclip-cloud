import defaults from "./basic-caption.config.json";
import { clamp, finite, isRecord } from "../CaptionEngine/types";

const record = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};
const text = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;
const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];

/** Partial settings are merged with the basic template's JSON defaults. */
export const resolveBasicCaptionConfig = (input: unknown = {}) => {
  const root = record(input);
  const inputFont = record(root.font);
  const font = { ...defaults.font, ...inputFont };
  const layout = { ...defaults.layout, ...record(root.layout) };
  const phrasing = { ...defaults.phrasing, ...record(root.phrasing) };
  const content = { ...defaults.content, ...record(root.content) };
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    clamp(finite(value, fallback), min, max);
  const alignment: "left" | "center" | "right" =
    layout.alignment === "left" || layout.alignment === "right"
      ? layout.alignment
      : "center";
  const textCase: "preserve" | "uppercase" | "lowercase" =
    font.textCase === "uppercase" || font.textCase === "lowercase"
      ? font.textCase
      : "preserve";
  return {
    font: {
      family: text(font.family, defaults.font.family),
      // A changed family without a file uses that installed/system font.
      src: text(
        inputFont.src,
        inputFont.family && inputFont.family !== defaults.font.family
          ? ""
          : defaults.font.src,
      ),
      size: number(font.size, defaults.font.size, 12, 1600),
      weight: number(font.weight, defaults.font.weight, 100, 900),
      italic: font.italic === true,
      color: text(font.color, defaults.font.color),
      letterSpacing: number(
        font.letterSpacing,
        defaults.font.letterSpacing,
        -5,
        30,
      ),
      wordSpacing: number(font.wordSpacing, defaults.font.wordSpacing, -5, 60),
      lineHeight: number(font.lineHeight, defaults.font.lineHeight, 0.8, 3),
      textCase,
    },
    layout: {
      positionX: number(layout.positionX, defaults.layout.positionX, 0, 1),
      positionY: number(layout.positionY, defaults.layout.positionY, 0, 1),
      maxWidth: number(layout.maxWidth, defaults.layout.maxWidth, 0.1, 1),
      safeMargin: number(layout.safeMargin, defaults.layout.safeMargin, 0, 0.3),
      alignment,
      rotation: number(record(root.layout).rotation, 0, -180, 180),
    },
    phrasing: {
      maxWords: Math.round(
        number(phrasing.maxWords, defaults.phrasing.maxWords, 1, 50),
      ),
      maxCharacters: Math.round(
        number(phrasing.maxCharacters, defaults.phrasing.maxCharacters, 1, 500),
      ),
      maxDurationMs: number(
        phrasing.maxDurationMs,
        defaults.phrasing.maxDurationMs,
        100,
        30000,
      ),
      maxGapMs: number(phrasing.maxGapMs, defaults.phrasing.maxGapMs, 0, 10000),
      lingerMs: number(phrasing.lingerMs, defaults.phrasing.lingerMs, 0, 3000),
    },
    content: {
      textOverrides: Object.fromEntries(
        Object.entries(record(content.textOverrides)).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && !!entry[1].trim(),
        ),
      ),
      lineBreakAfterWordIds: ids(content.lineBreakAfterWordIds),
      pageBreakAfterWordIds: ids(content.pageBreakAfterWordIds),
    },
  };
};
