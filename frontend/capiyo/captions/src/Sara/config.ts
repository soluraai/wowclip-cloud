import { clamp, finite, safeColor } from "../LaunchCaptionPack/presets";
import type { SaraConfig } from "./types";

export const SARA_DEFAULTS: SaraConfig = {
  fontSize: 62, minFontSize: 42, maxWords: 5, maxCharacters: 38,
  maxDurationMs: 2200, pauseMs: 340, lingerMs: 320,
  positionY: .76, maxWidth: .82, color: "#ffffff", glow: .85, shadow: .65,
  reducedMotion: false,
};
export const resolveSaraConfig = (input: Partial<SaraConfig> = {}): SaraConfig => {
  const d = SARA_DEFAULTS;
  const fontSize = clamp(finite(input.fontSize, d.fontSize), 24, 150);
  return { ...d, fontSize, minFontSize: clamp(finite(input.minFontSize, d.minFontSize), 18, fontSize),
    maxWords: Math.round(clamp(finite(input.maxWords, d.maxWords), 1, 12)),
    maxCharacters: Math.round(clamp(finite(input.maxCharacters, d.maxCharacters), 12, 120)),
    maxDurationMs: clamp(finite(input.maxDurationMs, d.maxDurationMs), 300, 6000),
    pauseMs: clamp(finite(input.pauseMs, d.pauseMs), 50, 1500),
    lingerMs: clamp(finite(input.lingerMs, d.lingerMs), 0, 1000),
    positionY: clamp(finite(input.positionY, d.positionY), .15, .82),
    maxWidth: clamp(finite(input.maxWidth, d.maxWidth), .35, .9),
    color: safeColor(input.color, d.color), glow: clamp(finite(input.glow, d.glow), 0, 2),
    shadow: clamp(finite(input.shadow, d.shadow), 0, 1), reducedMotion: input.reducedMotion ?? d.reducedMotion };
};
