import type { EditInsert, EditPlan } from "./types";

// The one timeline function: the composition length (calculateMetadata, the Lambda job's frame count) and every
// frame drawn come from buildEditTimeline, so the reel can never disagree with what is on screen.

export const EDIT_FPS = 30;
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

export type Segment = { from: number; frames: number; sourceFrom: number };
export type TimedInsert = EditInsert & { from: number; frames: number };
export type TimedZoom = { from: number; to: number; style: "punch" | "push" };

export type EditTimeline = {
  fps: number;
  frames: number;
  segments: Segment[];
  /** Output frames where a cut joins two kept ranges (jump cuts). */
  cuts: number[];
  inserts: TimedInsert[];
  zooms: TimedZoom[];
  /** Source seconds -> output frame (a time inside a removed gap lands on the next kept frame). */
  toFrame: (seconds: number) => number;
  /** Source milliseconds -> output milliseconds, or null when the moment was cut out. */
  mapMs: (ms: number) => number | null;
};

const MIN_INSERT_SECONDS = 0.5;
const LAYER: Record<string, "full" | "split" | "card"> = { broll: "full", graphic: "full", split: "split", card: "card", template: "full"};

export const keptRanges = (plan: EditPlan): [number, number][] => {
  const whole: [number, number][] = [[0, plan.sourceDuration]];
  if (!plan.trims || !Array.isArray(plan.keep) || !plan.keep.length) return whole;
  const ranges = plan.keep
    .filter((range) => Array.isArray(range) && range[1] > range[0])
    .map(([start, end]) => [Math.max(0, start), Math.min(plan.sourceDuration, end)] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  return ranges.length ? ranges : whole;
};

export const buildEditTimeline = (plan: EditPlan, fps = EDIT_FPS): EditTimeline => {
  const segments: Segment[] = [];
  const cuts: number[] = [];
  let cursor = 0;
  let lastSourceEnd = -1;
  for (const [start, end] of keptRanges(plan)) {
    const sourceFrom = Math.max(Math.round(start * fps), lastSourceEnd);
    const sourceTo = Math.round(end * fps);
    const frames = sourceTo - sourceFrom;
    if (frames <= 0) continue;
    if (segments.length && sourceFrom > lastSourceEnd) cuts.push(cursor);
    segments.push({ from: cursor, frames, sourceFrom });
    cursor += frames;
    lastSourceEnd = sourceTo;
  }
  const total = Math.max(1, cursor);

  const toFrame = (seconds: number) => {
    const source = seconds * fps;
    for (const segment of segments) {
      if (source < segment.sourceFrom) return segment.from;
      if (source < segment.sourceFrom + segment.frames) return segment.from + (source - segment.sourceFrom);
    }
    return total;
  };
  const mapMs = (ms: number) => {
    const source = (ms / 1000) * fps;
    for (const segment of segments) {
      if (source >= segment.sourceFrom && source < segment.sourceFrom + segment.frames)
        return ((segment.from + source - segment.sourceFrom) / fps) * 1000;
    }
    return null;
  };

  const lastEnd: Record<string, number> = {};
  const inserts: TimedInsert[] = [];
  const ordered = [...(plan.inserts || [])].filter((insert) => !insert.off).sort((a, b) => a.start - b.start);
  for (const insert of ordered) {
    const layer = LAYER[insert.type];
    if (!layer) continue;
    let from = Math.round(toFrame(insert.start));
    const to = Math.min(total, Math.round(toFrame(insert.end)));
    from = Math.max(from, lastEnd[layer] ?? 0);
    if (to - from < MIN_INSERT_SECONDS * fps) continue;
    if (insert.type === "broll" || insert.type === "card" || (insert.type === "split" && !insert.scene)) {
      if (!insert.media?.src) continue;
    }
    if (insert.type === "graphic" && !insert.scene) continue;
    if (insert.type === "template" && !insert.template) continue;
    inserts.push({ ...insert, from, frames: to - from });
    lastEnd[layer] = to;
  }

  const zooms: TimedZoom[] = (plan.zooms || [])
    .filter((zoom) => !zoom.off)
    .map((zoom) => ({ from: Math.round(toFrame(Math.max(0, zoom.at - 0.03))), to: Math.round(toFrame(zoom.end)), style: zoom.style }))
    .filter((zoom) => zoom.to > zoom.from)
    .sort((a, b) => a.from - b.from);

  return { fps, frames: total, segments, cuts, inserts, zooms, toFrame, mapMs };
};

export const editDuration = (plan: EditPlan, fps = EDIT_FPS) => buildEditTimeline(plan, fps).frames;
