import { parseTime } from "./time";

export type ClipOptions = {
  lengthId: string;
  customMin: number;
  customMax: number;
  timeframeMode: "whole" | "part";
  fromTime: string;
  toTime: string;
  genre: string;
  instruction: string;
};

export const DEFAULT_OPTIONS: ClipOptions = {
  lengthId: "auto",
  customMin: 30,
  customMax: 90,
  timeframeMode: "whole",
  fromTime: "",
  toTime: "",
  genre: "auto",
  instruction: "",
};

export const MIN_SECONDS = 10;
export const MAX_SECONDS = 300;
export const MIN_TIMEFRAME_SECONDS = 60;

export type LengthPreset = { id: string; label: string; min?: number; max?: number };

export const LENGTH_PRESETS: LengthPreset[] = [
  { id: "auto", label: "Auto" },
  { id: "under30", label: "Under 30s", min: 10, max: 30 },
  { id: "30to60", label: "30–60s", min: 30, max: 60 },
  { id: "60to90", label: "60–90s", min: 60, max: 90 },
  { id: "90to180", label: "1.5–3 min", min: 90, max: 180 },
  { id: "180to300", label: "3–5 min", min: 180, max: 300 },
  { id: "custom", label: "Custom" },
];

// The backend accepts exactly these values (see backend/clip_options.py).
export const GENRES = [
  { value: "auto", label: "Let AI detect" },
  { value: "podcast", label: "Podcast" },
  { value: "interview", label: "Interview" },
  { value: "speech", label: "Speech or talk" },
  { value: "comedy", label: "Comedy" },
  { value: "education", label: "Education" },
  { value: "business", label: "Business" },
  { value: "debate", label: "Debate" },
  { value: "vlog", label: "Vlog" },
  { value: "news", label: "News" },
];

export type Topic = { id: string; label: string; sentence: string };

export const TOPICS: Topic[] = [
  {
    id: "motivation",
    label: "Motivation",
    sentence: "Find the most motivating moments: powerful advice, hard truths or a push to take action that makes people want to get up and do something.",
  },
  {
    id: "funny",
    label: "Funny moments",
    sentence: "Find the funniest moments: jokes, witty replies and unexpected situations that make people laugh out loud.",
  },
  {
    id: "emotional",
    label: "Emotional stories",
    sentence: "Find the most emotional moments: personal stories, honest confessions or heartfelt words that make the viewer feel something.",
  },
  {
    id: "lessons",
    label: "Life lessons",
    sentence: "Find clear life lessons: wisdom learned the hard way that a stranger can use in their own life.",
  },
  {
    id: "money",
    label: "Money and business",
    sentence: "Find sharp money and business advice: specific, practical insights about earning, saving, investing or building a company.",
  },
  {
    id: "hottakes",
    label: "Hot takes",
    sentence: "Find bold opinions and hot takes: strong claims that make people want to agree, argue or share.",
  },
  {
    id: "facts",
    label: "Surprising facts",
    sentence: "Find surprising facts and ideas that most people do not know and would want to tell someone else.",
  },
  {
    id: "stories",
    label: "Great stories",
    sentence: "Find great stories with a clear beginning, a turning point and a payoff.",
  },
  {
    id: "tips",
    label: "Practical tips",
    sentence: "Find practical tips and how-to advice that a viewer can use right away.",
  },
  {
    id: "debates",
    label: "Debates and clashes",
    sentence: "Find heated or revealing exchanges: disagreements, pushback and moments where someone is challenged.",
  },
];

export function getLengthRange(options: ClipOptions): { min: number; max: number } | null {
  if (options.lengthId === "auto") return null;
  if (options.lengthId === "custom") return { min: options.customMin, max: options.customMax };
  const preset = LENGTH_PRESETS.find((p) => p.id === options.lengthId);
  if (!preset || preset.min === undefined || preset.max === undefined) return null;
  return { min: preset.min, max: preset.max };
}

export function getTimeframe(options: ClipOptions): { start: number; end: number } | null {
  if (options.timeframeMode === "whole") return null;
  const start = parseTime(options.fromTime);
  const end = parseTime(options.toTime);
  if (start === null || end === null) return null;
  return { start, end };
}

// One message for the first problem found, or null when the options are fine.
export function getOptionsError(options: ClipOptions, videoSeconds: number): string | null {
  if (options.lengthId === "custom") {
    if (options.customMin < MIN_SECONDS) return `The shortest clip is ${MIN_SECONDS} seconds.`;
    if (options.customMax > MAX_SECONDS) return "The longest clip is 5 minutes (300 seconds).";
    if (options.customMin >= options.customMax) return "The minimum length must be smaller than the maximum.";
  }

  if (options.timeframeMode === "part") {
    const timeframe = getTimeframe(options);
    if (!timeframe) return "Write the times like 2:30 or 1:05:00.";
    if (timeframe.end > videoSeconds) return "The end time is after the end of the video.";
    if (timeframe.end - timeframe.start < MIN_TIMEFRAME_SECONDS) return "Choose a part that is at least 1 minute long.";
  }

  return null;
}

export function toBackendOptions(options: ClipOptions) {
  const range = getLengthRange(options);
  const timeframe = getTimeframe(options);
  return {
    length_mode: range ? "range" : "ai",
    min_seconds: range ? range.min : 0,
    max_seconds: range ? range.max : 0,
    timeframe_start: timeframe ? timeframe.start : 0,
    timeframe_end: timeframe ? timeframe.end : 0,
    genre: options.genre,
    instruction: options.instruction.trim(),
  };
}
