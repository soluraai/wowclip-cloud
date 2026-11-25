import { ENGINE_DEFAULTS } from "../CaptionEngine/compilePlan";
import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { clamp, finite, isRecord, type EngineOptions } from "../CaptionEngine/types";
import { resolvePalette, validBrandColor, type PaletteSettings } from "./palette";

export type FontSpec = {
  family: string;
  weight: number;
  style?: "normal" | "italic";
  src?: string;
  extraSources?: { src: string; unicodeRange: string }[];
};

export type StyleOneConfig = {
  transcript: unknown;
  plan: unknown;
  durationMs: number;
  engine: EngineOptions;
  fonts: {
    pairing: "handwritten" | "editorial" | "clean";
    hero: FontSpec; helper: FontSpec; soft: FontSpec; plain: FontSpec;
  };
  theme: {
    textColor: string; heroColor: string; shineColor: string; backdropDim: number;
    backdropMode: "uniform" | "caption"; backgroundColor: string;
  };
  palette: PaletteSettings;
  inlineAccent: {
    enabled: boolean; sizeMultiplier: number; pulse: number; jiggle: number;
    durationMs: number; glowOpacity: number; glowRadius: number;
  };
  shine: { enabled: boolean; durationMs: number; delayMs: number; strength: number; glowOpacity: number };
  glow: { enabled: boolean; radius: number; opacity: number };
  shadow: {
    enabled: boolean; color: string; offsetX: number; offsetY: number;
    blur: number; opacity: number; spread: number;
  };
  layout: {
    heroFontSize: number;
    helperRatio: number;
    softRatio: number;
    plainFontSize: number;
    standaloneFontSize: number;
    minHeroFontSize: number;
    minHelperFontSize: number;
    minPlainFontSize: number;
    heroTracking: number;
    supportTracking: number;
    helperTracking: number;
    softTracking: number;
    gap: number;
    sideClearance: number;
    minNestGain: number;
    splitPenalty: number;
    overhang: number;
    helperMinScale: number;
    maxWidth: number;
    maxHeight: number;
    positionX: number;
    positionY: number;
    offsetY: number;
    safeMargin: number;
    nesting: boolean;
    pocketSplit: boolean;
    pocketVariation: number;
    surrounding: boolean;
    maxHelperFragments: number;
    textCase: "preserve" | "lowercase" | "uppercase";
  };
  timing: { revealMs: number; fadeMs: number; exitMs: number; travel: number; blur: number };
  motion: { seed: string; randomize: boolean; helperWordByWord: boolean; blurScale: number };
  background: { src?: string; muted: boolean; volume: number; trimBeforeMs: number };
};

const section = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const number = (value: unknown, fallback: number, min: number, max: number) =>
  clamp(finite(value, fallback), min, max);
const string = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const automaticMotionSeed = (transcript: unknown, backgroundSource: unknown) => {
  let source: string;
  try {
    source = JSON.stringify([backgroundSource ?? "", transcript ?? null]);
  } catch {
    // Invalid optional transcript metadata (cycles/BigInt) must not prevent the
    // normalizer from accepting otherwise valid source words and reporting errors.
    source = JSON.stringify([typeof backgroundSource === "string" ? backgroundSource : "",
      normalizeTranscript(transcript).words]);
  }
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return `auto-${(hash >>> 0).toString(36)}`;
};

const font = (value: unknown, fallback: FontSpec): FontSpec => {
  const input = section(value);
  const family = string(input.family, fallback.family);
  // Changing family without supplying a file uses an already available browser font.
  const src = typeof input.src === "string" ? input.src.trim() || undefined
    : family === fallback.family ? fallback.src : undefined;
  const extraSources = Array.isArray(input.extraSources)
    ? input.extraSources.reduce<{ src: string; unicodeRange: string }[]>((sources, item) => {
        if (isRecord(item) && typeof item.src === "string" && typeof item.unicodeRange === "string") {
          const src = item.src.trim();
          const unicodeRange = item.unicodeRange.trim();
          if (src && unicodeRange) sources.push({ src, unicodeRange });
        }
        return sources;
      }, []) : src === fallback.src ? fallback.extraSources : undefined;
  const style = input.style === "italic" || input.style === "normal" ? input.style
    : family === fallback.family ? fallback.style ?? "normal" : "normal";
  return { family, src, extraSources, style, weight: Math.round(number(input.weight, fallback.weight, 100, 900)) };
};

/** All settings are partial, finite, and bounded; arbitrary model JSON is never trusted. */
export const resolveStyleOneConfig = (input: unknown): StyleOneConfig => {
  const root = section(input);
  const layout = section(root.layout);
  const theme = section(root.theme);
  const shadow = section(root.shadow);
  const timing = section(root.timing);
  const fonts = section(root.fonts);
  const engine = section(root.engine);
  const background = section(root.background);
  const motion = section(root.motion);
  const paletteInput = section(root.palette);
  const inlineAccent = section(root.inlineAccent);
  const shine = section(root.shine);
  const textColor = string(theme.textColor, "#ffffff");
  const palette: PaletteSettings = {
    mode: paletteInput.mode === "brand" || paletteInput.mode === "gold" ||
      paletteInput.mode === "mint" || paletteInput.mode === "coral" ? paletteInput.mode : "custom",
    brandColor: validBrandColor(paletteInput.brandColor),
  };
  const pairing = fonts.pairing === "editorial" || fonts.pairing === "handwritten"
    ? fonts.pairing : "clean";
  const helperFont: FontSpec = pairing === "handwritten"
    ? { family: "Caveat", weight: 600, src: "style-one/fonts/caveat-variable.ttf" }
    : pairing === "editorial"
      ? { family: "Lora", weight: 500, style: "italic", src: "style-one/fonts/lora-italic-variable.ttf" }
      : { family: "Instrument Sans", weight: 350, src: "style-two/fonts/instrument-sans-variable.ttf" };
  const softFont: FontSpec = pairing === "clean"
    ? { family: "Instrument Sans", weight: 350, src: "style-two/fonts/instrument-sans-variable.ttf" }
    : { ...helperFont, weight: pairing === "handwritten" ? 500 : 400 };
  const resolvedHelperFont = font(fonts.helper, helperFont);
  return {
    transcript: root.transcript,
    plan: root.plan,
    durationMs: number(root.durationMs, 0, 0, 86400000),
    fonts: {
      pairing,
      hero: font(fonts.hero, {
        family: "Poppins", weight: 800, src: "style-one/fonts/poppins-latin-800-normal.woff2",
        extraSources: [{ src: "style-one/fonts/poppins-devanagari-800-normal.woff2", unicodeRange: "U+0900-097F,U+1CD0-1CFF,U+200C-200D,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF" }],
      }),
      helper: resolvedHelperFont,
      soft: font(fonts.soft, softFont),
      plain: font(fonts.plain, pairing === "clean"
        ? { family: "Inter", weight: 600, src: "style-one/fonts/inter-latin-600-normal.woff2" } : resolvedHelperFont),
    },
    palette,
    inlineAccent: {
      enabled: inlineAccent.enabled !== false,
      sizeMultiplier: number(inlineAccent.sizeMultiplier, 1, 1, 1.25),
      pulse: 0,
      jiggle: 0,
      durationMs: number(inlineAccent.durationMs, 420, 200, 650),
      glowOpacity: 0,
      glowRadius: 0,
    },
    shine: {
      enabled: shine.enabled !== false,
      durationMs: number(shine.durationMs, 520, 250, 900),
      delayMs: number(shine.delayMs, 100, 0, 300),
      strength: number(shine.strength, 0.45, 0, 0.7),
      glowOpacity: 0,
    },
    theme: {
      ...resolvePalette(palette, textColor, string(theme.heroColor, textColor)),
      backgroundColor: string(theme.backgroundColor, "#101112"),
      backdropDim: number(theme.backdropDim, 0.46, 0, 1),
      backdropMode: theme.backdropMode === "caption" ? "caption" : "uniform",
    },
    glow: {
      enabled: false,
      radius: 0,
      opacity: 0,
    },
    shadow: {
      enabled: false,
      color: string(shadow.color, "#000000"),
      offsetX: number(shadow.offsetX, 0, -20, 20),
      offsetY: number(shadow.offsetY, 3, -20, 20),
      blur: 0,
      opacity: 0,
      spread: 0,
    },
    engine: {
      fallback: engine.fallback === "hide" ? "hide" : "plain",
      minConfidence: number(engine.minConfidence, ENGINE_DEFAULTS.minConfidence, 0, 1),
      maxGapMs: number(engine.maxGapMs, ENGINE_DEFAULTS.maxGapMs, 100, 3000),
      maxPlainWords: Math.round(number(engine.maxPlainWords, ENGINE_DEFAULTS.maxPlainWords, 2, 3)),
      maxPlainCharacters: Math.round(number(
        engine.maxPlainCharacters, ENGINE_DEFAULTS.maxPlainCharacters, 10, 48,
      )),
      maxPlainDurationMs: number(engine.maxPlainDurationMs, ENGINE_DEFAULTS.maxPlainDurationMs, 500, 6000),
      lingerMs: number(engine.lingerMs, ENGINE_DEFAULTS.lingerMs, 0, 600),
    },
    layout: {
      heroFontSize: number(layout.heroFontSize, 172, 100, 340),
      helperRatio: number(layout.helperRatio, pairing === "handwritten" ? 0.36 : 0.26, 0.14, 0.52),
      softRatio: number(layout.softRatio, pairing === "handwritten" ? 0.36 : 0.26, 0.14, 0.52),
      plainFontSize: number(layout.plainFontSize, 64, 36, 120),
      standaloneFontSize: number(layout.standaloneFontSize, 148, 100, 260),
      minHeroFontSize: number(layout.minHeroFontSize, 100, 64, 160),
      minHelperFontSize: number(layout.minHelperFontSize, 40, 24, 110),
      minPlainFontSize: number(layout.minPlainFontSize, 52, 48, 110),
      heroTracking: number(layout.heroTracking, -0.035, -0.045, 0.06),
      supportTracking: number(layout.supportTracking, number(layout.helperTracking, -0.015, -0.02, 0.08), -0.035, 0.08),
      helperTracking: number(layout.helperTracking, -0.015, -0.02, 0.08),
      softTracking: number(layout.softTracking, -0.015, -0.02, 0.08),
      gap: number(layout.gap, 0.055, 0.02, 0.65),
      sideClearance: number(layout.sideClearance, 0.065, 0.035, 0.8),
      minNestGain: number(layout.minNestGain, 0.03, 0.02, 1),
      splitPenalty: number(layout.splitPenalty, 0.3, 0, 2),
      overhang: number(layout.overhang, 0.08, 0, 0.65),
      helperMinScale: number(layout.helperMinScale, 1, 0.8, 1),
      maxWidth: number(layout.maxWidth, 0.84, 0.5, 0.94),
      maxHeight: number(layout.maxHeight, 0.58, 0.15, 0.85),
      positionX: number(layout.positionX, 0.5, 0.15, 0.85),
      positionY: number(layout.positionY, 0.5, 0.15, 0.85),
      offsetY: number(layout.offsetY, 0, -400, 400),
      safeMargin: number(layout.safeMargin, 0.08, 0.04, 0.14),
      nesting: layout.nesting !== false,
      pocketSplit: layout.pocketSplit !== false,
      pocketVariation: number(layout.pocketVariation, 0.6, 0, 1),
      surrounding: layout.surrounding !== false,
      maxHelperFragments: Math.round(number(layout.maxHelperFragments, 6, 2, 10)),
      textCase: layout.textCase === "uppercase" || layout.textCase === "preserve" ? layout.textCase : "lowercase",
    },
    timing: {
      revealMs: number(timing.revealMs, 480, 120, 700),
      fadeMs: number(timing.fadeMs, 70, 40, 250),
      exitMs: number(timing.exitMs, 130, 60, 400),
      travel: number(timing.travel, 0.28, 0, 1),
      blur: number(timing.blur, 9, 0, 10),
    },
    motion: {
      seed: string(motion.seed, automaticMotionSeed(root.transcript, background.src)),
      randomize: motion.randomize !== false,
      helperWordByWord: motion.helperWordByWord !== false,
      blurScale: number(motion.blurScale, 1, 1, 3),
    },
    background: {
      src: typeof background.src === "string" && background.src.trim() ? background.src.trim() : undefined,
      muted: background.muted === true,
      volume: number(background.volume, 1, 0, 1),
      trimBeforeMs: number(background.trimBeforeMs, 0, 0, 86400000),
    },
  };
};
