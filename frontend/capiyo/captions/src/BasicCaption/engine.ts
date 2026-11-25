import {
  compileCaptionPlan,
  ENGINE_DEFAULTS,
} from "../CaptionEngine/compilePlan";
import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { finite } from "../CaptionEngine/types";
import { resolveBasicCaptionConfig } from "./config";
import type { BasicCaptionSource } from "./source";

export const compileBasicCaption = (
  source: BasicCaptionSource,
  fps: number,
  styleConfig?: unknown,
) => {
  const settings = resolveBasicCaptionConfig(styleConfig);
  const normalized = normalizeTranscript(source.transcript);
  const pageBreaks = new Set(settings.content.pageBreakAfterWordIds);
  const words = normalized.words.map((word) => ({
    ...word,
    text: settings.content.textOverrides[word.id] ?? word.text,
    pageBreakAfter: word.pageBreakAfter || pageBreaks.has(word.id),
  }));
  const captions = compileCaptionPlan(words, undefined, fps, {
    ...ENGINE_DEFAULTS,
    minConfidence: 0,
    maxPlainWords: settings.phrasing.maxWords,
    maxPlainCharacters: settings.phrasing.maxCharacters,
    maxPlainDurationMs: settings.phrasing.maxDurationMs,
    maxGapMs: settings.phrasing.maxGapMs,
    lingerMs: settings.phrasing.lingerMs,
  });
  return {
    settings,
    captions,
    diagnostics: [...normalized.diagnostics, ...captions.diagnostics],
    durationInFrames: Math.max(
      captions.durationInFrames,
      Math.ceil((Math.max(0, finite(source.durationMs, 0)) * fps) / 1000),
    ),
  };
};
