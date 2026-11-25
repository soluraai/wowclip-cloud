// Browser entry: import individual renderers here, never the Studio registerRoot entry.
// Demo transcripts, the CLI, and unrelated caption styles stay out of the website bundle.
export { BasicCaptionRenderer as BasicCaption } from "./BasicCaption/BasicCaptionRenderer";
export {
  EverydayCaption,
  SimpleText,
  PlainActiveWord,
} from "./BasicCaption/EverydayRenderer";
export type {
  BasicCaptionRendererProps as BasicCaptionProps,
  BasicCaptionPresentation,
} from "./BasicCaption/BasicCaptionRenderer";
export type { BasicCaptionSource } from "./BasicCaption/source";
export { TrendingCaption } from "./LaunchCaptionPack/legacy/TrendingCaption";
export type { TrendingCaptionProps } from "./LaunchCaptionPack/legacy/TrendingCaption";
export { BasicStyle } from "./Basic/BasicStyle";
export type { BasicStyleProps } from "./Basic/BasicStyle";
export { CaptionStyleRenderer } from "./CaptionStyleRenderer";
export type { CaptionStyleRendererProps } from "./CaptionStyleRenderer";
