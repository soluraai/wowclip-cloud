import type { CaptionWord } from "../CaptionEngine/types";

export type SerifGlowTreatment = "plain" | "glow";

/** Direction changes the edit, never the words or their speech timing. */
export type SerifGlowDirection = {
  from: string;
  through?: string;
  treatment: SerifGlowTreatment;
};

export type SerifGlowSource = {
  transcript: unknown;
  direction?: SerifGlowDirection[];
  highlightWords?: string[];
  durationMs?: number;
  background?: { src: string; muted?: boolean; volume?: number };
};

export type SerifGlowStyle = {
  positionY?: number;
  maxWidth?: number;
  normalSize?: number;
  highlightSize?: number;
  normalTracking?: number;
  highlightTracking?: number;
  accent?: string;
  textColor?: string;
  glow?: number;
  lowercase?: boolean;
};

export type SerifGlowSettings = Required<SerifGlowStyle>;

export type SerifGlowCue = {
  id: string;
  words: CaptionWord[];
  treatment: SerifGlowTreatment;
  startMs: number;
  endMs: number;
  fadeMs: number;
};

export type SerifGlowProps = {
  sourceConfig?: SerifGlowSource;
  styleConfig?: SerifGlowStyle & {
    naturalWrap?: boolean;
    onLayout?: (height: number) => void;
  };
  presentationConfig?: {
    onLayout?: (height: number) => void;
    backgroundColor?: string;
    reducedMotion?: boolean;
  };
  fps?: number;
};
