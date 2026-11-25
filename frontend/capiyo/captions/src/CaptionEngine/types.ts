/** Compatible with Remotion's Caption JSON format, without a runtime dependency. */
export type CaptionWord = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  pageBreakAfter?: boolean;
  /** Mix captions: the word's English-letters forms (Script/mix). */
  mix?: string;
  latin?: string;
};

export type CaptionCueMode = "emphasis" | "standalone" | "plain" | "skip";

/** The model chooses meaning and word IDs. It never invents text or coordinates. */
export type CaptionPlan = {
  version: 1;
  omitWordIds?: string[];
  cues: {
    id?: string;
    mode: CaptionCueMode;
    wordIds: string[];
    heroWordIds?: string[];
    /** Optional, one subtle in-line accent in a plain cue; not a large hero. */
    accentWordIds?: string[];
    nesting?: "auto" | "off";
    helperPlacement?: "natural" | "above" | "below";
  }[];
};

export type CaptionCue = {
  id: string;
  mode: "emphasis" | "standalone" | "plain";
  words: CaptionWord[];
  heroWords: CaptionWord[];
  accentWordIds?: string[];
  beforeWords: CaptionWord[];
  afterWords: CaptionWord[];
  nesting: "auto" | "off";
  helperPlacement: "natural" | "above" | "below";
  startFrame: number;
  endFrame: number;
};

export type EngineOptions = {
  fallback: "plain" | "hide";
  minConfidence: number;
  maxGapMs: number;
  maxPlainWords: number;
  maxPlainCharacters: number;
  maxPlainDurationMs: number;
  lingerMs: number;
};

export type CompiledCaptions = {
  words: CaptionWord[];
  cues: CaptionCue[];
  diagnostics: string[];
  durationInFrames: number;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const wordsText = (words: CaptionWord[]): string =>
  words.map((word) => word.text.trim()).join(" ");
