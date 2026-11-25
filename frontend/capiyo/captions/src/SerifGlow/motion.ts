const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const out = (value: number) => 1 - (1 - clamp01(value)) ** 3;

export const serifGlowMotion = (
  now: number, startMs: number, endMs: number, fadeMs: number, highlight: boolean, fps: number,
  continuousEntry = false, continuousExit = false,
) => {
  const age = now - startMs;
  // Back-to-back phrases simply change; blurring in each one reads as flicker.
  const entrance = continuousEntry ? 1 : out((age + 1000 / fps) / 180);
  const exit = clamp01((endMs - now) / Math.max(1, fadeMs));
  return {
    opacity: entrance * (continuousExit ? 1 : exit),
    blur: 0,
    scale: 1,
    y: (1 - entrance) * 2,
    bloom: 1,
  };
};
