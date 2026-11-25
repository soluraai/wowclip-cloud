import transcript from "./demo.transcript.json";
import plan from "./style-two.plan.json";

/** Independent source timestamps and selections for both Style Two compositions. */
export const styleTwoSource = {
  transcript,
  plan,
  durationMs: 44044,
  background: {
    src: "why_not_you_hq.mp4",
    muted: false,
    volume: 1,
    trimBeforeMs: 0,
    bottomGradient: true,
    bottomGradientOpacity: 0.7,
  },
  engine: {
    fallback: "plain",
    minConfidence: 0.35,
    maxGapMs: 560,
    maxPlainWords: 3,
    maxPlainCharacters: 24,
    maxPlainDurationMs: 1800,
    lingerMs: 120,
  },
};
