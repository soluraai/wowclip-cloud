import React from "react";
import { clamp } from "../CaptionEngine/types";
import type { FlowDecoration } from "./decorations";
import type { FlowInk } from "./layout";
import type { FlowSettings } from "./types";

export const FlowPaint: React.FC<{ decoration: FlowDecoration; accent: string; unit: number }> = ({ decoration, accent, unit }) => {
  const { x, y, width: w, height: h, progress, effect } = decoration;
  if (progress <= 0) return null;
  const style = { fill: "none", stroke: accent, strokeWidth: 1.8 * unit, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - progress };
  if (effect === "marker") return <g clipPath={`url(#${decoration.id})`}>
    <path d={`M ${x} ${y + 2 * unit} L ${x + w} ${y} L ${x + w - 1.5 * unit} ${y + h - unit} L ${x + 1.5 * unit} ${y + h} Z`} fill={accent} opacity={0.95} />
    <path d={`M ${x} ${y + h - 2 * unit} L ${x + w} ${y + h - 3 * unit}`} stroke={accent} strokeWidth={3 * unit} opacity={0.3} />
  </g>;
  if (effect === "circle") return <path {...style} d={`M ${x + w * 0.25} ${y + h * 0.05} C ${x + w * 0.7} ${y - unit}, ${x + w} ${y + h * 0.05}, ${x + w} ${y + h * 0.5} C ${x + w} ${y + h}, ${x + w * 0.2} ${y + h}, ${x + w * 0.06} ${y + h * 0.8} C ${x - unit} ${y + h * 0.6}, ${x} ${y + h * 0.08}, ${x + w * 0.72} ${y + h * 0.08}`} />;
  if (effect === "bracket") {
    const c = Math.min(w * 0.16, 15 * unit);
    return <g>{[
      `M ${x + c} ${y} H ${x} V ${y + h * 0.38}`,
      `M ${x + w - c} ${y} H ${x + w} V ${y + h * 0.38}`,
      `M ${x} ${y + h * 0.62} V ${y + h} H ${x + c}`,
      `M ${x + w} ${y + h * 0.62} V ${y + h} H ${x + w - c}`,
    ].map((d, index) => <path key={index} {...style} d={d} />)}</g>;
  }
  if (effect === "box") return <rect x={x} y={y} width={w} height={h} rx={2 * unit} {...style} />;
  if (effect === "strike") return <path {...style} opacity={0.88} d={`M ${x} ${y + h * 0.62} Q ${x + w * 0.48} ${y + h * 0.48} ${x + w} ${y + h * 0.42}`} />;
  return <g>
    <path {...style} d={`M ${x} ${y + h - 4 * unit} Q ${x + w * 0.55} ${y + h - unit} ${x + w} ${y + h - 5 * unit}`} />
    <path {...style} strokeWidth={0.8 * unit} opacity={0.5} d={`M ${x + w * 0.22} ${y + h - unit} L ${x + w * 0.93} ${y + h - 2 * unit}`} />
    {progress < 1 && <circle cx={x + w * progress} cy={y + h - 4 * unit} r={1.8 * unit} fill={accent} opacity={Math.sin(progress * Math.PI)} />}
  </g>;
};

export const FlowMetricDetails: React.FC<{ word: FlowInk; count: number; settings: FlowSettings; unit: number }> = ({ word, count, settings, unit }) => {
  if (!word.metric || !word.token.number) return null;
  const { metric } = word, x = word.x, y = word.baseline;
  if (metric.kind === "percentage" && word.token.number.value >= 0 && word.token.number.value <= 100) {
    const fraction = clamp(word.token.number.value / 100, 0, 1) * count;
    const ticks = 20, spacing = word.width / ticks, segment = Math.max(1, spacing - 2 * unit);
    return <g data-flow-detail="percentage" opacity={count}>
      {Array.from({ length: ticks }, (_, i) => <g key={i}>
        <rect x={x + i * spacing} y={y + word.descent + 6 * unit} width={segment} height={3 * unit} rx={0.8 * unit} fill={settings.accent} opacity={0.16} />
        <rect x={x + i * spacing} y={y + word.descent + 6 * unit} width={segment * clamp(fraction * ticks - i, 0, 1)}
          height={3 * unit} rx={0.8 * unit} fill={settings.accent} opacity={0.95} />
      </g>)}
    </g>;
  }
  if (metric.suffixRows.length) {
    const split = x + metric.prefixWidth + (word.token.number.prefix ? metric.affixGap : 0) + metric.valueWidth + metric.affixGap * 0.45;
    return <path data-flow-detail="unit-rule" d={`M ${split} ${y - word.ascent * 0.78} V ${y - word.ascent * 0.2}`}
      fill="none" stroke={settings.accent} strokeWidth={unit} opacity={0.32 * count} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - count} />;
  }
  const c = 10 * unit;
  return <path data-flow-detail="counter-corners" d={`M ${x - 5 * unit + c} ${y - word.ascent} H ${x - 5 * unit} V ${y - word.ascent + c} M ${x + word.width + 5 * unit - c} ${y} H ${x + word.width + 5 * unit} V ${y - c}`}
    stroke={settings.accent} strokeWidth={1.4 * unit} fill="none" opacity={0.5 * count} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - count} />;
};

export const FlowAccentBeat: React.FC<{ x: number; y: number; elapsed: number; accent: string; unit: number }> = ({ x, y, elapsed, accent, unit }) => {
  const p = clamp(elapsed / 420, 0, 1);
  if (p <= 0 || p >= 1) return null;
  const radius = (3 + p * 6) * unit, opacity = Math.sin(p * Math.PI) ** 2 * 0.8;
  return <g transform={`translate(${x} ${y})`} stroke={accent} strokeWidth={1.2 * unit} strokeLinecap="round" opacity={opacity}>
    {[0, 90, 180, 270].map((angle) => <line key={angle} x1={radius * 0.45} x2={radius} y1={0} y2={0} transform={`rotate(${angle})`} />)}
  </g>;
};
