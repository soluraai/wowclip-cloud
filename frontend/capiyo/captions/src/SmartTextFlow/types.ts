export type FlowRole = "body" | "strong" | "expressive" | "script" | "number";
export type FlowEmphasis = "none" | "marker" | "underline" | "box" | "textColor" | "circle" | "bracket" | "strike";
export type FlowNumber = {
  value: number; decimals: number; prefix: string; suffix: string;
  divisor: number; grouping: "none" | "western" | "indian"; devanagari: boolean;
};

/** Compatible with the reference's segment JSON; palette mode honors segment colors. */
export type FlowSegment = {
  type: "text" | "number";
  value: string | number;
  style?: "normal" | "bold" | "italic" | "serif" | "italic-serif" | "cursive";
  highlight?: boolean;
  emphasis?: FlowEmphasis;
  display?: "inline" | "hero";
  case?: "original" | "uppercase" | "lowercase" | "title";
  format?: "normal" | "comma" | "compact" | "currency" | "percentage";
  prefix?: string;
  suffix?: string;
  decimals?: number;
  lineBreak?: boolean;
  startMs?: number;
  endMs?: number;
  delayFrames?: number;
  color?: string;
  emphasisColor?: string;
  animation?: string;
};
export type FlowSource = {
  transcript?: unknown;
  segments?: FlowSegment[];
  cues?: { segments: FlowSegment[]; startMs?: number; endMs?: number }[];
  durationMs?: number;
  composition?: { fps?: number; durationSeconds?: number };
  theme?: Record<string, unknown>;
  background?: { src: string; kind?: "video" | "image"; muted?: boolean; volume?: number };
};
export type FlowToken = {
  id: string; text: string; startMs: number; endMs: number;
  role: FlowRole; number: FlowNumber | null; marked: boolean;
  emphasis: FlowEmphasis; large: boolean;
  breakBefore: boolean; breakAfter: boolean;
  color?: string; emphasisColor?: string;
  /** A font and spacing picked in the editor, laid over the role's own face. */
  look?: FlowLook;
  /** Mix captions: the word in English letters, for the template's big word (Script/mix). */
  mix?: string;
};
export type FlowLook = { family?: string; weight?: number; italic?: boolean; tracking?: number };
export type FlowCue = {
  id: string; tokens: FlowToken[]; startMs: number; endMs: number;
  focusId: string | null;
  metricId: string | null;
};
export type FlowSettings = {
  accent: string; text: string; canvas: string; positionY: number;
  maxWidth: number; fontSize: number; maxWords: number; maxCharacters: number;
  maxDurationMs: number; maxGapMs: number; wordMs: number; holdMs: number;
  maxLines: number; glow: number; scrimOpacity: number; transparent: boolean;
  colorMode: "single" | "palette"; palette: string[];
  numberLayout: "inline" | "hero";
};
export type FlowStyle = Partial<FlowSettings>;
