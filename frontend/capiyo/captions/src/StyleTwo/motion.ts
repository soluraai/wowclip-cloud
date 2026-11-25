import { clamp } from "../CaptionEngine/types";
import type { StyleTwoAppearance } from "./config";

/** Word entries adapt to short speech beats and finish exactly at rest. */
export const getStyleTwoWordMotion = (
  frame: number,
  startFrame: number,
  endFrame: number,
  fps: number,
  motion: StyleTwoAppearance["motion"],
  highlighted: boolean,
  unit = 1,
) => {
  if (frame < startFrame || frame >= endFrame)
    return { opacity: 0, y: 0, scale: 1, rotation: 0 };
  const available = Math.max(1, endFrame - startFrame);
  const entryFrames = Math.min(
    (motion.entryMs * fps) / 1000,
    Math.max(1, available * 0.65),
  );
  const fadeFrames = Math.min(
    (motion.fadeMs * fps) / 1000,
    Math.max(1, available * 0.22),
  );
  const progress = clamp(
    (frame - startFrame + 1) / Math.max(1, entryFrames),
    0,
    1,
  );
  const fade = clamp((frame - startFrame + 1) / Math.max(1, fadeFrames), 0, 1),
    remaining = 1 - progress;
  return {
    opacity: fade * fade * (3 - 2 * fade),
    y: motion.travel * unit * remaining ** 3 * (highlighted ? 0.4 : 1),
    scale: highlighted
      ? 1 -
        motion.pop * remaining ** 3 +
        motion.pop * 0.8 * Math.sin(Math.PI * progress) * remaining
      : 1,
    rotation:
      highlighted && remaining > 0
        ? motion.jiggleDegrees * Math.sin(progress * Math.PI * 2) * remaining
        : 0,
  };
};
export const getStyleTwoExit = (
  frame: number,
  lastWordStart: number,
  endFrame: number,
  fps: number,
  exitMs: number,
) => {
  const available = endFrame - lastWordStart;
  if (available <= 2 || exitMs <= 0) return 0;
  const duration = Math.min((exitMs * fps) / 1000, available * 0.25);
  const progress = clamp(
    (frame - (endFrame - duration)) / Math.max(1, duration),
    0,
    1,
  );
  return progress * progress;
};
