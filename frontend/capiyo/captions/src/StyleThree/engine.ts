import {
  compileCaptionPlan,
  ENGINE_DEFAULTS,
} from "../CaptionEngine/compilePlan";
import { clamp, finite, type EngineOptions } from "../CaptionEngine/types";
import { asRecord, bounded, resolveStyleThreeAppearance } from "./config";
import { styleThreeSource } from "./demo";
import defaults from "./style-three.config.json";

export const compileStyleThree = (
  sourceInput: unknown = styleThreeSource,
  fps = 30,
  styleInput: unknown = defaults,
) => {
  const source = asRecord(sourceInput),
    input = asRecord(source.engine);
  const appearance = resolveStyleThreeAppearance(styleInput);
  const rate = clamp(finite(fps, 30), 1, 120);
  const options: EngineOptions = {
    ...ENGINE_DEFAULTS,
    fallback: input.fallback === "hide" ? "hide" : "plain",
    minConfidence: bounded(input.minConfidence, 0.35, 0, 1),
    maxGapMs: bounded(input.maxGapMs, 500, 100, 3000),
    maxPlainWords: appearance.layout.maxWords,
    maxPlainCharacters: appearance.layout.maxCharacters,
    maxPlainDurationMs: appearance.layout.maxDurationMs,
    lingerMs: bounded(input.lingerMs, 120, 0, 600),
  };
  const captions = compileCaptionPlan(
    source.transcript,
    source.plan,
    rate,
    options,
  );
  const rowBreaks = new Map<string, number>();
  const plan = asRecord(source.plan);
  if (Array.isArray(plan.cues))
    plan.cues.forEach((item) => {
      const cue = asRecord(item);
      if (
        Array.isArray(cue.wordIds) &&
        typeof cue.wordIds[0] === "string" &&
        typeof cue.primaryWordCount === "number" &&
        Number.isInteger(cue.primaryWordCount) &&
        cue.primaryWordCount > 0 &&
        cue.primaryWordCount <= cue.wordIds.length
      )
        rowBreaks.set(cue.wordIds[0], cue.primaryWordCount);
    });
  return {
    captions,
    appearance,
    rowBreaks,
    background: asRecord(source.background),
    durationInFrames: Math.max(
      captions.durationInFrames,
      Math.ceil((bounded(source.durationMs, 0, 0, 86400000) * rate) / 1000),
    ),
  };
};
