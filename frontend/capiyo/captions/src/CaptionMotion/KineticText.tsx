import { useId } from "react";
import type { SVGProps } from "react";
import { kineticDuration, kineticPhase, type GlyphSlice, type KineticEntry } from "./kinetic";

type Props = {
  text: string; x: number; baseline: number; size: number;
  elapsed: number; available: number; duration: number; fps: number;
  entry: KineticEntry; slices?: GlyphSlice[]; textProps: SVGProps<SVGTextElement>;
};

/** Each slice paints the original word, preserving kerning and ligatures. */
export const KineticText = ({ text, x, baseline, size, elapsed, available, duration: requested,
  fps, entry, slices = [], textProps }: Props) => {
  const id = useId().replace(/:/g, "");
  const duration = kineticDuration(available, requested, fps, entry.pace);
  if (elapsed < 0) return null;
  if (!duration || elapsed >= duration) return <text {...textProps} x={x} y={baseline}>{text}</text>;
  const phase = kineticPhase(elapsed, duration);
  // Full-word kinetic slide: word-level slide offset with dynamic motion blur.
  // Never split into letter-by-letter slices, ensuring smooth cinematic entry.
  const slideX = entry.x || (entry.kind === "letters" ? (entry.reverse ? -1 : 1) * Math.min(14, size * 0.2) : 0);
  const slideY = entry.y || (entry.kind === "letters" ? 0 : Math.min(10, size * 0.15));
  const dx = slideX * phase.remaining;
  const dy = slideY * phase.remaining;
  const clipped = entry.kind === "wipe";
  // The wipe's edge is soft, so a frame caught mid-reveal never shows a letter cut in half.
  const feather = size * .4;
  const width = Math.max(.01, entry.right - entry.left + feather);
  const front = entry.reverse
    ? x + entry.right - width * phase.progress + feather / 2
    : x + entry.left + width * phase.progress - feather;
  const clip = `${id}-wipe`;
  const blurPx = (Math.max(2.4, entry.blur) * phase.remaining).toFixed(3);

  return <g data-entry={entry.kind} opacity={phase.opacity} transform={`translate(${dx} ${dy})`}>
    {clipped && <defs>
      <linearGradient id={`${clip}-edge`} gradientUnits="userSpaceOnUse" x1={front} x2={front + feather} y1="0" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity={entry.reverse ? 0 : 1} />
        <stop offset="1" stopColor="#fff" stopOpacity={entry.reverse ? 1 : 0} />
      </linearGradient>
      <mask id={clip} maskUnits="userSpaceOnUse" x={x + entry.left - feather} y={baseline - size * 1.7} width={width + feather * 2} height={size * 2.5}>
        <rect x={x + entry.left - feather} y={baseline - size * 1.7} width={width + feather * 2} height={size * 2.5} fill={`url(#${clip}-edge)`} />
      </mask>
    </defs>}
    <g mask={clipped ? `url(#${clip})` : undefined}>
      <text {...textProps} x={x} y={baseline} style={{ ...textProps.style,
        filter: `blur(${blurPx}px)` }}>{text}</text>
    </g>
  </g>;
};
