import {
  DEFAULT_LOOK,
  DEFAULT_VIDEO_FRAME,
  type VideoFrameSettings,
  type VideoSegment,
  type VideoShade,
} from "../../../captions/src/VideoFrameSettings";
import type { Cue } from "./CaptionTimeline";

export { DEFAULT_LOOK, DEFAULT_VIDEO_FRAME, type VideoFrameSettings, type VideoSegment, type VideoShade };

/** Output shapes, with where each one is used, so the choice explains itself. */
export const ASPECTS = [
  { id: "9:16", label: "9:16", use: "Reels, TikTok, Shorts", ratio: 9 / 16 },
  { id: "4:5", label: "4:5", use: "Instagram & Facebook feed", ratio: 4 / 5 },
  { id: "1:1", label: "1:1", use: "Square posts", ratio: 1 },
  { id: "16:9", label: "16:9", use: "YouTube, landscape", ratio: 16 / 9 },
] as const;
export type AspectId = (typeof ASPECTS)[number]["id"];
export const isAspect = (value: unknown): value is AspectId => ASPECTS.some((aspect) => aspect.id === value);
export const aspectRatioOf = (id: AspectId) => ASPECTS.find((aspect) => aspect.id === id)!.ratio;

/**
 * Where a caption sits by default (its center, % from the top). Short-form apps cover roughly the
 * bottom fifth with the caption, name and buttons, so the text rests in the lower third just above that;
 * wider frames have no app UI on top and sit lower, like subtitles.
 */
export const DEFAULT_CAPTION_Y: Record<AspectId, number> = { "9:16": 70, "4:5": 76, "1:1": 78, "16:9": 84 };

const EPS = 1e-3;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** Every scene between the split points, in order, marked kept or removed. */
export function scenes(video: VideoFrameSettings, duration: number) {
  const points = [...new Set(video.cuts.filter((at) => at > EPS && at < duration - EPS).map((at) => Math.round(at * 1000) / 1000))]
    .sort((a, b) => a - b);
  const edges = [0, ...points, duration];
  return edges.slice(0, -1).map((start, index) => ({
    start,
    end: edges[index + 1],
    removed: video.removed.some((at) => near(at, start)),
  }));
}

/** The scenes that play, in source seconds. Never empty: removing everything keeps the first scene. */
export function keptSegments(video: VideoFrameSettings, duration: number): VideoSegment[] {
  const all = scenes(video, duration);
  const kept = all.filter((scene) => !scene.removed);
  return (kept.length ? kept : all.slice(0, 1)).map(({ start, end }) => ({ start, end }));
}

/** True when the whole video plays untouched, so nothing needs remapping. */
export const isWhole = (segments: VideoSegment[], duration: number) =>
  segments.length === 1 && near(segments[0].start, 0) && near(segments[0].end, duration);

export const outputLength = (segments: VideoSegment[]) =>
  segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);

/** A source time on the edited video's clock, or null when it falls in a removed scene. */
export function toOutput(time: number, segments: VideoSegment[]) {
  let before = 0;
  for (const segment of segments) {
    if (time >= segment.start - EPS && time <= segment.end + EPS)
      return before + Math.min(segment.end, Math.max(segment.start, time)) - segment.start;
    before += segment.end - segment.start;
  }
  return null;
}

/** An edited-video time back on the source clock. */
export function toSource(time: number, segments: VideoSegment[]) {
  let before = 0;
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (time <= before + length + EPS) return segment.start + Math.max(0, time - before);
    before += length;
  }
  const last = segments[segments.length - 1];
  return last ? last.end : time;
}

/** The words on the edited video's clock. Words in removed scenes drop out; a word across a cut keeps its kept part. */
export function mapCues(cues: Cue[], segments: VideoSegment[], duration: number): Cue[] {
  if (isWhole(segments, duration)) return cues;
  const out: Cue[] = [];
  for (const cue of cues) {
    const scene = segments.find((segment) => cue.end > segment.start + EPS && cue.start < segment.end - EPS);
    if (!scene) continue;
    const start = toOutput(Math.max(cue.start, scene.start), segments)!;
    const end = toOutput(Math.min(cue.end, scene.end), segments)!;
    if (end - start < 0.02) continue;
    out.push({ ...cue, start, end });
  }
  return out;
}

/**
 * Timeline edits made on the edited clock, written back to the source words. Words hidden in removed
 * scenes are kept as they were; a word whose times didn't change keeps its exact source times.
 */
export function unmapCues(next: Cue[], shown: Cue[], all: Cue[], segments: VideoSegment[], duration: number): Cue[] {
  if (isWhole(segments, duration)) return next;
  const shownById = new Map(shown.map((cue) => [cue.id, cue]));
  const sourceById = new Map(all.map((cue) => [cue.id, cue]));
  const edited = next.map((cue) => {
    const was = shownById.get(cue.id), source = sourceById.get(cue.id);
    if (was && source && cue === was) return source;
    const start = was && source && near(cue.start, was.start) ? source.start : toSource(cue.start, segments);
    const end = was && source && near(cue.end, was.end) ? source.end : toSource(cue.end, segments);
    return { ...cue, start, end: Math.max(end, start + 0.02) };
  });
  const hidden = all.filter((cue) => !shownById.has(cue.id));
  return [...edited, ...hidden].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Splits the scene under a source time. A split inside a removed scene leaves both halves removed. */
export function splitAt(video: VideoFrameSettings, time: number, duration: number): VideoFrameSettings {
  if (time <= 0.05 || time >= duration - 0.05) return video;
  const at = Math.round(time * 1000) / 1000;
  if (video.cuts.some((cut) => Math.abs(cut - at) < 0.05)) return video;
  const scene = scenes(video, duration).find((item) => at > item.start && at < item.end);
  return {
    ...video,
    cuts: [...video.cuts, at].sort((a, b) => a - b),
    removed: scene?.removed ? [...video.removed, at] : video.removed,
  };
}

export function setRemoved(video: VideoFrameSettings, start: number, removed: boolean): VideoFrameSettings {
  const rest = video.removed.filter((at) => !near(at, start));
  return { ...video, removed: removed ? [...rest, start] : rest };
}

/** Joins a scene to the one before it (drops the split at its start). */
export function joinScene(video: VideoFrameSettings, start: number): VideoFrameSettings {
  return { ...video, cuts: video.cuts.filter((at) => !near(at, start)), removed: video.removed.filter((at) => !near(at, start)) };
}

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const hex = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const shade = (value: unknown, fallback: VideoShade): VideoShade => {
  const item = value && typeof value === "object" ? value as Partial<VideoShade> : {};
  return { on: item.on === true, color: hex(item.color, fallback.color),
    strength: finite(item.strength, fallback.strength, 0, 100), height: finite(item.height, fallback.height, 5, 100) };
};

/** A saved video setup read back safely; anything missing or broken falls back to the default. */
export function readVideoFrame(value: unknown): VideoFrameSettings {
  if (!value || typeof value !== "object") return DEFAULT_VIDEO_FRAME;
  const item = value as Partial<VideoFrameSettings>;
  const d = DEFAULT_VIDEO_FRAME;
  return {
    fit: item.fit === "fit" ? "fit" : "fill",
    ...(typeof item.ratio === "number" && item.ratio >= 0.25 && item.ratio <= 4 && { ratio: item.ratio }),
    zoom: finite(item.zoom, 1, 1, 4),
    x: finite(item.x, 50, 0, 100),
    y: finite(item.y, 50, 0, 100),
    backdrop: item.backdrop === "color" ? "color" : "blur",
    backdropColor: hex(item.backdropColor, d.backdropColor),
    flipX: item.flipX === true || undefined,
    bottomShade: shade(item.bottomShade, d.bottomShade),
    topShade: shade(item.topShade, d.topShade),
    vignette: { on: item.vignette?.on === true, strength: finite(item.vignette?.strength, d.vignette.strength, 0, 100) },
    look: {
      brightness: finite(item.look?.brightness, 100, 0, 200),
      contrast: finite(item.look?.contrast, 100, 0, 200),
      saturation: finite(item.look?.saturation, 100, 0, 200),
      hue: finite(item.look?.hue, 0, -180, 180),
    },
    // Scenes were removed from the editor: old projects play their whole video again.
    cuts: [],
    removed: [],
  };
}

/** Clock text for scene rows: 0:07.4 */
export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
};
