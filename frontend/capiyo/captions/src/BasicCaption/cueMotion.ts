import { createContext, useCallback, useContext, useLayoutEffect, useState, type ContextType, type RefObject } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { captionFrame, chosenEntrance, ownWordFrame, type CaptionAnimation, type WordBox } from "./motion";

/** What one word of a self-drawn style has of its own. */
export type WordLook = { color?: string; opacity?: number; filter?: string; visibility?: "hidden" | "visible"; textCase?: string };
/** A color picked for one kind of text: a solid color or a gradient across each word. */
export type RolePaint = { color?: string; gradient?: { stops: { color: string; position: number }[]; angle: number } };
/** main: key words, or the style's main line. rest: everything else. */
export type RolePaints = { main?: RolePaint; rest?: RolePaint };
/** Design picked for one kind of text, drawn on each of its words. */
export type RoleLooks = Partial<Record<"main" | "rest" | "plain", { filter?: string; opacity?: number }>>;

/** Lets a style with its own renderer animate the layer holding it, one caption at a time. */
export const CueMotionContext = createContext<{
  animation?: CaptionAnimation;
  target: RefObject<HTMLDivElement | null>;
  keyWords?: string;
  wordLooks?: Record<string, WordLook>;
  /** Colors picked for key words and the rest, for styles that don't paint those themselves. */
  paints?: RolePaints;
  roleLooks?: RoleLooks;
} | null>(null);

/** True while the editor is paused: a caption rests in its final pose, so what you edit is what stays on screen. */
export const SettledMotionContext = createContext(false);

/** For a style's own entrance: is a chosen one playing on this word instead? */
export function useChosenEntrance() {
  const context = useContext(CueMotionContext);
  const animation = context?.animation, keyWords = context?.keyWords;
  return useCallback((id: string, main = false) =>
    chosenEntrance(animation, main, id) || (!!animation?.keyIn && !!keyWords && keyWords.split(" ").includes(id)), [animation, keyWords]);
}

/** Where each word sits, by id, for motion that goes row by row. */
export function useWordBoxes(box: RefObject<HTMLElement | null>, enabled: boolean) {
  const [boxes, setBoxes] = useState<Record<string, WordBox>>({});
  useLayoutEffect(() => {
    if (!enabled || !box.current) return;
    const nodes = Array.from(box.current.querySelectorAll<HTMLElement>("[data-word-id]"));
    const next = Object.fromEntries(nodes.map((node) => [node.dataset.wordId, { y: node.offsetTop, height: node.offsetHeight }]));
    setBoxes((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
  });
  return boxes;
}

/** A wipe is written for the caption's width, but this layer fills the frame. */
function wipeOverWords(node: HTMLElement, clipPath: string) {
  const inset = /^inset\((\S+)% (\S+)% (\S+)% (\S+)%\)$/.exec(clipPath);
  const frame = node.getBoundingClientRect();
  if (!inset || !frame.width) return clipPath;
  let left = Infinity, right = -Infinity;
  node.querySelectorAll("text, span, rect, path").forEach((part) => {
    const box = part.getBoundingClientRect();
    if (!box.width || box.width > frame.width * .98) return;
    left = Math.min(left, box.left);
    right = Math.max(right, box.right);
  });
  if (left === Infinity) return clipPath;
  const from = (left - frame.left) / frame.width, to = (right - frame.left) / frame.width;
  const span = (to - from) / 100;
  return `inset(-30% ${(1 - to + Number(inset[2]) * span) * 100}% -30% ${(from + Number(inset[4]) * span) * 100}%)`;
}

const SVG = "http://www.w3.org/2000/svg";
/** The fill for a role's paint: a solid color, or a gradient kept in the word's own SVG. */
function paintFill(text: SVGElement, role: string, paint: RolePaint | undefined) {
  if (!paint?.gradient || paint.gradient.stops.length < 2) return paint?.color ?? "";
  const svg = (text as SVGGraphicsElement).ownerSVGElement;
  if (!svg) return paint.gradient.stops[0].color;
  const sorted = [...paint.gradient.stops].sort((a, b) => a.position - b.position);
  const key = `${paint.gradient.angle}|${sorted.map((stop) => `${stop.color}${stop.position}`).join("|")}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const id = `cap-paint-${role}-${(hash >>> 0).toString(36)}`;
  if (!svg.querySelector(`#${id}`)) {
    const gradient = document.createElementNS(SVG, "linearGradient");
    const r = (paint.gradient.angle * Math.PI) / 180, dx = Math.sin(r) / 2, dy = -Math.cos(r) / 2;
    gradient.id = id;
    gradient.setAttribute("x1", String(.5 - dx)); gradient.setAttribute("y1", String(.5 - dy));
    gradient.setAttribute("x2", String(.5 + dx)); gradient.setAttribute("y2", String(.5 + dy));
    for (const stop of sorted) {
      const node = document.createElementNS(SVG, "stop");
      node.setAttribute("offset", String(Math.max(0, Math.min(1, stop.position / 100))));
      node.setAttribute("stop-color", stop.color);
      gradient.appendChild(node);
    }
    let defs = svg.querySelector<SVGDefsElement>(":scope > defs[data-cap-paint]");
    if (!defs) {
      defs = document.createElementNS(SVG, "defs") as SVGDefsElement;
      defs.setAttribute("data-cap-paint", "");
      svg.prepend(defs);
    }
    defs.appendChild(gradient);
  }
  return `url(#${id})`;
}

/** Poses each word marked by MotionWord; words that have nothing of their own go back to rest. */
function poseWords(node: HTMLElement, context: NonNullable<ContextType<typeof CueMotionContext>>, nowMs: number, paused: boolean, endMs?: number) {
  const parts = Array.from(node.querySelectorAll<HTMLElement | SVGElement>("[data-motion-word]"));
  if (!parts.length) return;
  const starts = [...new Set(parts.map((part) => Number(part.dataset.start)))].sort((a, b) => a - b);
  const keys = new Set(context.keyWords?.split(" "));
  for (const part of parts) {
    const id = part.dataset.motionWord!, startMs = Number(part.dataset.start);
    const look = context.wordLooks?.[id];
    // Helper motion is not the main word's: without a choice of its own that word keeps the style's entrance.
    const main = part.dataset.main !== undefined;
    const animation = main && context.animation && !context.animation.keyIn ? { ...context.animation, unit: "caption" as const } : context.animation;
    // A word whose motion is the design itself takes no chosen entrance, whatever an older project saved.
    const frame = animation && part.dataset.fixed === undefined
      ? ownWordFrame(animation, nowMs, id, startMs, starts[starts.indexOf(startMs) + 1], main || keys.has(id), paused, endMs)
      : undefined;
    // Plain lines are their own kind of text; a word's own Design beats its kind's.
    const role = main || keys.has(id) ? "main" : part.dataset.plain !== undefined ? "plain" : "rest";
    const roleLook = context.roleLooks?.[role];
    const opacity = (frame?.opacity ?? 1) * (look?.opacity ?? roleLook?.opacity ?? 1);
    part.style.opacity = opacity === 1 ? "" : String(opacity);
    part.style.transform = frame?.transform ?? "";
    part.style.filter = [frame?.filter, look?.filter || roleLook?.filter].filter(Boolean).join(" ");
    part.style.clipPath = frame?.clipPath ?? "";
    part.style.visibility = look?.visibility ?? "";
    part.style.textTransform = look?.textCase ? (look.textCase === "preserve" ? "none" : look.textCase) : "";
    // A word's own color beats the color picked for its kind; decorative layers marked keep their own.
    const paint = look?.color ? { color: look.color } : role === "plain" ? undefined : context.paints?.[role];
    part.style.color = paint?.gradient ? paint.gradient.stops[0]?.color ?? "" : paint?.color ?? "";
    part.querySelectorAll<SVGElement>("text:not([fill='none']):not([data-paint='keep'])").forEach((text) => {
      text.style.fill = paintFill(text, role, paint);
    });
  }
}

/** A renderer reports its current caption; the layer around it does the moving. */
export function useCueMotion(startMs?: number, endMs?: number) {
  const context = useContext(CueMotionContext);
  const settled = useContext(SettledMotionContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  useLayoutEffect(() => {
    const node = context?.target.current;
    if (!node) return;
    const motion =
      context?.animation && !settled && startMs !== undefined && endMs !== undefined
        ? captionFrame(context.animation, (frame * 1000) / fps, startMs, endMs)
        : undefined;
    node.style.opacity = motion ? String(motion.opacity) : "";
    node.style.transform = motion?.transform ?? "";
    node.style.filter = motion?.filter ?? "";
    node.style.clipPath = motion?.clipPath ? wipeOverWords(node, motion.clipPath) : "";
    if (context) poseWords(node, context, (frame * 1000) / fps, settled, endMs);
    // Every render: a style may redraw its words (a font finishing loading, a new layout) on the same
    // frame, and the new nodes need their pose and color again.
  });
}
