import transcript from "../StyleTwo/demo.transcript.json";
import type { EditorialSource } from "./engine";

// Replace transcript with any word-timed source. The visual plan is derived from it.
export const editorialSelectSource: EditorialSource = {
  transcript,
  durationMs: 44044,
  background: { src: "why_not_you_hq.mp4", muted: false, volume: 1 },
};
