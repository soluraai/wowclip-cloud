import {
  compileCaptionPlan,
  ENGINE_DEFAULTS,
} from "../CaptionEngine/compilePlan";
import { clamp, finite, type EngineOptions } from "../CaptionEngine/types";
import { asRecord, bounded, resolveStyleTwoAppearance } from "./config";
import { styleTwoSource } from "./demo";
import { withAutoPlan } from "./autoPlan";
import defaults from "./style-two.config.json";

export const compileStyleTwo = (
  sourceInput: unknown = styleTwoSource,
  fps = 30,
  styleInput: unknown = defaults,
) => {
  const source = withAutoPlan(asRecord(sourceInput)),
    input = asRecord(source.engine);
  const rate = clamp(finite(fps, 30), 1, 120);
  const engine: EngineOptions = {
    fallback: input.fallback === "hide" ? "hide" : "plain",
    minConfidence: bounded(
      input.minConfidence,
      ENGINE_DEFAULTS.minConfidence,
      0,
      1,
    ),
    maxGapMs: bounded(input.maxGapMs, ENGINE_DEFAULTS.maxGapMs, 100, 3000),
    maxPlainWords: Math.round(bounded(input.maxPlainWords, 3, 1, 6)),
    maxPlainCharacters: Math.round(
      bounded(input.maxPlainCharacters, 24, 8, 60),
    ),
    maxPlainDurationMs: bounded(input.maxPlainDurationMs, 1800, 300, 4000),
    lingerMs: bounded(input.lingerMs, ENGINE_DEFAULTS.lingerMs, 0, 600),
  };
  const captions = compileCaptionPlan(
    source.transcript,
    source.plan,
    rate,
    engine,
  );
  return {
    captions,
    appearance: resolveStyleTwoAppearance(styleInput),
    background: asRecord(source.background),
    durationInFrames: Math.max(
      captions.durationInFrames,
      Math.ceil((bounded(source.durationMs, 0, 0, 86400000) * rate) / 1000),
    ),
  };
};
