/**
 * Caption pipeline, run when a video arrives (or on demand from the Emphasis panel):
 *
 *   1. transcribe  — speech → timed words. Not wired yet (ElevenLabs STT goes here); until
 *                    then the words already on the timeline are the transcript.
 *   2. enhance     — LLM pass via /api/ai/enhance: punctuation, digits, fixes, emphasis
 *                    words and phrase breaks (see captionAI.ts).
 *   3. apply       — merge the decisions into the cues without touching timings.
 */
import type { Cue } from "../app/CaptionTimeline";
import { cuesToAIWords, type CaptionAIResult } from "./captionAI";
import { authHeaders } from "../auth/client";

export type PipelineStage = "transcribe" | "enhance";

export async function enhanceCues(cues: Cue[], signal?: AbortSignal) {
  const words = cuesToAIWords(cues);
  const sentText = Object.fromEntries(cues.map((cue, i) => [cue.id, words[i].text]));
  const response = await fetch("/api/ai/enhance", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      words: words.map((word, i) => ({ id: cues[i].id, text: word.text, gapMs: word.gapMs })),
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error)
    throw new Error(data?.error ?? `AI request failed (${response.status}).`);
  return { result: data as CaptionAIResult, sentText };
}

/** Friendly label for the model id shown in the panel. */
export const modelLabel = (model: string) =>
  model
    .split("/")
    .pop()!
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
