import type { Cue } from "../app/CaptionTimeline";
import type { CaptionSettings } from "../app/captionSettings";
import type { VideoFrameSettings } from "../../../captions/src/VideoFrame";
import { resolveCaptionStyleId } from "../app/styleCatalog";
import {
  captionFallbacks,
  createBasicSource,
  createBasicStyle,
  createPresentation,
  createWordColors,
  pagedCues,
} from "./adapter";

/**
 * What Export sends the server: the exact caption props the preview plays (RemotionPreview), without the video,
 * plus the settings that size the caption strip and the Video tab (done by FFmpeg). The server fingerprints it,
 * so exporting the same thing again reuses the finished file.
 */
export function renderRequest({ cues, settings, styleId, video, duration }: {
  cues: Cue[];
  settings: CaptionSettings;
  styleId: string;
  video: VideoFrameSettings;
  duration: number;
}) {
  const variant = resolveCaptionStyleId(styleId);
  const pages = pagedCues(cues, settings, variant);
  const source = createBasicSource(pages, "", duration);
  return {
    inputProps: {
      styleId: variant,
      sourceConfig: { ...source, background: undefined },
      styleConfig: createBasicStyle(settings, variant),
      presentationConfig: createPresentation(settings, createWordColors(cues), captionFallbacks(cues), cues, variant),
    },
    settings,
    // Key words may be set larger than the rest; leave room for them in the strip.
    largestSize: settings.size * 1.6,
    lines: settings.maxLines ?? 2,
    video: { ...video, segments: undefined },
  };
}
