export type StyleId =
  | "clean-creator" | "contrast-box" | "karaoke-sweep" | "pop-bounce"
  | "meme-impact" | "cinematic-serif" | "neon-tech"
  | "editorial-marker" | "focus-stack";
export type Animation = "none" | "fade" | "rise" | "pop" | "bounce";
export type FontId = "poppins" | "inter" | "anton" | "playfair" | "space" | "newsreader" | "montserrat";
export type CaptionStyle = {
  id: StyleId;
  name: string;
  category: "Core" | "Creative";
  description: string;
  font: FontId;
  weight: number;
  size: number;
  minSize: number;
  uppercase: boolean;
  color: string;
  accent: string;
  stroke: number;
  maxWords: number;
  maxCharacters: number;
  maxDurationMs: number;
  positionY: number;
  maxWidth: number;
  animation: Animation;
  treatment: "clean" | "box" | "sweep" | "pop" | "meme" | "speaker" | "serif" | "neon" | "marker" | "stack";
};
export type Word = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
  emphasis: boolean;
  event: boolean;
  pageBreakAfter: boolean;
  /** Mix captions: the English form this word shows when it is a main word (Script/mix.ts). */
  mix?: string;
  /** Mix captions: the word in English letters ("ko"), for whole lines a design sets in English letters. */
  latin?: string;
};
export type CaptionSource = {
  transcript: unknown;
  durationMs?: number;
  emphasisWordIds?: string[];
  speakers?: Record<string, { name: string; color?: string }>;
  background?: { src?: string; kind?: "video" | "image"; muted?: boolean; volume?: number };
};
export type StyleOverrides = {
  /** Sizes use a 1080px short edge, so landscape captions stay readable. */
  fontSize?: number;
  color?: string;
  accent?: string;
  positionY?: number;
  maxWidth?: number;
  boxMode?: "dark" | "light";
  /** Zero disables the local shadow/scrim; no video analysis is performed. */
  scrimOpacity?: number;
  safeArea?: Partial<{ top: number; right: number; bottom: number; left: number }>;
};
export type LaunchCaptionProps = {
  styleId?: StyleId;
  sourceConfig?: CaptionSource;
  styleConfig?: StyleOverrides;
  animationOverride?: Animation;
  reducedMotion?: boolean;
  fps?: number;
};
export type Cue = { id: string; words: Word[]; startMs: number; endMs: number; speaker?: string };
export type PositionedWord = {
  word: Word; text: string; x: number; y: number; width: number; size: number;
  ascent: number; descent: number; family: string; italic: boolean; line: number;
};
export type LayoutCue = Cue & {
  items: PositionedWord[];
  bounds: { x: number; y: number; width: number; height: number };
  safe: { left: number; right: number; top: number; bottom: number };
  scale: number;
  diagnostics: string[];
};
