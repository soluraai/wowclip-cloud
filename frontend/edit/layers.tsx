import React, { useMemo } from "react";
import { AbsoluteFill, Easing, Img, Loop, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneView } from "./scenes/SceneView";
import { resolveSceneInWindow } from "./scenes/timeline";
import { resolveTheme } from "./scenes/types";
import type { Scene } from "./scenes/types";
import type { Stage } from "./scenes/layout";
import type { EditMedia, EditTransition } from "./types";

// The layers an insert is drawn with. Each one gets its own Sequence, so frame 0 here is the first frame of the insert.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// A graphic that fills the reel keeps clear of the caption band (the captions sit around 70% of the height), and the
// top half of a split screen keeps clear of the platform header. Geometry belongs here, never to the model.
export const FULL_STAGE: Stage = { width: 1080, height: 1920, top: 210, bottom: 650, left: 72, right: 110 };
export const TOP_STAGE: Stage = { width: 1080, height: 960, top: 150, bottom: 64, left: 72, right: 110 };

// Near-black with a faint lift behind the content: the graphic is the only lit thing in the frame.
export const STAGE_BACKGROUND = "radial-gradient(ellipse 92% 62% at 48% 34%, #151B27 0%, #0B0E15 58%, #06080C 100%)";

const focusOf = (media: EditMedia) =>
  `${Math.round((media.focusX ?? 0.5) * 100)}% ${Math.round((media.focusY ?? 0.42) * 100)}%`;

/** Ken Burns: the picture is never still, so a photo reads as footage. */
const driftOf = (motion: string | undefined, progress: number) => {
  if (motion === "out") return { scale: 1.13 - 0.11 * progress, x: 0 };
  if (motion === "left") return { scale: 1.12, x: 3 - 6 * progress };
  if (motion === "right") return { scale: 1.12, x: -3 + 6 * progress };
  if (motion === "settle") return { scale: 1 + 0.04 * progress, x: 0 };
  return { scale: 1.02 + 0.11 * progress, x: 0 };
};

export const MediaFill: React.FC<{ media: EditMedia; frames: number; motion?: string; rendering: boolean; fit?: "cover" | "contain" }> = ({
  media,
  frames,
  motion,
  rendering,
  fit = "cover",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, frames)], [0, 1], clamp);
  const drift = media.kind === "image" ? driftOf(motion, progress) : { scale: 1 + 0.04 * progress, x: 0 };
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    objectPosition: focusOf(media),
    transform: `translateX(${drift.x}%) scale(${drift.scale})`,
  };
  if (media.kind === "video") {
    const clipFrames = media.duration ? Math.max(1, Math.floor(media.duration * fps)) : 0;
    const video = <OffthreadVideo src={media.src} muted style={style} pauseWhenBuffering={!rendering} />;
    return clipFrames && clipFrames < frames ? <Loop durationInFrames={clipFrames}>{video}</Loop> : video;
  }
  return <Img src={media.src} style={style} />;
};

/** A landscape picture in a portrait frame: shown whole over a soft, dark copy of itself instead of cropped. */
const isWide = (media: EditMedia) => media.width > 0 && media.height > 0 && media.width / media.height > 1.05;

export const FullMedia: React.FC<{ media: EditMedia; frames: number; motion?: string; rendering: boolean }> = ({ media, frames, motion, rendering }) => {
  if (!isWide(media)) return <MediaFill media={media} frames={frames} motion={motion} rendering={rendering} />;
  return (
    <AbsoluteFill style={{ background: "#05070A" }}>
      <AbsoluteFill style={{ filter: "blur(42px) brightness(0.42) saturate(1.1)", transform: "scale(1.25)" }}>
        <MediaFill media={media} frames={frames} motion="in" rendering={rendering} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center" }}>
        <div style={{ width: "100%", aspectRatio: `${media.width} / ${media.height}`, overflow: "hidden" }}>
          <MediaFill media={media} frames={frames} motion={motion} rendering={rendering} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** How an insert arrives and leaves. Frame 0 is the insert's first frame. */
export const transitionStyle = (enter: EditTransition | undefined, exit: EditTransition | undefined, frame: number, frames: number): React.CSSProperties => {
  let opacity = 1;
  let scale = 1;
  let x = 0;
  let blur = 0;
  if (enter === "zoom") {
    const t = interpolate(frame, [0, 7], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    scale *= 1.22 - 0.22 * t;
    blur += (1 - t) * 14;
    opacity *= 0.35 + 0.65 * t;
  } else if (enter === "slide") {
    const t = interpolate(frame, [0, 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    x += (1 - t) * 100;
    blur += (1 - t) * 10;
  } else if (enter === "fade") {
    opacity *= interpolate(frame, [0, 8], [0, 1], clamp);
  }
  const left = frames - frame;
  if (exit === "fade") {
    opacity *= interpolate(left, [0, 7], [0, 1], clamp);
  } else if (exit === "zoom") {
    const t = interpolate(left, [0, 6], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
    scale *= 1 + 0.14 * t;
    opacity *= 1 - t;
    blur += t * 10;
  } else if (exit === "slide") {
    const t = interpolate(left, [0, 7], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
    x -= t * 100;
    blur += t * 8;
  }
  return {
    opacity,
    transform: `translateX(${x}%) scale(${scale})`,
    filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined,
  };
};

/** A white flash on the cut, for the few punchy moments the director marks. */
export const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 5], [0.85, 0], clamp);
  return opacity > 0 ? <AbsoluteFill style={{ background: "#FFFFFF", opacity, pointerEvents: "none" }} /> : null;
};

/** One Story scene drawn into a stage: the whole reel, or the top half of a split screen. */
export const SceneStage: React.FC<{ scene: Scene; frames: number; stage: Stage; accent: string }> = ({ scene, frames, stage, accent }) => {
  const { fps } = useVideoConfig();
  const key = JSON.stringify(scene);
  const resolved = useMemo(() => resolveSceneInWindow(scene, fps, frames), [key, fps, frames]); // eslint-disable-line react-hooks/exhaustive-deps
  const theme = resolveTheme({ mode: "dark", accent });
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: stage.width, height: stage.height, overflow: "hidden", background: STAGE_BACKGROUND }}>
      {resolved ? <SceneView resolved={resolved} theme={theme} stage={stage} /> : null}
    </div>
  );
};

/** How tall the band above the speaker is while a photo card is up (the speaker slides down by this much). */
export const CARD_BAND = 640;
const CARD_TOP = 92;
const CARD_MAX_WIDTH = 940;
const CARD_MAX_HEIGHT = 470;

/** A photo card: the speaker slides down and the picture lands in the band above their head, never over the face. */
export const CardBand: React.FC<{ media: EditMedia; frames: number; amount: number; rendering: boolean }> = ({ media, frames, amount, rendering }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const aspect = media.width > 0 && media.height > 0 ? media.width / media.height : 1;
  let height = CARD_MAX_HEIGHT;
  let width = height * aspect;
  if (width > CARD_MAX_WIDTH) {
    width = CARD_MAX_WIDTH;
    height = width / aspect;
  }
  const land = spring({ frame: frame - 2, fps, config: { damping: 16, mass: 0.7, stiffness: 150 } });
  const leave = interpolate(frames - frame, [0, 7], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: CARD_BAND, overflow: "hidden", background: "#05070A",
      boxShadow: "0 10px 36px rgba(0,0,0,0.65)", transform: `translateY(${(-(1 - amount) * CARD_BAND).toFixed(1)}px)` }}>
      <AbsoluteFill style={{ filter: "blur(38px) brightness(0.26) saturate(1.15)", transform: "scale(1.3)" }}>
        <MediaFill media={media} frames={frames} motion="in" rendering={rendering} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: (1080 - width) / 2, top: CARD_TOP + (CARD_MAX_HEIGHT - height) / 2, width, height,
        borderRadius: 26, overflow: "hidden", boxShadow: "0 22px 60px rgba(0,0,0,0.55)",
        transform: `scale(${(0.84 + 0.16 * land) * (1 - 0.08 * leave)}) rotate(${((1 - land) * -3).toFixed(2)}deg)`,
        opacity: Math.min(1, land * 1.5) * (1 - leave) }}>
        <MediaFill media={media} frames={frames} motion="settle" rendering={rendering} />
      </div>
    </div>
  );
};
