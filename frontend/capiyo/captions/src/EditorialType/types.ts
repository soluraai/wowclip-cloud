import type { FlowCue, FlowSource, FlowToken } from "../SmartTextFlow/types";

export type EditorialSource = FlowSource;
export type EditorialRole = "body" | "strong" | "serif" | "number";
export type EditorialToken = FlowToken & { typeRole: EditorialRole };
export type EditorialCue = Omit<FlowCue, "tokens"> & {
  tokens: EditorialToken[];
  kind: "phrase" | "hero" | "metric" | "comparison";
  heroIds: string[];
};
export type EditorialSettings = {
  text: string; canvas: string; positionY: number; maxWidth: number;
  fontSize: number; helperSize: number; heroSize: number; numberSize: number; rowGap: number;
  /** The size pick already inside heroSize, so a fit for a bigger main word leaves the helpers alone. */
  mainPick?: number;
  /** Spacing picked in the editor, as a share of each word's size, on top of each role's own tracking. */
  tracking?: { main: number; helper: number };
  maxWords: number; maxCharacters: number; maxDurationMs: number;
  wordMs: number; holdMs: number; entryMs: number; exitMs: number;
  shadow: number; backgroundDim: number; transparent: boolean;
  alignment: "editorial" | "center";
  scriptFrequency: number;
};
export type EditorialStyle = Partial<EditorialSettings>;
