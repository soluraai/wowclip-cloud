import transcript from "../StyleTwo/demo.transcript.json";
import type { NeonDirection, NeonSource } from "./types";

/** The production example stays attached to the existing word-timed footage. */
export const neonOverlapSource: NeonSource = {
  transcript,
  durationMs: 44044,
  background: { src: "why_not_you_hq.mp4", muted: false, volume: 1 },
};

// A quiet design study exercises every treatment, including numbers absent from the footage.
const scenes = [
  { text: ["DISCIPLINE", "when", "nobody", "is", "watching."], variant: "outline", accent: "red", hold: 3300 },
  { text: ["small", "steps.", "every", "single", "day."], variant: "plain", accent: "red", hold: 2400 },
  { text: ["CREATE", "something", "worth", "feeling."], variant: "shine", accent: "red", hold: 3000 },
  { text: ["your", "POTENTIAL", "has", "no", "ceiling."], variant: "split", accent: "red", hold: 3000 },
  { text: ["100K", "begins", "with", "one."], variant: "metric", accent: "red", hold: 2900 },
  { text: ["become", "who", "you", "are."], variant: "plain", accent: "red", hold: 2300 },
  { text: ["BELIEVE", "before", "the", "world", "does."], variant: "echo", accent: "red", hold: 2900 },
  { text: ["GROW", "a", "little", "every", "day."], variant: "outline", accent: "red", hold: 3300 },
] as const;
let start = 260;
const studyWords: { id: string; text: string; startMs: number; endMs: number }[] = [];
const direction: NeonDirection[] = [];
scenes.forEach((scene, index) => {
  const wordIds = scene.text.map((text, position) => {
    const id = `study-${index}-${position}`;
    // Headline first; supporting copy arrives later, then stays long enough to assess the sign.
    const offset = position === 0 ? 0 : 400 + (position - 1) * 225;
    studyWords.push({ id, text, startMs: start + offset,
      endMs: position === scene.text.length - 1 ? start + scene.hold - 380 : start + offset + 220 });
    return id;
  });
  direction.push({ wordIds, variant: scene.variant, accent: scene.accent,
    heroWordId: wordIds[scene.variant === "split" ? 1 : 0], placement: "center" });
  start += scene.hold;
});

export const neonOverlapStudy: NeonSource = { transcript: studyWords, direction, durationMs: start + 260 };
