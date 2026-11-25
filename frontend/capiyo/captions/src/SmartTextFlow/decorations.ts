import { flowEffect, flowSegmentId } from "./intent";
import { flowEase } from "./motion";
import type { FlowInk, FlowLayout } from "./layout";
import type { FlowCue, FlowEmphasis } from "./types";

export const flowPaintPadding = (effect: FlowEmphasis) => effect === "circle" ? { x: 10, top: 8, bottom: 8 } :
  effect === "underline" ? { x: 2, top: 0, bottom: 9 } : effect === "bracket" ? { x: 8, top: 5, bottom: 5 } :
    effect === "box" ? { x: 6, top: 4, bottom: 4 } : { x: 5, top: 3, bottom: 3 };
export type FlowDecoration = { key: string; id: string; row: FlowInk[]; effect: FlowEmphasis;
  x: number; y: number; width: number; height: number; progress: number };

export const createFlowDecorations = (cue: FlowCue, layout: FlowLayout, now: number, unit: number, uid: string): FlowDecoration[] => {
  const groups = new Map<string, FlowInk[]>();
  for (const word of layout.words) {
    const effect = word.metric ? "none" : flowEffect(cue, word.token);
    if (["none", "textColor"].includes(effect)) continue;
    const segment = word.token.emphasis !== "none" ? flowSegmentId(word.token) : word.token.id;
    const key = `${segment}-${word.line}-${effect}`;
    groups.set(key, [...(groups.get(key) ?? []), word]);
  }
  return [...groups.entries()].map(([key, row], index) => {
    const effect = flowEffect(cue, row[0].token), pad = flowPaintPadding(effect);
    const x = Math.min(...row.map((word) => word.x + word.left)) - pad.x * unit;
    const right = Math.max(...row.map((word) => word.x + word.right)) + pad.x * unit;
    const top = Math.min(...row.map((word) => word.baseline - word.ascent)) - pad.top * unit;
    const bottom = Math.max(...row.map((word) => word.baseline + word.descent)) + pad.bottom * unit;
    const start = Math.min(...row.map((word) => word.token.startMs));
    const finish = Math.max(...row.map((word) => word.token.startMs));
    const duration = Math.min(Math.max(220, finish - start + 200), Math.max(80, (cue.endMs - start) * 0.65));
    return { key, id: `${uid}-paint-${index}`, row, effect, x, y: top, width: right - x, height: bottom - top,
      progress: flowEase((now - start - 45) / duration) };
  });
};
