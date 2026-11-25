import type { CaptionStyle, StyleId, StyleOverrides } from "./types";

const base = {
  category: "Core", font: "poppins", weight: 600, size: 62, minSize: 48,
  uppercase: false, color: "#ffffff", accent: "#ffe08a", stroke: 3,
  maxWords: 7, maxCharacters: 48, maxDurationMs: 3000,
  positionY: 0.68, maxWidth: 0.78, animation: "rise", treatment: "clean",
} as const;

/** Original launch presets; order is a product recommendation, not a market ranking. */
export const LAUNCH_STYLES: readonly CaptionStyle[] = [
  { ...base, id: "clean-creator", name: "Clean Creator", description: "A calm, readable everyday default." },
  { ...base, id: "contrast-box", name: "Contrast Box", description: "Solid subtitle plates for busy or bright footage.",
    font: "inter", weight: 700, size: 58, minSize: 46, stroke: 0, treatment: "box", animation: "fade", maxWords: 8 },
  { ...base, id: "karaoke-sweep", name: "Karaoke Sweep", description: "A cyan fill follows speech inside each word.",
    font: "inter", weight: 800, size: 68, minSize: 52, accent: "#78edee", color: "#ebedf5", treatment: "sweep", maxWords: 6 },
  { ...base, id: "pop-bounce", name: "Pop Bounce", description: "Rounded, playful words with a restrained sticker bounce.",
    weight: 800, size: 78, minSize: 60, accent: "#ff8fa9", stroke: 7, maxWords: 3, maxCharacters: 24,
    maxDurationMs: 1800, treatment: "pop", animation: "bounce" },
  { ...base, id: "meme-impact", name: "Meme Impact", category: "Creative", description: "Condensed lower captions for reactions and memes.",
    font: "anton", weight: 400, size: 88, minSize: 66, uppercase: true, stroke: 9,
    maxWords: 5, maxCharacters: 32, treatment: "meme", animation: "none" },
  { ...base, id: "cinematic-serif", name: "Cinematic Serif", category: "Creative", description: "Warm editorial type with true italic emphasis.",
    font: "playfair", weight: 600, size: 68, minSize: 52, color: "#fff4df", accent: "#edc784", stroke: 0,
    maxWidth: 0.72, maxWords: 6, maxCharacters: 42, positionY: 0.66, treatment: "serif" },
  { ...base, id: "neon-tech", name: "Neon Tech", category: "Creative", description: "Crisp geometric lettering with a controlled cyan halo.",
    font: "space", weight: 700, size: 72, minSize: 56, uppercase: true, accent: "#76efff", stroke: 3,
    maxWords: 4, maxCharacters: 28, maxDurationMs: 2200, treatment: "neon", animation: "pop" },
  { ...base, id: "editorial-marker", name: "Editorial Marker", category: "Creative", description: "Reading-first serif text with a drawn keyword swatch.",
    font: "newsreader", weight: 600, size: 70, minSize: 54, accent: "#fff083", stroke: 0,
    maxWords: 6, maxCharacters: 44, treatment: "marker", animation: "fade" },
  { ...base, id: "focus-stack", name: "Focus Stack", category: "Creative", description: "Words build into two lines around one oversized keyword.",
    font: "montserrat", weight: 800, size: 70, minSize: 54, uppercase: true, accent: "#ffb078", stroke: 5,
    maxWords: 3, maxCharacters: 24, maxDurationMs: 1900, treatment: "stack", animation: "pop" },
];

export const DEFAULT_STYLE_ID: StyleId = "clean-creator";
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const finite = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
export const safeColor = (v: unknown, fallback: string) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v) ? v : fallback;

export const resolveStyle = (id: StyleId = DEFAULT_STYLE_ID, overrides: StyleOverrides = {}): CaptionStyle => {
  const preset = LAUNCH_STYLES.find(style => style.id === id);
  if (!preset) throw new Error(`Unknown launch caption style: ${id}`);
  const size = clamp(finite(overrides.fontSize, preset.size), 36, 120);
  return { ...preset, size, minSize: Math.min(preset.minSize, size),
    color: safeColor(overrides.color, preset.color), accent: safeColor(overrides.accent, preset.accent),
    positionY: clamp(finite(overrides.positionY, preset.positionY), 0, 1),
    maxWidth: clamp(finite(overrides.maxWidth, preset.maxWidth), 0.35, 0.94) };
};

/** Serializable picker metadata for all 12 entries, with stable legacy composition IDs. */
export const CAPTION_CATALOG = [
  ...LAUNCH_STYLES.map(style => ({ ...style, isNew: true, recommended: style.id === DEFAULT_STYLE_ID,
    compositionId: `Launch-${style.name.replace(/ /g, "")}` })),
  { id: "hormozi", name: "HormoziPop", category: "Creative", isNew: false, recommended: false, compositionId: "HormoziPop", description: "Existing bold active-word style." },
  { id: "minimal", name: "MinimalGlow", category: "Core", isNew: false, recommended: false, compositionId: "MinimalGlow", description: "Existing lowercase glow style." },
  { id: "pill", name: "KaraokePill", category: "Core", isNew: false, recommended: false, compositionId: "KaraokePill", description: "Existing sliding purple highlight." },
] as const;
