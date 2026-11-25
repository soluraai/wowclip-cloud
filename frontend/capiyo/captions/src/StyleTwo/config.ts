import { clamp, finite, isRecord } from "../CaptionEngine/types";
import defaults from "./style-two.config.json";

export type StyleTwoFont = {
  family: string;
  src?: string;
  weight: number;
  style: "normal" | "italic";
};
export type StyleTwoAppearance = {
  fonts: { body: StyleTwoFont; highlight: StyleTwoFont };
  layout: {
    fontSize: number;
    minFontSize: number;
    heroScale: number;
    positionX: number;
    positionY: number;
    maxWidth: number;
    safeMargin: number;
    maxWords: number;
    maxCharacters: number;
    maxDurationMs: number;
    wordGap: number;
  };
  colors: {
    text: string;
    highlight: string;
    glow: string;
    backdrop: string;
    backdropOpacity: number;
  };
  glow: { enabled: boolean; radius: number; opacity: number };
  motion: {
    entryMs: number;
    fadeMs: number;
    pop: number;
    travel: number;
    jiggleDegrees: number;
    exitMs: number;
  };
};
export const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};
export const bounded = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => clamp(finite(value, fallback), min, max);
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const font = (input: unknown, fallback: StyleTwoFont): StyleTwoFont => {
  const value = asRecord(input);
  const family =
    typeof value.family === "string" && value.family.trim()
      ? value.family.trim()
      : fallback.family;
  return {
    family,
    src:
      typeof value.src === "string"
        ? value.src.trim() || undefined
        : family === fallback.family
          ? fallback.src
          : undefined,
    weight: Math.round(bounded(value.weight, fallback.weight, 100, 900)),
    style:
      value.style === "normal" || value.style === "italic"
        ? value.style
        : fallback.style,
  };
};

/** Accept partial JSON while keeping numeric bounds and defaults consistent. */
export const resolveStyleTwoAppearance = (
  input: unknown = defaults,
): StyleTwoAppearance => {
  const root = asRecord(input);
  const fonts = asRecord(root.fonts),
    layout = asRecord(root.layout),
    colors = asRecord(root.colors);
  const glow = asRecord(root.glow),
    motion = asRecord(root.motion);
  const fontSize = bounded(layout.fontSize, defaults.layout.fontSize, 36, 180);
  return {
    fonts: {
      body: font(fonts.body, { ...defaults.fonts.body, style: "normal" }),
      highlight: font(fonts.highlight, {
        ...defaults.fonts.highlight,
        style: "italic",
      }),
    },
    layout: {
      fontSize,
      minFontSize: bounded(
        layout.minFontSize,
        defaults.layout.minFontSize,
        32,
        fontSize,
      ),
      heroScale: bounded(layout.heroScale, defaults.layout.heroScale, 1, 2),
      positionX: bounded(layout.positionX, defaults.layout.positionX, 0.1, 0.9),
      positionY: bounded(layout.positionY, defaults.layout.positionY, 0.1, 0.9),
      maxWidth: bounded(layout.maxWidth, defaults.layout.maxWidth, 0.3, 0.94),
      safeMargin: bounded(
        layout.safeMargin,
        defaults.layout.safeMargin,
        0.03,
        0.2,
      ),
      maxWords: Math.round(
        bounded(layout.maxWords, defaults.layout.maxWords, 1, 6),
      ),
      maxCharacters: Math.round(
        bounded(layout.maxCharacters, defaults.layout.maxCharacters, 8, 60),
      ),
      maxDurationMs: bounded(
        layout.maxDurationMs,
        defaults.layout.maxDurationMs,
        300,
        4000,
      ),
      wordGap: bounded(layout.wordGap, defaults.layout.wordGap, 0.08, 0.6),
    },
    colors: {
      text: color(colors.text, defaults.colors.text),
      highlight: color(colors.highlight, defaults.colors.highlight),
      glow: color(colors.glow, defaults.colors.glow),
      backdrop: color(colors.backdrop, defaults.colors.backdrop),
      backdropOpacity: bounded(
        colors.backdropOpacity,
        defaults.colors.backdropOpacity,
        0,
        0.8,
      ),
    },
    glow: {
      enabled:
        typeof glow.enabled === "boolean"
          ? glow.enabled
          : defaults.glow.enabled,
      radius: bounded(glow.radius, defaults.glow.radius, 0, 32),
      opacity: bounded(glow.opacity, defaults.glow.opacity, 0, 1),
    },
    motion: {
      entryMs: bounded(motion.entryMs, defaults.motion.entryMs, 80, 700),
      fadeMs: bounded(motion.fadeMs, defaults.motion.fadeMs, 20, 250),
      pop: bounded(motion.pop, defaults.motion.pop, 0, 0.15),
      travel: bounded(motion.travel, defaults.motion.travel, 0, 24),
      jiggleDegrees: bounded(
        motion.jiggleDegrees,
        defaults.motion.jiggleDegrees,
        0,
        4,
      ),
      exitMs: bounded(motion.exitMs, defaults.motion.exitMs, 0, 300),
    },
  };
};
