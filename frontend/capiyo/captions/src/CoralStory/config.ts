import { clamp, finite, safeColor } from "../LaunchCaptionPack/presets";
import type { CoralConfig } from "./types";

export const CORAL_DEFAULTS: CoralConfig = {
  // Portrait-friendly type: 42px on the standard 720px-wide canvas.
  fontSize: 112, minFontSize: 86, fontWeight: 700,
  ink: "#000000", paper: "#fff5e3", coral: "#f64f46",
  positionY: 0.68, maxWidth: 0.7, maxWords: 3, maxCharacters: 24,
  maxDurationMs: 1800, pauseMs: 340, lingerMs: 220,
  automaticBeats: "balanced", beatCooldownMs: 4200,
  soundEnabled: true, soundVolume: 0.12, reducedMotion: false,
};

export const resolveCoralConfig = (input: Partial<CoralConfig> = {}): CoralConfig => {
  const d = CORAL_DEFAULTS;
  const fontSize = clamp(finite(input.fontSize, d.fontSize), 44, 160);
  return { ...d, fontSize, minFontSize: clamp(finite(input.minFontSize, d.minFontSize), 32, fontSize),
    fontWeight: clamp(finite(input.fontWeight, d.fontWeight), 100, 900),
    ink: safeColor(input.ink, d.ink), paper: safeColor(input.paper, d.paper), coral: safeColor(input.coral, d.coral),
    positionY: clamp(finite(input.positionY, d.positionY), .15, .83), maxWidth: clamp(finite(input.maxWidth, d.maxWidth), .35, .9),
    maxWords: Math.round(clamp(finite(input.maxWords, d.maxWords), 1, 12)),
    maxCharacters: Math.round(clamp(finite(input.maxCharacters, d.maxCharacters), 12, 120)),
    maxDurationMs: clamp(finite(input.maxDurationMs, d.maxDurationMs), 300, 6000),
    pauseMs: clamp(finite(input.pauseMs, d.pauseMs), 50, 1200), lingerMs: clamp(finite(input.lingerMs, d.lingerMs), 0, 500),
    automaticBeats: ["off", "subtle", "balanced"].includes(input.automaticBeats ?? "") ? input.automaticBeats! : d.automaticBeats,
    beatCooldownMs: clamp(finite(input.beatCooldownMs, d.beatCooldownMs), 2000, 12000),
    soundEnabled: input.soundEnabled ?? d.soundEnabled, soundVolume: clamp(finite(input.soundVolume, d.soundVolume), 0, 1),
    reducedMotion: input.reducedMotion ?? d.reducedMotion };
};
