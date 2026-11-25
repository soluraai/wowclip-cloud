import { useMemo } from "react";
/**
 * Size picks for a Premium style, as multipliers of the design's own sizes. Chunks and the even size
 * across a video are worked out at the design's sizes, or a bigger main word would only lower the cap
 * and land back where it started. Picks go on top of that, and a word stops at what fits.
 */
export type PartSizes = { main: number; helper: number; script: number; plain: number; words: Record<string, number> };

/** Letter spacing per kind of text, as a share of each word's size: the whole caption's plus the part's own. */
export type PartSpacing = { main: number; helper: number; script: number; plain: number };
export const NO_SPACING: PartSpacing = { main: 0, helper: 0, script: 0, plain: 0 };
export const spacingOf = (presentation?: { tracking?: number; parts?: Partial<Record<"main" | "helper" | "script" | "plain", { tracking?: number }>> }): PartSpacing => {
  const all = presentation?.tracking ?? 0, own = (role: "main" | "helper" | "script" | "plain") => presentation?.parts?.[role]?.tracking;
  const helper = all + (own("helper") ?? 0);
  return { main: all + (own("main") ?? 0), helper, script: all + (own("script") ?? own("helper") ?? 0), plain: all + (own("plain") ?? own("helper") ?? 0) };
};

/** The spacing picks, stable until one changes, so a color drag never redoes a layout. */
export const useSpacing = (presentation?: Parameters<typeof spacingOf>[0]): PartSpacing => {
  const key = JSON.stringify(spacingOf(presentation));
  return useMemo(() => JSON.parse(key) as PartSpacing, [key]);
};

export const NO_SIZES: PartSizes = { main: 1, helper: 1, script: 1, plain: 1, words: {} };

/** A clamp in the renderer too, so a stale or hand-edited value can't reach a layout. */
export const sizeScale = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(.3, Math.min(3, value)) : 1;

/** A bigger pick may pass the text box, up to the frame's safe edge: the widest words fill the box already. */
export const SAFE_WIDTH = .94;

export const sizeOf = (sizes: PartSizes, part: "main" | "helper" | "script", id: string) =>
  sizes[part] * (sizes.words[id] ?? 1);
