import transcript from "../StyleTwo/demo.transcript.json";

/** Reuse the original word timings; no emphasis plan or AI selection is needed. */
export const basicCaptionSource = {
  transcript,
  durationMs: 44044,
  background: {
    src: "why_not_you_hq.mp4",
    muted: false,
    volume: 1,
    objectFit: "cover" as const,
    bottomGradient: true,
    bottomGradientOpacity: 0.7,
  },
};

export type BasicCaptionSource = {
  transcript: unknown;
  durationMs?: number;
  background?: {
    src?: string;
    muted?: boolean;
    volume?: number;
    objectFit?: "contain" | "cover";
    bottomGradient?: boolean;
    bottomGradientOpacity?: number;
  };
};
