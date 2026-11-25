import type { CaptionSource, Word } from "../LaunchCaptionPack/types";

export type BeatKind = "stamp" | "underline" | "bracket" | "jiggle" | "burst";
export type StoryBeat = { wordId: string; kind: BeatKind; sound?: boolean };
export type CoralSource = CaptionSource & {
  /** Explicit, source-ID-based edit decisions take priority over automatic accents. */
  beats?: StoryBeat[];
  breakAfterWordIds?: string[];
};
export type CoralConfig = {
  fontSize: number;
  minFontSize: number;
  fontWeight: number;
  ink: string;
  paper: string;
  coral: string;
  positionY: number;
  maxWidth: number;
  maxWords: number;
  maxCharacters: number;
  maxDurationMs: number;
  pauseMs: number;
  lingerMs: number;
  /** Off disables inferred beats. Explicit supplied beats remain available. */
  automaticBeats: "off" | "subtle" | "balanced";
  beatCooldownMs: number;
  soundEnabled: boolean;
  soundVolume: number;
  reducedMotion: boolean;
};
export type CoralStoryProps = {
  sourceConfig?: CoralSource;
  styleConfig?: Partial<CoralConfig> & {
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
export type StoryCue = {
  id: string;
  words: Word[];
  startMs: number;
  endMs: number;
  variant: "strip" | "stamp";
  accentWordId?: string;
  beat?: StoryBeat;
};
export type StoryItem = {
  word: Word;
  text: string;
  x: number;
  baseline: number;
  width: number;
  size: number;
  ascent: number;
  descent: number;
  family: string;
  inkOffsetX: number;
  line: number;
};
export type StoryLayout = StoryCue & {
  items: StoryItem[];
  box: { x: number; y: number; width: number; height: number };
  unit: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  lineHeights: number[];
  diagnostics: string[];
};
