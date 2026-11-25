import {
  asRecord,
  bounded,
  resolveStyleTwoAppearance,
} from "../StyleTwo/config";
import defaults from "./style-three.config.json";
export { asRecord, bounded } from "../StyleTwo/config";

const color = (input: unknown, fallback: string) =>
  typeof input === "string" && /^#[\da-f]{6}$/i.test(input) ? input : fallback;

export const resolveStyleThreeAppearance = (input: unknown = defaults) => {
  const root = asRecord(input),
    layout = asRecord(root.layout);
  const colors = asRecord(root.colors),
    motion = asRecord(root.motion);
  const shared = resolveStyleTwoAppearance({
    ...defaults,
    ...root,
    fonts: {
      body: { ...defaults.fonts.body, ...asRecord(asRecord(root.fonts).body) },
      highlight: {
        ...defaults.fonts.highlight,
        ...asRecord(asRecord(root.fonts).highlight),
      },
    },
    layout: { ...defaults.layout, ...layout },
    glow: { ...defaults.glow, ...asRecord(root.glow) },
    motion: { ...defaults.motion, ...motion },
  });
  const stops = Array.isArray(colors.stops)
    ? colors.stops
        .slice(0, 12)
        .map((stop) => {
          const value = asRecord(stop);
          return {
            offset: bounded(value.offset, 0, 0, 1),
            color: color(value.color, "#faf830"),
          };
        })
        .sort((a, b) => a.offset - b.offset)
    : defaults.colors.stops;
  return {
    fonts: shared.fonts,
    layout: {
      ...shared.layout,
      scriptScale: bounded(
        layout.scriptScale,
        defaults.layout.scriptScale,
        0.6,
        1.6,
      ),
      lineGap: bounded(layout.lineGap, defaults.layout.lineGap, 0, 80),
      scriptOffsetY: bounded(
        layout.scriptOffsetY,
        defaults.layout.scriptOffsetY,
        -40,
        40,
      ),
      primaryTracking: bounded(
        layout.primaryTracking,
        defaults.layout.primaryTracking,
        0,
        8,
      ),
      scriptTracking: bounded(
        layout.scriptTracking,
        defaults.layout.scriptTracking,
        0,
        4,
      ),
    },
    colors: {
      script: color(colors.script, defaults.colors.script),
      glow: color(colors.glow, defaults.colors.glow),
      angle: bounded(colors.angle, defaults.colors.angle, 0, 360),
      gradientLevel:
        colors.gradientLevel === "line" ? ("line" as const) : ("word" as const),
      stops: stops.length >= 2 ? stops : defaults.colors.stops,
    },
    glow: shared.glow,
    motion: {
      ...shared.motion,
      blur: bounded(motion.blur, defaults.motion.blur, 0, 6),
      shineMs: bounded(motion.shineMs, defaults.motion.shineMs, 100, 1200),
      shineOpacity: bounded(
        motion.shineOpacity,
        defaults.motion.shineOpacity,
        0,
        0.6,
      ),
    },
  };
};
export type StyleThreeAppearance = ReturnType<
  typeof resolveStyleThreeAppearance
>;
