import type { CaptionSource, Word } from "../LaunchCaptionPack/types";

export type SaraConfig = {
  /** Type sizes are expressed on a 720px-wide portrait canvas. */
  fontSize: number;
  minFontSize: number;
  maxWords: number;
  maxCharacters: number;
  maxDurationMs: number;
  pauseMs: number;
  lingerMs: number;
  positionY: number;
  maxWidth: number;
  color: string;
  glow: number;
  shadow: number;
  reducedMotion: boolean;
};
export type SaraProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: Partial<SaraConfig> & {
    naturalWrap?: boolean;
    onLayout?: (height: number) => void;
  };
  presentationConfig?: {
    onLayout?: (height: number) => void;
    backgroundColor?: string;
    reducedMotion?: boolean;
    parts?: import("../Premium/parts").PremiumParts;
  };
  fps?: number;
};
export type SaraCue = { id: string; words: Word[]; startMs: number; endMs: number; variant: "slide" | "fade" };
export type SaraItem = { word: Word; x: number; baseline: number; width: number; ascent: number;
  descent: number; inkOffsetX: number; family: string; weight?: number; italic?: boolean; line: number; size: number; hook: boolean };
export type SaraLayout = SaraCue & { items: SaraItem[]; size: number; tracking: number;
  bounds: { x: number; y: number; width: number; height: number }; diagnostics: string[] };
