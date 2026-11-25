import React from "react";
import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";

/** A gradient picked in the panel: stops at 0-100 along a CSS angle (90 runs left to right). */
export type Paint = { stops: { color: string; position: number }[]; angle: number };

/** The key word's gradient, when one was picked instead of a solid color. */
export const keyGradient = (config?: BasicCaptionPresentation): Paint | undefined => {
  const e = config?.emphasis;
  return e?.colorMode === "gradient" && e.mode !== "fill" && (e.gradientStops?.length ?? 0) >= 2
    ? { stops: e.gradientStops!, angle: e.gradientAngle ?? 90 } : undefined;
};

/** The normal text's gradient, when one was picked for the text color. */
export const textGradient = (config?: BasicCaptionPresentation): Paint | undefined =>
  config?.gradient && config.gradient.stops.length >= 2 ? config.gradient : undefined;

/** The accent's gradient (wipe, reply line, box), and whether it runs per word or across the whole line. */
export const accentGradient = (config?: BasicCaptionPresentation): (Paint & { scope: "word" | "line" }) | undefined => {
  const h = config?.highlights as undefined | { colorMode?: string; gradientStops?: Paint["stops"]; gradientAngle?: number; gradientSpan?: string };
  return h?.colorMode === "gradient" && (h.gradientStops?.length ?? 0) >= 2
    ? { stops: h.gradientStops!, angle: h.gradientAngle ?? 90, scope: h.gradientSpan === "line" ? "line" : "word" } : undefined;
};

/** An SVG gradient at the CSS angle. It spans each element it fills, or the given box when there is one. */
export const SvgPaint: React.FC<{ id: string; paint: Paint; box?: { x: number; y: number; width: number; height: number } }> = ({ id, paint, box }) => {
  const r = paint.angle * Math.PI / 180, dx = Math.sin(r) / 2, dy = -Math.cos(r) / 2;
  const at = (u: number, v: number) => box ? [box.x + u * box.width, box.y + v * box.height] : [u, v];
  const [x1, y1] = at(.5 - dx, .5 - dy), [x2, y2] = at(.5 + dx, .5 + dy);
  return <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits={box ? "userSpaceOnUse" : "objectBoundingBox"}>
    {[...paint.stops].sort((a, b) => a.position - b.position).map((stop, i) =>
      <stop key={i} offset={Math.max(0, Math.min(1, stop.position / 100))} stopColor={stop.color} />)}
  </linearGradient>;
};

/** The first color of a gradient, for glows and strokes that take one color. */
export const leadColor = (paint: Paint) => [...paint.stops].sort((a, b) => a.position - b.position)[0].color;
