import transcript from "../StyleTwo/demo.transcript.json";
import study from "./editorial-type.demo.json";
import type { EditorialSource } from "./types";

export const editorialTypeSource: EditorialSource = {
  transcript, durationMs: 44044,
  background: { src: "why_not_you_hq.mp4", muted: false, volume: 1 },
};
export const editorialTypeStudy = study as EditorialSource;
