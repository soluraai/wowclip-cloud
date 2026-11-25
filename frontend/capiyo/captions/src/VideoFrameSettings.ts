// Plain video-frame settings, with no React, so server code (the render API) can import them.
/** A shade laid over the video, under the captions: a soft fade from one edge. */
export type VideoShade = { on: boolean; color: string; strength: number; height: number };
export type VideoLook = { brightness: number; contrast: number; saturation: number; hue: number };
export const DEFAULT_LOOK: VideoLook = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
/** The look as a CSS filter for the preview; FFmpeg draws the same math in the render (app/src/remotion/videoFilter.ts). */
export const lookFilter = (look?: VideoLook) => {
  const hue = look?.hue ?? 0;
  if (!look || (look.brightness === 100 && look.contrast === 100 && look.saturation === 100 && !hue)) return undefined;
  return `brightness(${look.brightness / 100}) contrast(${look.contrast / 100}) saturate(${look.saturation / 100})${hue ? ` hue-rotate(${hue}deg)` : ""}`;
};
/** One kept stretch of the source video, in source seconds. */
export type VideoSegment = { start: number; end: number };

/**
 * How the uploaded video sits in the output frame, and what is cut out of it. Every template draws
 * its video through SourceVideo, which reads this, so the preview and a full-frame render match.
 */
export type VideoFrameSettings = {
  /** fill: covers the frame (crops the overflow). fit: the whole video, with a backdrop around it. */
  fit: "fill" | "fit";
  /** Output shape, width / height; missing = the upload's own shape. */
  ratio?: number;
  /** 1 = as fitted; up to 4x. */
  zoom: number;
  /** Which part of the video shows, 0–100 on each axis (50 = center). */
  x: number;
  y: number;
  /** What fills the frame around a fitted video. */
  backdrop: "blur" | "color";
  backdropColor: string;
  flipX?: boolean;
  bottomShade: VideoShade;
  topShade: VideoShade;
  vignette: { on: boolean; strength: number };
  /** Color look of the footage, 100 = as shot: brightness, contrast, saturation (0-200). Done by FFmpeg in the render. */
  look?: VideoLook;
  /** Split points (source seconds) and the scenes removed, each named by its start time. */
  cuts: number[];
  removed: number[];
};

export const DEFAULT_VIDEO_FRAME: VideoFrameSettings = {
  fit: "fill",
  zoom: 1,
  x: 50,
  y: 50,
  backdrop: "blur",
  backdropColor: "#000000",
  bottomShade: { on: false, color: "#000000", strength: 70, height: 40 },
  topShade: { on: false, color: "#000000", strength: 50, height: 22 },
  vignette: { on: false, strength: 45 },
  look: DEFAULT_LOOK,
  cuts: [],
  removed: [],
};

/** What SourceVideo needs: the framing, plus the kept scenes when anything was cut. */
export type VideoFrameValue = VideoFrameSettings & { segments?: VideoSegment[] };
