import { Easing } from "remotion";
import { clamp, finite } from "../CaptionEngine/types";
import type { StackConfig, StackRoleName } from "./engine";

// Adobe-grade curves. Entrances attack immediately — no S-curve hesitation —
// and settle on a long soft tail, while every shared ease has zero velocity at
// its rest points so stacked motion layers never read as steps or cuts.
const entryEase = Easing.bezier(0.23, 1, 0.32, 1);
const fadeEase = (progress: number) => 1 - (1 - progress) * (1 - progress);


/** How much of a line stays visible with this many lines in front of it: 100, 62, 38, then a last 26%. */
const presence = (behind: number) =>
  1 - .38 * clamp(behind, 0, 1) - .24 * clamp(behind - 1, 0, 1) - .12 * clamp(behind - 2, 0, 1);

/**
 * Each new line lands from in front of the camera and pushes the older lines back through real
 * depth: they move away, tilt, soften and fade by exactly as much as it has landed. Everything is
 * driven by the landings alone, so the stack is perfectly still between them. A camera that kept
 * drifting re-rasterised the text on every frame, which read as shimmer.
 */
export const getReferenceCamera = ({
  now, lineStarts, pageEndMs, depth,
}: {
  now: number;
  lineStarts: number[];
  pageEndMs: number;
  depth: StackConfig["depth"];
}) => {
  const glideMs = clamp(finite(depth.recedeMs, 680), 340, 900);
  const recede = clamp(finite(depth.recedeZ, 150), 0, 320);
  const tilt = clamp(finite(depth.tilt, 6), 0, 16);
  const restBlur = clamp(finite(depth.restBlur, .7), 0, 2);
  const stepLift = clamp(finite(depth.pushPx, 3), 0, 12);
  const arriveZ = clamp(finite(depth.arriveZ, 170), 0, 320);
  const rise = clamp(finite(depth.risePx, 14), 0, 160);
  const arrivalBlur = clamp(finite(depth.arrivalBlur, 3), 0, 6);
  const glideOf = (start: number) => Math.max(1, Math.min(glideMs, Math.max(1, pageEndMs - start) * 0.85));
  const landed = lineStarts.map((start) => {
    const t = clamp((now - start) / glideOf(start), 0, 1);
    return now < start ? 0 : 1 - Math.pow(1 - t, 4);
  });
  const later = landed.slice(1);
  return {
    lift: later.length ? clamp(finite(depth.liftPx, 16), 0, 24) * later.reduce((sum, value) => sum + value, 0) / later.length : 0,
    lines: lineStarts.map((start, index) => {
      const arrival = landed[index];
      const remaining = 1 - arrival;
      const behind = landed.slice(index + 1).reduce((sum, value) => sum + value, 0);
      const fade = fadeEase(clamp((now - start) / (glideOf(start) * 0.3), 0, 1));
      return {
        arrival,
        opacity: now < start ? 0 : fade * presence(behind),
        z: arriveZ * remaining - recede * behind,
        tilt: tilt * Math.min(behind, 2),
        rise: rise * remaining,
        blur: arrivalBlur * remaining * remaining + restBlur * behind,
        lift: stepLift * behind,
      };
    }),
  };
};

export const getReferenceEntry = ({
  now,
  startMs,
  endMs,
  pageEndMs,
  glyphOffset,
  fps,
  size,
  unit,
  role,
  seed,
  lineSeed,
  motion,
  lineReveal = false,
  characterReveal = false,
}: {
  now: number;
  startMs: number;
  endMs: number;
  pageEndMs: number;
  glyphOffset: number;
  fps: number;
  size: number;
  unit: number;
  role: StackRoleName;
  seed: string;
  lineSeed: string;
  motion: StackConfig["motion"];
  /** Inside a depth stack the whole line carries the glide choreography. */
  lineReveal?: boolean;
  /** Letter cascades always animate; plain words may print directly. */
  characterReveal?: boolean;
}) => {
  // Inside depth-stacked lines: the whole line glides as a cohesive, intact unit.
  // Words never jump, bounce vertically or slide sideways to break the line's flow.
  if (lineReveal) {
    if (characterReveal) {
      const local = now - startMs - glyphOffset;
      if (local < 0) return null;
      const duration = Math.min(240, Math.max(90, (endMs - startMs) * 0.55));
      const progress = clamp(local / duration, 0, 1);
      return {
        opacity: fadeEase(progress),
        x: 0,
        y: 0,
        blur: 0,
        scale: 1,
      };
    }

    // Later words of a landing line appear as they are spoken, in place.
    const local = now - startMs;
    if (local < 0) return null;
    return {
      opacity: fadeEase(clamp((local + 1000 / fps) / 110, 0, 1)),
      x: 0,
      y: 0,
      blur: 0,
      scale: 1,
    };
  }

  // Fallback for single-line flat cues: smooth, cohesive rise without horizontal breakup
  const local = now - startMs - glyphOffset;
  if (local < 0) return null;
  if (startMs === 0 && motion.initialWordsVisible) {
    return { opacity: 1, x: 0, y: 0, blur: 0, scale: 1 };
  }

  const available = Math.max(
    0,
    Math.min(endMs, pageEndMs) - startMs - glyphOffset,
  );
  if (available <= 3000 / fps) {
    return { opacity: 1, x: 0, y: 0, blur: 0, scale: 1 };
  }

  const duration = Math.max(1, Math.min(motion.entryMs, available * 0.72));
  const progress = entryEase(clamp(local / duration, 0, 1));
  const remaining = 1 - progress;

  const fadeDuration = clamp(duration * 0.45, 90, 220);
  const opacity = fadeEase(clamp(local / fadeDuration, 0, 1));

  const distance = Math.min(size * 0.22, motion.rise * unit);
  const blur = Math.max(0, motion.blur * unit * Math.pow(remaining, 1.8));

  return {
    opacity,
    x: 0,
    y: distance * remaining,
    blur,
    scale: 1,
  };
};
