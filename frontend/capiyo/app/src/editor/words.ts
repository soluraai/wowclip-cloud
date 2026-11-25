import { DEFAULT_CAPTION_Y, type AspectId } from "../app/videoSettings";
import {
  DEFAULT_CAPTION_SETTINGS,
  DEFAULT_HIGHLIGHTS,
  resolveEffects,
  type CaptionSettings,
  type HighlightAppearance,
  type WordFormatting,
} from "../app/captionSettings";
import type { Cue } from "../app/CaptionTimeline";
import { basicMotion, captionStyle } from "../app/styleCatalog";
import { emphasisDefaults, styleCapabilities } from "../app/styleCapabilities";

export type EditScope = "all" | "word";
export const WORD_FORMAT_KEYS = [
  "font",
  "weight",
  "italic",
  "fontAsset",
  "fontUploadId",
  "size",
  "color",
  "colorMode",
  "gradientStops",
  "gradientAngle",
  "gradientScope",
  "letterSpacing",
  "lineSpacing",
  "shadow",
  "textCase",
  "effects",
  "wordIn",
  "sizeScale",
] as const;
const FONT_KEYS = [
  "font",
  "weight",
  "italic",
  "fontAsset",
  "fontUploadId",
] as const;
const same = (a: unknown, b: unknown) =>
  Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
/** Words that share one on-screen caption page, using the same rules as the caption engine:
 *  a page ends at sentence punctuation, a long pause, or the style's words-per-caption cap. */
export function lineGroup(cues: Cue[], id: string, maxWords: number): Cue[] {
  const pages: Cue[][] = [];
  let page: Cue[] = [];
  cues.forEach((cue, index) => {
    const previous = cues[index - 1];
    const text = cueText(previous ?? cue);
    if (
      page.length &&
      (page.length >= maxWords ||
        (previous && /[.!?।॥]["'”’)]?$/u.test(text)) ||
        (previous && cue.start - previous.end > 0.32))
    ) {
      pages.push(page);
      page = [];
    }
    page.push(cue);
  });
  if (page.length) pages.push(page);
  return pages.find((group) => group.some((cue) => cue.id === id)) ?? [];
}
export const cueText = (cue: Cue) =>
  [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" ");
export const wordSettings = (
  settings: CaptionSettings,
  word?: Cue | null,
): CaptionSettings => ({ ...settings, ...word?.format });
export function updateWordFormat(
  word: Cue,
  global: CaptionSettings,
  next: CaptionSettings,
): Cue {
  const current = wordSettings(global, word);
  const format: WordFormatting = { ...word.format };
  if (FONT_KEYS.some((key) => !same(current[key], next[key]))) {
    for (const key of FONT_KEYS) delete format[key];
    if (
      FONT_KEYS.some(
        (key) =>
          !same(
            global[key] ??
              (key === "italic" ? false : key === "weight" ? 400 : ""),
            next[key] ??
              (key === "italic" ? false : key === "weight" ? 400 : ""),
          ),
      )
    )
      Object.assign(format, {
        font: next.font,
        weight: next.weight ?? 400,
        italic: next.italic ?? false,
        fontAsset: next.fontAsset ?? "",
        fontUploadId: next.fontUploadId ?? "",
      });
  }
  for (const key of WORD_FORMAT_KEYS) {
    if (
      (FONT_KEYS as readonly string[]).includes(key) ||
      same(current[key], next[key])
    )
      continue;
    if (same(global[key], next[key])) delete format[key];
    else Object.assign(format, { [key]: next[key] });
  }
  if (same(format, word.format ?? {})) return word;
  return { ...word, format: Object.keys(format).length ? format : undefined };
}
export function updateWordHighlight(
  word: Cue,
  global: CaptionSettings,
  patch: Partial<HighlightAppearance>,
): Cue {
  const shared = { ...DEFAULT_HIGHLIGHTS, ...global.highlights };
  const highlight = { ...word.highlight };
  for (const key of Object.keys(patch) as (keyof HighlightAppearance)[]) {
    if (same(patch[key], shared[key])) delete highlight[key];
    else Object.assign(highlight, { [key]: patch[key] });
  }
  if (same(highlight, word.highlight ?? {})) return word;
  return {
    ...word,
    highlight: Object.keys(highlight).length ? highlight : undefined,
  };
}
export function replaceWordText(cues: Cue[], id: string, text: string): Cue[] {
  const cue = cues.find((word) => word.id === id);
  if (!cue) return cues;
  const tokens = text.trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) throw new Error("A word cannot be empty.");
  if (
    text.length > 400 ||
    tokens.length > 24 ||
    tokens.length > Math.floor((cue.end - cue.start) * 1000)
  )
    throw new Error("Use a shorter edit for this word’s timing.");
  if (tokens.join(" ") === cueText(cue)) return cues;
  const step = (cue.end - cue.start) / tokens.length;
  const replacements = tokens.map((hero, index) => ({
    ...cue,
    id: index === 0 ? id : `${id}-${crypto.randomUUID()}`,
    hero,
    lead: undefined,
    trail: undefined,
    original: index === 0 ? (cue.original ?? { lead: cue.lead, hero: cue.hero, trail: cue.trail }) : undefined,
    start: cue.start + index * step,
    end: index === tokens.length - 1 ? cue.end : cue.start + (index + 1) * step,
  }));
  return cues.flatMap((word) => (word.id === id ? replacements : [word]));
}
/** Compares settings by value; unset, false, 0 and "" all count as "not set". */
export const settingsDiffer = (
  a: CaptionSettings,
  b: CaptionSettings,
  keys = Object.keys({ ...a, ...b }) as (keyof CaptionSettings)[],
) => keys.some((key) => JSON.stringify(a[key] || null) !== JSON.stringify(b[key] || null));
/**
 * Settings for a newly picked style. Whatever the user placed or sized by hand follows them;
 * everything else, and anything left at the old style's default, comes from the new style.
 */
export function carryPlacement(current: CaptionSettings, fromId: string, toId: string, aspect: AspectId = "9:16"): CaptionSettings {
  const before = defaultStyleSettings(fromId, aspect);
  const next = defaultStyleSettings(toId, aspect);
  const cap = styleCapabilities(toId);
  const keys: (keyof CaptionSettings)[] = [
    "y",
    "size",
    ...(cap.positionX ? (["x"] as const) : []),
    ...(cap.rotation ? (["rotation"] as const) : []),
    ...(cap.width ? (["maxWidth"] as const) : []),
  ];
  for (const key of keys)
    if (settingsDiffer(current, before, [key])) Object.assign(next, { [key]: current[key] });
  return next;
}
/** Does this word carry formatting that All-words edits skip? */
export const hasCustomFormat = (word: Cue) => !!word.format || !!word.highlight || !!word.color || !!word.original;
export const resetWordFormatting = (word: Cue): Cue =>
  !word.format && !word.highlight && !word.color
    ? word
    : {
        ...word,
        format: undefined,
        highlight: undefined,
        color: undefined,
      };
/** Everything the user changed on one word: its look and its text, including any words the retyped text split into. */
export function resetWordEdits(cues: Cue[], id: string): Cue[] {
  const word = cues.find((cue) => cue.id === id);
  if (!word) return cues;
  const original = word.original;
  const pieces = original ? cues.filter((cue) => cue.id.startsWith(`${id}-`)) : [];
  return cues
    .filter((cue) => !pieces.includes(cue))
    .map((cue) =>
      cue.id !== id
        ? cue
        : {
            ...resetWordFormatting(cue),
            ...(original ? { ...original, original: undefined, end: pieces.at(-1)?.end ?? cue.end } : {}),
          },
    );
}
const STYLE_PRESETS: Record<string, Partial<CaptionSettings>> = {
  "creator-emoji": {
    font: "The Bold Font", weight: 800, size: 24,
    highlights: { ...DEFAULT_HIGHLIGHTS, color: "#ffe36b" },
  },
  "style-two": {
    font: "Instrument Sans", weight: 500, size: 24,
    highlights: { ...DEFAULT_HIGHLIGHTS, color: "#ffffff" },
  },
  "hormozi-pop": {
    font: "Poppins", weight: 900, size: 22,
    highlights: { ...DEFAULT_HIGHLIGHTS, color: "#ffda4a" },
  },
  "minimal-glow": { font: "Instrument Sans", weight: 700, size: 22 },
  "karaoke-pill": {
    font: "Inter", weight: 700, size: 22,
    highlights: { ...DEFAULT_HIGHLIGHTS, mode: "fill", color: "#ffffff", backgroundColor: "#6366f1" },
  },
  "simple-text": { weight: 400, size: 20 },
  "one-word": { weight: 700, size: 25 },
  "plain-active-word": { weight: 700, size: 21 },
  "soft-fade": { weight: 500, size: 21, motion: "fade", motionDuration: 240 },
  "pop-in": { weight: 700, size: 22, motion: "pop", motionDuration: 180 },
  "bold-impact": { weight: 900, size: 26, shadow: 55, motion: "pop", motionDuration: 150 },
  "highlight-chip": {
    weight: 750, size: 21,
    highlights: { ...DEFAULT_HIGHLIGHTS, mode: "fill", color: "#ffffff", backgroundColor: "#7651e8" },
  },
  "underline-focus": { weight: 650, size: 21 },
  "stacked-text": { weight: 700, size: 22, lineSpacing: 1.18 },
};

export const defaultStyleSettings = (styleId: string, aspect: AspectId = "9:16"): CaptionSettings => {
  const preset = captionStyle(styleId);
  if (!preset) return { ...DEFAULT_CAPTION_SETTINGS, y: DEFAULT_CAPTION_Y[aspect], ...(STYLE_PRESETS[styleId] ?? STYLE_PRESETS["simple-text"]) };
  const stroke = "stroke" in preset ? preset.stroke : 0;
  const entrance = basicMotion(styleId);
  return {
    ...DEFAULT_CAPTION_SETTINGS,
    font: preset.fontFamily,
    fontAsset: preset.fontSrc,
    weight: preset.weight,
    // Anton is condensed, so a headline set in it needs more size to carry the same weight.
    size: styleId === "tall-headline" ? 26 : 18,
    color: preset.color,
    // Short pages read best in vertical video; users can raise this in Layout.
    maxWords: "maxWords" in preset ? (preset.category === "Basic" ? Math.min(preset.maxWords, 4) : preset.maxWords) : undefined,
    motion: preset.motion,
    motionDuration: 180,
    animation: entrance ? { ...entrance, out: "none" } : undefined,
    lineSpacing: preset.category === "Standard" ? 1.13 : 1.2,
    letterSpacing: "letterSpacing" in preset && typeof preset.letterSpacing === "number" ? preset.letterSpacing / 4 : 0,
    textCase: "textCase" in preset ? (preset.textCase as CaptionSettings["textCase"]) : "preserve",
    // Lower third, clear of the apps' bottom UI; wider frames sit lower, like subtitles.
    y: DEFAULT_CAPTION_Y[aspect],
    highlights: { ...DEFAULT_HIGHLIGHTS,
      color: preset.effect === "pill" ? "#ffffff" : "accent2" in preset ? (preset.accent2 as string) : preset.accent,
      backgroundColor: "plate" in preset && "plateColor" in preset && preset.plate ? preset.plateColor : preset.accent,
      mode: preset.effect === "pill" ? "fill" : "text",
    },
    emphasis: emphasisDefaults(styleId),
    // A style's built-in outline shows in Design, so it can be changed or switched off there.
    effects: stroke && styleCapabilities(styleId).effects
      ? resolveEffects({
          stroke: {
            on: true,
            color: "strokeColor" in preset ? preset.strokeColor : "#101014",
            width: Math.max(0.25, Math.round(stroke * 220) / 20),
          },
        })
      // One Word starts with a soft shadow so white text reads on bright video; Design can switch it off.
      : styleId === "captions-dot"
        ? resolveEffects({ shadow: { on: true, color: "#000000", opacity: 45, blur: 3, x: 0, y: 1 } })
        : undefined,
  };
};
