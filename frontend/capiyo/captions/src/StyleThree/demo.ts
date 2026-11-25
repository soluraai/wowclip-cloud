import transcript from "../StyleTwo/demo.transcript.json";
import plan from "./style-three.plan.json";

export const styleThreeSource = {
  transcript,
  plan,
  background: {
    src: "why_not_you_hq.mp4",
    muted: false,
    volume: 1,
    trimBeforeMs: 0,
  },
  engine: {
    fallback: "plain",
    minConfidence: 0.35,
    maxGapMs: 500,
    lingerMs: 120,
  },
};
