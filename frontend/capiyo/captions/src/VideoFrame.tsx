import React, { createContext, useContext } from "react";
import { AbsoluteFill } from "remotion";

import { DEFAULT_LOOK, DEFAULT_VIDEO_FRAME, lookFilter, type VideoFrameSettings, type VideoFrameValue, type VideoLook, type VideoSegment, type VideoShade } from "./VideoFrameSettings";
export * from "./VideoFrameSettings";

export const VideoFrameContext = createContext<VideoFrameValue | null>(null);
export const useVideoFrame = () => useContext(VideoFrameContext);

const rgba = (hex: string, alpha: number) => {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "000000";
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
};

/** An eased fade (dense at the edge, gone at `height`), so the shade never shows a hard line. */
const fade = (shade: VideoShade, toward: "top" | "bottom") => {
  const a = shade.strength / 100;
  const stops = [[1, 0], [0.82, 18], [0.6, 36], [0.36, 56], [0.16, 76], [0.05, 90], [0, 100]]
    .map(([k, at]) => `${rgba(shade.color, a * k)} ${at}%`).join(", ");
  return `linear-gradient(to ${toward}, ${stops})`;
};

/**
 * The shades run this far past the frame on every side (the frame clips them). The editor draws the frame scaled
 * down, where the video and a shade ending on the same edge can round to different pixels: a thin strip of
 * unshaded video then shows along the border.
 */
const BLEED = 12;

/** Bottom and top shades and the vignette, over the video and under the captions. */
export const VideoShades: React.FC<{ frame: VideoFrameSettings }> = ({ frame }) => {
  const { bottomShade: bottom, topShade: top, vignette } = frame;
  if (!(bottom.on && bottom.strength > 0) && !(top.on && top.strength > 0) && !(vignette.on && vignette.strength > 0)) return null;
  return <AbsoluteFill style={{ pointerEvents: "none" }} data-video-shade>
    {bottom.on && bottom.strength > 0 && <div style={{ position: "absolute", left: -BLEED, right: -BLEED, bottom: -BLEED,
      height: `calc(${bottom.height}% + ${BLEED}px)`, background: fade(bottom, "top") }} />}
    {top.on && top.strength > 0 && <div style={{ position: "absolute", left: -BLEED, right: -BLEED, top: -BLEED,
      height: `calc(${top.height}% + ${BLEED}px)`, background: fade(top, "bottom") }} />}
    {vignette.on && vignette.strength > 0 && <div style={{ position: "absolute", inset: -BLEED,
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${(vignette.strength / 100 * 0.55).toFixed(3)}) 78%, rgba(0,0,0,${(vignette.strength / 100 * 0.9).toFixed(3)}) 100%)` }} />}
  </AbsoluteFill>;
};
