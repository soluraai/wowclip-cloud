import transcript from "../StyleTwo/demo.transcript.json";
import type { FlowSource } from "./types";
import study from "./smart-text-flow.demo.json";

export const smartTextFlowSource: FlowSource = { transcript, durationMs: 44044,
  background: { src: "why_not_you_hq.mp4", muted: false, volume: 1 } };
export const smartTextFlowStudy = study as FlowSource;
