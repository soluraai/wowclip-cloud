import type { MotionIn, MotionOut, MotionUnit } from "../../../captions/src/BasicCaption/motion";

export type CaptionMotion = "none" | "fade" | "pop";
export type { CaptionStyleId } from "./styleCatalog";
export type HighlightAppearance = {
  color: string;
  backgroundColor: string;
  mode: "text" | "fill";
  scale: number;
};
export type HighlightSettings = HighlightAppearance & { enabled: boolean;
  /** Accents that can take a gradient (Red Wipe's wipe, Creator's reply line). "line" runs one gradient across the line. */
  colorMode?: "solid" | "gradient";
  gradientStops?: GradientStop[];
  gradientAngle?: number;
  gradientSpan?: "word" | "line";
};
export const DEFAULT_HIGHLIGHTS: HighlightSettings = {
  enabled: true,
  color: "#ffe36b",
  backgroundColor: "#570df8",
  mode: "text",
  scale: 1,
};
/** How key words look. Separate from the accent, which belongs to the style's active-word effect. */
export type EmphasisSettings = HighlightSettings & {
  /** Script font id, for styles that draw key words in cursive. */
  font?: string;
  /** The same gradient controls as the text color. */
  colorMode?: "solid" | "gradient";
  gradientStops?: GradientStop[];
  gradientAngle?: number;
  /** The drawn shape (marker, ring) in a gradient instead of its one color. */
  shapeColorMode?: "solid" | "gradient";
  shapeGradientStops?: GradientStop[];
  shapeGradientAngle?: number;
};
/** Motion the user picked; "style" keeps the template's own entrance. */
export type AnimationSettings = {
  unit: MotionUnit;
  in: MotionIn | "style";
  /** Entrance of key words alone; "same" or missing moves them with the rest. */
  keyIn?: MotionIn | "same";
  /** Exit of key words alone; "same" or missing leaves them with the rest. */
  keyOut?: MotionOut | "same";
  out: MotionOut;
  /** How a Standard caption's words appear; word by word when missing. */
  reveal?: "word" | "line" | "chunk";
};
export const DEFAULT_ANIMATION: AnimationSettings = {
  unit: "caption",
  in: "style",
  out: "none",
};
export type GradientStop = { id: string; color: string; position: number };
export const DEFAULT_GRADIENT: GradientStop[] = [
  { id: "start", color: "#570df8", position: 0 },
  { id: "end", color: "#bba0ff", position: 100 },
];

export const BLEND_MODES = [
  { id: "normal", label: "Normal" },
  { id: "multiply", label: "Multiply" },
  { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" },
  { id: "soft-light", label: "Soft light" },
  { id: "hard-light", label: "Hard light" },
  { id: "color-dodge", label: "Color dodge" },
  { id: "difference", label: "Difference" },
  { id: "exclusion", label: "Exclusion" },
] as const;
export type BlendMode = (typeof BLEND_MODES)[number]["id"];

/** Text-level design effects. Sizes are in editor px (same scale as font size and letter spacing). */
export type TextEffects = {
  opacity: number;
  blend: BlendMode;
  stroke: { on: boolean; color: string; width: number };
  shadow: { on: boolean; color: string; opacity: number; blur: number; x: number; y: number };
  glow: { on: boolean; color: string; opacity: number; blur: number };
  /** Solid extrusion that gives the text a 3D look; angle 0° = right, 90° = down. */
  depth: { on: boolean; color: string; length: number; angle: number };
};
export const DEFAULT_EFFECTS: TextEffects = {
  opacity: 100,
  blend: "normal",
  stroke: { on: false, color: "#000000", width: 2 },
  shadow: { on: false, color: "#000000", opacity: 60, blur: 4, x: 0, y: 2 },
  glow: { on: false, color: "#ffe36b", opacity: 80, blur: 10 },
  depth: { on: false, color: "#570df8", length: 6, angle: 60 },
};
/** Fills any missing effect field with its default, so older drafts and partial patches stay valid. */
export const resolveEffects = (effects?: Partial<TextEffects>): TextEffects => ({
  ...DEFAULT_EFFECTS,
  ...effects,
  stroke: { ...DEFAULT_EFFECTS.stroke, ...effects?.stroke },
  shadow: { ...DEFAULT_EFFECTS.shadow, ...effects?.shadow },
  glow: { ...DEFAULT_EFFECTS.glow, ...effects?.glow },
  depth: { ...DEFAULT_EFFECTS.depth, ...effects?.depth },
});
export const hasEffects = (effects?: Partial<TextEffects>) => {
  const fx = resolveEffects(effects);
  return (
    fx.opacity !== 100 ||
    fx.blend !== "normal" ||
    fx.stroke.on || fx.shadow.on || fx.glow.on || fx.depth.on
  );
};

/** One text part of a Premium style. What is missing keeps the design's own look. */
export type PartId = "main" | "helper" | "script" | "plain";
export type PartSettings = {
  font?: string;
  weight?: number;
  italic?: boolean;
  fontAsset?: string;
  fontUploadId?: string;
  color?: string;
  colorMode?: "solid" | "gradient";
  gradientStops?: GradientStop[];
  gradientAngle?: number;
  /** This part's size against the design's, 1 being the design's own. */
  scale?: number;
  /** Design (stroke, shadow, glow, 3D, opacity) for this kind of text alone. */
  effects?: TextEffects;
  /** Letter spacing for this kind of text alone, in editor px, added on top of the whole caption's. */
  letterSpacing?: number;
  /** Text case for this kind of text alone; missing keeps the design's. */
  textCase?: "preserve" | "uppercase" | "lowercase";
  /** Extra gap between this text's words, in editor px. */
  wordSpacing?: number;
};

/** The box a style draws around its key word (Focus Frame). Missing values keep the design's. */
export type BoxSettings = {
  color?: string;
  colorMode?: "solid" | "gradient";
  gradientStops?: GradientStop[];
  gradientAngle?: number;
  /** Fill opacity, 0–100. */
  opacity?: number;
  frameWidth?: number;
  radius?: number;
  /** Space around the word, in percent of the design's. */
  padding?: number;
  handles?: boolean;
  /** Frame glow, 0–100. */
  glow?: number;
  /** How long the frame takes to draw on, in ms. */
  drawMs?: number;
};

export type CaptionSettings = {
  font: string;
  weight?: number;
  italic?: boolean;
  fontAsset?: string;
  fontUploadId?: string;
  size: number;
  color: string;
  colorMode?: "solid" | "gradient";
  gradientStops?: GradientStop[];
  gradientAngle?: number;
  gradientScope?: "word" | "character";
  letterSpacing?: number;
  lineSpacing?: number;
  /** Extra space between words, in the same px units as letterSpacing. */
  wordSpacing?: number;
  shadow: number;
  textCase?: "preserve" | "uppercase" | "lowercase";
  maxWords?: number;
  /**
   * Standard and Premium: normal-text words per caption (the main word not counted). Undefined is
   * Auto: captions are cut to fit the box at the current size, all about the same width.
   */
  normalWords?: number;
  /** Two-line styles: words on the top and bottom line. A missing one is left to the layout. */
  lineWords?: { top?: number; bottom?: number };
  maxWidth?: number;
  /** Upper bound on lines per caption page; undefined lets the style decide. */
  maxLines?: number;
  textAlign?: "left" | "center" | "right";
  /** Caption block rotation in degrees. */
  rotation?: number;
  /** When sizes or spacing change, the caption re-lays itself out so nothing overlaps. Undefined = on. */
  autoFit?: boolean;
  x: number;
  y: number;
  motion: CaptionMotion;
  motionDuration: number;
  highlights?: HighlightSettings;
  emphasis?: EmphasisSettings;
  animation?: AnimationSettings;
  /** One word's own entrance; only ever set on a word. */
  wordIn?: MotionIn;
  /** One Premium word's size against the rest of its part; only ever set on a word. */
  sizeScale?: number;
  /** Style-specific on/off options; a missing id means on. */
  features?: Record<string, boolean>;
  /** Stroke, shadow, glow, 3D depth, opacity and blend. */
  effects?: TextEffects;
  /** Fonts and colors picked for a Premium style's text parts. */
  parts?: Partial<Record<PartId, PartSettings>>;
  box?: BoxSettings;
  /** Design on every word that isn't a key word (the Other words side). */
  restEffects?: TextEffects;
  /** What the Key words side changed for every key word: its spacing and Design. A word's own edits beat it. */
  keyFormat?: KeyFormat;
};
export type KeyFormat = { letterSpacing?: number; effects?: TextEffects; textCase?: "preserve" | "uppercase" | "lowercase" };
export type WordFormatting = Partial<
  Omit<
    CaptionSettings,
    | "parts"
    | "box"
    | "restEffects"
    | "keyFormat"
    | "highlights"
    | "emphasis"
    | "animation"
    | "features"
    | "x"
    | "y"
    | "motion"
    | "motionDuration"
    | "maxLines"
    | "textAlign"
    | "rotation"
    | "wordSpacing"
  >
>;
export type CaptionWordEdits = {
  highlighted?: boolean;
  format?: WordFormatting;
  highlight?: Partial<HighlightAppearance>;
};

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  font: "Inter",
  weight: 400,
  italic: false,
  size: 24,
  color: "#ffffff",
  colorMode: "solid",
  gradientStops: DEFAULT_GRADIENT,
  gradientAngle: 90,
  gradientScope: "word",
  letterSpacing: 0,
  lineSpacing: 1.1,
  shadow: 0,
  x: 50,
  // The lower middle of the frame: under a speaker's face, and above every app's bottom UI.
  y: 70,
  motion: "none",
  motionDuration: 160,
  highlights: DEFAULT_HIGHLIGHTS,
};
