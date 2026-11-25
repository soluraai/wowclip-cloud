const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => {
  const p = clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

export const EDITORIAL_POP_LIFT = 0.035;

/** A brief arrival accent, a readable spoken hold, then a smooth return to quiet type. */
export function editorialWordMotion({ now, startMs, endMs, nextStartMs = Infinity,
  emphasisScale = 1.12, quietScale = 0.96, reducedMotion = false,
}: {
  now: number; startMs: number; endMs: number; nextStartMs?: number;
  emphasisScale?: number; quietScale?: number; reducedMotion?: boolean;
}) {
  if (reducedMotion) return { scale: 1, strength: 0 };
  const elapsed = now - startMs;
  if (elapsed < 0) return { scale: quietScale, strength: 0 };
  const duration = Math.max(1, endMs - startMs);
  const warmMs = clamp(duration * 0.45, 24, 95);
  const warm = 1 - (1 - clamp(elapsed / warmMs, 0, 1)) ** 3;
  const releaseAt = Math.min(endMs, nextStartMs);
  const strength = warm * (1 - smooth((now - releaseAt) / 170));
  const kick = Math.sin(Math.PI * clamp(elapsed / clamp(duration * 0.75, 120, 240), 0, 1));
  return {
    scale: quietScale + (emphasisScale - quietScale) * strength + EDITORIAL_POP_LIFT * kick * strength,
    strength,
  };
}

/** The painted widths and the widths used to center a row must be identical. */
export function editorialRowFlow(items: {
  width: number; scale: number; presence: number; started: boolean;
}[], gap: number, centerX: number) {
  const flow = items.map((item, index) => items.slice(index + 1).some(next => next.started) ? 1 : item.presence);
  const widths = items.map((item, index) => item.width * flow[index]);
  const gaps = items.map((item, index) => index === 0 ? 0
    : gap * (items[index - 1].scale + item.scale) / 2 * item.presence);
  const width = widths.reduce((sum, current, index) => sum + current + gaps[index], 0);
  let left = centerX - width / 2;
  return {
    width,
    words: items.map((_, index) => {
      left += gaps[index];
      const word = { left, width: widths[index], flow: flow[index] };
      left += widths[index];
      return word;
    }),
  };
}
