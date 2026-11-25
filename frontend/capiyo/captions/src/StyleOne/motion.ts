import { Easing, interpolate } from "remotion";
import type { StyleOneConfig } from "./config";
import type { PlacedFragment } from "./layout";

export type EntryMotion = "rise" | "drop" | "left" | "right" | "still";

// A measured acceleration keeps the visible movement and defocus on screen.
// A steep ease-out had completed almost everything in the first two frames.
const entryEase = Easing.bezier(0.25, 0.1, 0.25, 1);
const fadeEase = Easing.bezier(0.33, 0, 0.67, 1);
// Source timestamps can fall between output frames. Count the frames a viewer
// can actually see, rather than mistaking 1.99 source frames for two samples.
const visibleFrames = (startFrame: number, endFrame: number) =>
  Math.max(0, Math.ceil(endFrame) - Math.ceil(startFrame));

// Share this budget with the exit and sheen so they cannot interrupt entry.
const entryFrames = (available: number, fps: number, timing: StyleOneConfig["timing"]) =>
  Math.max(1, Math.min(timing.revealMs * fps / 1000, available * 0.62));

/** Determine the dynamic slide motion for a token, ensuring smooth kinetic reveal. */
export const getStyleOneTokenMotion = ({
  role,
  tokenIndex,
  totalTokens,
  seed,
  randomize,
  pocketSide,
  pocketEdge,
}: {
  role: PlacedFragment["role"];
  tokenIndex: number;
  totalTokens: number;
  seed: string;
  randomize: boolean;
  pocketSide?: -1 | 1;
  pocketEdge?: PlacedFragment["pocketEdge"];
}): EntryMotion => {
  if (role === "hero") return "rise";
  // A fitted helper enters from its free edge; the renderer shares that motion
  // across the chunk, keeping normal spacing during the reveal and the hold.
  if (pocketEdge === "above") return "drop";
  if (pocketEdge === "below") return "rise";
  if (pocketEdge === "left") return "left";
  if (pocketEdge === "right") return "right";
  if (pocketSide === -1) return "drop";
  if (pocketSide === 1) return "rise";
  if (!randomize) return "rise";

  // Helper and soft words use slide reveals (left/right/rise, never drop from above)
  let hashVal = (pocketSide ?? 0) * 31;
  for (let i = 0; i < seed.length; i++) {
    hashVal = ((hashVal << 5) - hashVal + seed.charCodeAt(i) + tokenIndex * 13) | 0;
  }
  const norm = ((hashVal >>> 0) % 1000) / 1000;

  if (totalTokens > 1) {
    return norm < 0.5 ? "left" : norm < 0.8 ? "right" : "rise";
  }
  return norm < 0.6 ? "left" : "rise";
};

/** Source timestamps drive each word; entrances may overlap during fast speech. */
export const getStyleOneWordMotion = ({
  frame, startFrame, endFrame, fps, size, scale, role, motion, timing,
}: {
  frame: number; startFrame: number; endFrame: number; fps: number;
  size: number; scale: number; role: PlacedFragment["role"];
  motion: EntryMotion; timing: StyleOneConfig["timing"];
}) => {
  if (frame < startFrame) return { opacity: 0, x: 0, y: 0, blur: 0 };
  const available = endFrame - startFrame;
  // Very brief words print cleanly; don't spend their entire life animating.
  if (visibleFrames(startFrame, endFrame) <= 3) return { opacity: 1, x: 0, y: 0, blur: 0 };
  const revealFrames = entryFrames(available, fps, timing);
  const fadeFrames = Math.max(1, Math.min(timing.fadeMs * fps / 1000, revealFrames * 0.65));
  const progress = interpolate(frame, [startFrame, startFrame + revealFrames], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: entryEase,
  });
  const opacity = interpolate(frame, [startFrame, startFrame + fadeFrames], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: fadeEase,
  });
  const maximumTravel = (role === "hero" ? 28 : role === "plain" ? 20 : 16) * scale;
  const remaining = Math.min(size * timing.travel, maximumTravel) * (1 - progress);
  return {
    opacity,
    x: motion === "left" ? -remaining : motion === "right" ? remaining : 0,
    y: motion === "rise" ? remaining : motion === "drop" ? -remaining * 0.7 : 0,
    // Fade in quickly enough to actually see the softness, then resolve focus
    // over the full slide. Do not accelerate the blur away a second time.
    blur: role === "hero" && motion === "still" ? 0 : timing.blur * scale * (motion === "still" ? 0.65 : 1) * (1 - progress),
  };
};

/** Leave enough time for the final word to settle before the whole phrase fades. */
export const getStyleOneExit = ({ frame, endFrame, lastStartFrame, fps, timing }: {
  frame: number; endFrame: number; lastStartFrame: number; fps: number;
  timing: StyleOneConfig["timing"];
}) => {
  const available = Math.max(0, endFrame - lastStartFrame);
  if (visibleFrames(lastStartFrame, endFrame) <= 3) return 0;
  const settleFrames = entryFrames(available, fps, timing);
  const holdFrames = Math.min(fps * 0.14, available * 0.18);
  const start = Math.min(endFrame, Math.max(endFrame - timing.exitMs * fps / 1000,
    lastStartFrame + settleFrames + holdFrames));
  if (start >= endFrame) return 0;
  return interpolate(frame, [start, endFrame], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: fadeEase,
  });
};

/** Conservative bound shared with layout so the animated word fits its space. */
export const getInlineAccentMaxScale = (settings: StyleOneConfig["inlineAccent"]) =>
  settings.enabled ? 1 + settings.pulse : 1;

/** Optional gentle emphasis; the shared entrance handles the actual reveal. */
export const getInlineAccentMotion = (frame: number, startFrame: number, endFrame: number,
  fps: number, settings: StyleOneConfig["inlineAccent"], canvasScale: number) => {
  const duration = Math.max(1, Math.min(settings.durationMs * fps / 1000, (endFrame - startFrame) * 0.62));
  const t = Math.max(0, Math.min(1, (frame - startFrame) / duration));
  if (!settings.enabled || (settings.pulse === 0 && settings.jiggle === 0)
      || visibleFrames(startFrame, endFrame) <= 1 || t >= 1) {
    return { scale: 1, rotation: 0, x: 0 };
  }
  const envelope = Math.sin(Math.PI * t) * (1 - t);
  return {
    scale: 1 + settings.pulse * envelope,
    rotation: settings.jiggle * envelope,
    x: settings.jiggle * canvasScale * envelope,
  };
};

/** A single pass after entry; very short words skip shine instead of flashing. */
export const getHeroShine = (frame: number, startFrame: number, endFrame: number, fps: number,
  timing: StyleOneConfig["timing"], settings: StyleOneConfig["shine"]) => {
  const available = endFrame - startFrame;
  const entry = entryFrames(available, fps, timing);
  const start = startFrame + entry + settings.delayMs * fps / 1000;
  const remaining = endFrame - timing.exitMs * fps / 1000 - start;
  const duration = Math.min(settings.durationMs * fps / 1000, remaining);
  const progress = duration > 0 ? (frame - start) / duration : -1;
  const active = settings.enabled && duration >= fps * 0.22 && progress > 0 && progress < 1;
  const intro = Math.max(0, Math.min(1, (frame - startFrame) / Math.max(1, entry)));
  return {
    progress: Math.max(0, Math.min(1, progress)),
    opacity: active ? settings.strength * Math.sin(Math.PI * progress) : 0,
    glow: settings.enabled && frame >= startFrame && visibleFrames(startFrame, endFrame) > 1
      ? settings.glowOpacity * Math.sin(Math.PI * intro) * (1 - intro) : 0,
  };
};
