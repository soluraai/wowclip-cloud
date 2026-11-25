import type { CaptionWord } from "../CaptionEngine/types";

export type NeonVariant = "outline" | "shine" | "split" | "echo" | "plain" | "metric";
export type NeonAccent = "red" | "blue" | "green";
export type NeonPlacement = "center" | "left" | "right";

export type NeonSlideDirection = "left" | "right" | "alternate" | "from-left" | "from-right" | "to-left" | "to-right";

/** Optional editorial direction. Text and timing always come from the transcript. */
export type NeonDirection = {
  wordIds: string[];
  heroWordId?: string;
  variant?: NeonVariant;
  /** Legacy input, accepted for compatibility; the visual theme uses one red accent. */
  accent?: NeonAccent;
  /** Legacy input, accepted for compatibility; all layouts are horizontally centered. */
  placement?: NeonPlacement;
  /** Entrance slide direction for the main keyword. Defaults to alternating between cues. */
  heroSlide?: "left" | "right";
};

export type NeonSource = {
  transcript: unknown;
  direction?: NeonDirection[];
  durationMs?: number;
  background?: { src?: string; muted?: boolean; volume?: number };
};

export type NeonStyle = {
  /** Coordinates and sizes are relative to a 720 px wide portrait. */
  positionX?: number;
  positionY?: number;
  maxWidth?: number;
  heroScale?: number;
  normalSize?: number;
  glow?: number;
  flicker?: number;
  /** Legacy input; past cues are never retained behind the active caption. */
  trailLayers?: number;
  scrimOpacity?: number;
  transparent?: boolean;
  backgroundColor?: string;
  /** Slide direction for headline keywords: "left", "right", or "alternate". Replaces pop up. */
  heroSlide?: NeonSlideDirection;
  /** Distance in 720px units for the entrance slide. Defaults to 60. */
  heroSlideDistance?: number;
};

export type NeonSettings = Required<NeonStyle>;

export type NeonNumber = {
  value: number;
  decimals: number;
  prefix: string;
  suffix: string;
  grouping: boolean;
  indianGrouping: boolean;
  devanagari: boolean;
};

export type NeonCue = {
  id: string;
  index: number;
  words: CaptionWord[];
  heroIndex: number;
  variant: NeonVariant;
  accent: NeonAccent;
  placement: NeonPlacement;
  heroSlide?: "left" | "right";
  number: NeonNumber | null;
  startMs: number;
  endMs: number;
  retireMs: number;
  seed: number;
};
