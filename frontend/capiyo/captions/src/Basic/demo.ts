const PREVIEW_WORDS = [
  { text: "Captions", startMs: 0, endMs: 340 },
  { text: "make", startMs: 340, endMs: 580 },
  { text: "your", startMs: 580, endMs: 800 },
  { text: "videos", startMs: 800, endMs: 1220 },
  { text: "easy", startMs: 1220, endMs: 1540 },
  { text: "to", startMs: 1540, endMs: 1720 },
  { text: "watch,", startMs: 1720, endMs: 2120 },
  { text: "simple", startMs: 2120, endMs: 2480 },
  { text: "to", startMs: 2480, endMs: 2660 },
  { text: "understand,", startMs: 2660, endMs: 3220 },
  { text: "and", startMs: 3220, endMs: 3420 },
  { text: "engaging", startMs: 3420, endMs: 3940 },
  { text: "for", startMs: 3940, endMs: 4140 },
  { text: "everyone", startMs: 4140, endMs: 4620 },
  { text: "everywhere.", startMs: 4620, endMs: 5200 },
];

export const basicPreviewSource = {
  transcript: PREVIEW_WORDS.map((item, index) => ({
    id: `basic-preview-${index}`,
    text: item.text,
    startMs: item.startMs,
    endMs: item.endMs,
    emphasis: [0, 3, 4, 9, 11, 14].includes(index),
  })),
  durationMs: 5200,
};

export const styleTwoPreviewSource = {
  transcript: [
    { id: "style-two-captions", text: "Captions", startMs: 0, endMs: 340 },
    { id: "style-two-make", text: "make", startMs: 340, endMs: 580 },
    { id: "style-two-your", text: "your", startMs: 580, endMs: 800 },
    { id: "style-two-videos", text: "videos", startMs: 800, endMs: 1220 },
    { id: "style-two-easy", text: "easy", startMs: 1220, endMs: 1540 },
    { id: "style-two-to", text: "to", startMs: 1540, endMs: 1720 },
    { id: "style-two-watch", text: "watch,", startMs: 1720, endMs: 2120 },
    { id: "style-two-simple", text: "simple", startMs: 2120, endMs: 2480 },
    { id: "style-two-to-2", text: "to", startMs: 2480, endMs: 2660 },
    { id: "style-two-understand", text: "understand,", startMs: 2660, endMs: 3220 },
    { id: "style-two-and", text: "and", startMs: 3220, endMs: 3420 },
    { id: "style-two-engaging", text: "engaging", startMs: 3420, endMs: 3940 },
    { id: "style-two-for", text: "for", startMs: 3940, endMs: 4140 },
    { id: "style-two-everyone", text: "everyone", startMs: 4140, endMs: 4620 },
    { id: "style-two-everywhere", text: "everywhere.", startMs: 4620, endMs: 5200 },
  ],
  plan: {
    version: 1,
    cues: [
      {
        id: "style-two-cue-1",
        mode: "emphasis",
        wordIds: ["style-two-captions", "style-two-make", "style-two-your", "style-two-videos"],
        heroWordIds: ["style-two-videos"],
      },
      {
        id: "style-two-cue-2",
        mode: "emphasis",
        wordIds: ["style-two-easy", "style-two-to", "style-two-watch"],
        heroWordIds: ["style-two-watch"],
      },
      {
        id: "style-two-cue-3",
        mode: "emphasis",
        wordIds: ["style-two-simple", "style-two-to-2", "style-two-understand"],
        heroWordIds: ["style-two-understand"],
      },
      {
        id: "style-two-cue-4",
        mode: "emphasis",
        wordIds: ["style-two-and", "style-two-engaging"],
        heroWordIds: ["style-two-engaging"],
      },
      {
        id: "style-two-cue-5",
        mode: "emphasis",
        wordIds: ["style-two-for", "style-two-everyone", "style-two-everywhere"],
        heroWordIds: ["style-two-everyone"],
      },
    ],
  },
  durationMs: 5200,
};

// Loop the spoken section, not the source's empty tail: static styles must not blink on hover.
export const BASIC_PREVIEW_FPS = 30;
export const BASIC_PREVIEW_FRAMES = Math.ceil(
  Math.max(...basicPreviewSource.transcript.map((word) => word.endMs)) * BASIC_PREVIEW_FPS / 1000
);
export const BASIC_PREVIEW_STILL_FRAME = 0;
