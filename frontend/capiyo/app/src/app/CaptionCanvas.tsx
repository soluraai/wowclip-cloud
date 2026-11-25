"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import type { PlayerRef } from "@remotion/player";
import type { CaptionSettings } from "./captionSettings";
import type { StyleCapabilities } from "./styleCapabilities";
import { safeArea, type GuideAspect, type PreviewGuides } from "./previewGuides";
import s from "./CaptionCanvas.module.css";

/** The caption's box on the preview, in pixels from the frame's top left. */
type Box = { cx: number; cy: number; w: number; h: number };
type Mode = "move" | "size" | "width" | "rotate";
type Patch = Partial<CaptionSettings>;
/**
 * A line the caption can catch while it moves; `at` is % across (x) or down (y) the frame.
 * With `side` the box's own edge catches it (a safe-zone border), otherwise the caption's position does.
 */
type Target = { axis: "x" | "y"; at: number; kind: "center" | "best" | "third" | "safe"; side?: "min" | "max" };
/** What a gesture shows around the caption: the guides it caught and its value. */
type Hud = { lines: Target[]; readout: string };
type Step = { patch: Patch; hud: Hud };
type Grab = {
  mode: Mode;
  pointerId: number;
  /** Pointer and caption at the start of the gesture. */
  px: number;
  py: number;
  box: Box;
  settings: CaptionSettings;
  frameW: number;
  frameH: number;
  /** Frame position on screen, so pointer coordinates turn into frame coordinates. */
  left: number;
  top: number;
  targets: Target[];
  /** How far the box's sides sit from the caption's position, in % of the frame; null when tilted. */
  sides: { x: [number, number]; y: [number, number] } | null;
  /** A press only becomes a drag once the pointer has really moved, so a click never nudges the caption. */
  moved: boolean;
  /** The newest change, shown or not yet. */
  patch: Patch | null;
};

/** Pointer travel before a press counts as a drag. */
const DRAG_START_PX = 3;
/** A guide pulls when the caption is this close; Alt or Ctrl places freely. */
const SNAP_PX = 6;
const ROTATION_SNAP = 3;
const SIZE_MIN = 6;
const SIZE_MAX = 400;
/** Air around the words, and the smallest box that keeps the dots apart on tiny text. */
const PAD = 6;
const MIN_W = 48;
const MIN_H = 34;
/** How long the caption is measured after anything changes. */
const MEASURE_MS = 700;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const tenth = (value: number) => Math.round(value * 10) / 10;

const findCaption = (host: Element | null | undefined) =>
  (host?.querySelector("[data-caption-box]") ??
    host?.querySelector("[data-basic-caption], [data-signature-style]")) as HTMLElement | SVGElement | null;

/** The box around the words on screen right now (untilted), or null when no word is showing. */
function measureWords(node: HTMLElement | SVGElement, area: DOMRect, frameScale: number, angle: number): Box | null {
  const layer = node.hasAttribute("data-caption-layer") ? new DOMMatrix(getComputedStyle(node).transform) : null;
  const scale = frameScale * (layer ? Math.hypot(layer.a, layer.b) : 1);
  const outer = node.getBoundingClientRect();
  const midX = outer.left + outer.width / 2,
    midY = outer.top + outer.height / 2;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  const marked = node.querySelectorAll<HTMLElement | SVGElement>("[data-word-id]");
  // Standard styles draw plain SVG text inside a full-frame layer.
  const parts = marked.length ? marked : node.querySelectorAll<HTMLElement | SVGElement>("text, span, path");
  parts.forEach((word) => {
    const rect = word.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // A tilted word's screen box is wider than the word; its own size gives the true one.
    const own = angle !== 0 && word instanceof HTMLElement;
    const w = own ? word.offsetWidth * scale : rect.width;
    const h = own ? word.offsetHeight * scale : rect.height;
    const dx = rect.left + rect.width / 2 - midX,
      dy = rect.top + rect.height / 2 - midY;
    const x = dx * cos + dy * sin,
      y = -dx * sin + dy * cos;
    left = Math.min(left, x - w / 2);
    right = Math.max(right, x + w / 2);
    top = Math.min(top, y - h / 2);
    bottom = Math.max(bottom, y + h / 2);
  });
  if (left === Infinity) return null;
  const x = (left + right) / 2,
    y = (top + bottom) / 2;
  return {
    cx: midX + x * cos - y * sin - area.left,
    cy: midY + x * sin + y * cos - area.top,
    w: right - left,
    h: bottom - top,
  };
}

/** A caption's reach around its anchor (x, y), untilted, in composition pixels. */
type Reach = { l: number; r: number; t: number; b: number };
/** Everything a caption chunk has filled so far, so the box doesn't shrink or slide as words animate in. */
type Held = { page: string; layout: string; x: number; y: number; size: number; reach: Reach };

/** Which caption chunk is on screen: its cue id where the style marks one, else its first word or its text. */
function pageOf(node: HTMLElement | SVGElement) {
  const cue = node.closest("[data-basic-caption],[data-cue-id]") ?? node.querySelector("[data-basic-caption],[data-cue-id]");
  const id = cue?.getAttribute("data-basic-caption") ?? cue?.getAttribute("data-cue-id");
  if (id) return `c:${id}`;
  const first = node.querySelector("[data-word-id]")?.getAttribute("data-word-id");
  return first ? `w:${first}` : `t:${node.textContent ?? ""}`;
}

/** Settings that change the caption's shape. Position isn't one (the held reach moves with the anchor),
 *  nor is size (the held reach grows and shrinks with it). */
const layoutOf = (settings: CaptionSettings) => JSON.stringify({ ...settings, x: 0, y: 0, size: 0 });

const within = (outer: Reach, inner: Reach, slack: number) =>
  inner.l >= outer.l - slack && inner.r <= outer.r + slack && inner.t >= outer.t - slack && inner.b <= outer.b + slack;

const sameBox = (a: Box | null, b: Box | null) =>
  !!a && !!b && Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

/**
 * The caption's box: the most the chunk on screen has filled, around where the caption is placed. Words
 * popping in, growing or bouncing never make it jump. Null when no caption is showing.
 */
function measureCaption(host: Element | null, area: DOMRect, settings: CaptionSettings, compositionWidth: number, held: { current: Held | null }): Box | null {
  const caption = findCaption(host);
  const angle = ((settings.rotation ?? 0) * Math.PI) / 180;
  const k = area.width / compositionWidth;
  const seen = caption ? measureWords(caption, area, k, angle) : null;
  if (!caption || !seen) return null;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const ax = (settings.x / 100) * area.width, ay = (settings.y / 100) * area.height;
  const dx = seen.cx - ax, dy = seen.cy - ay;
  const rx = (dx * cos + dy * sin) / k, ry = (-dx * sin + dy * cos) / k;
  const fresh: Reach = { l: rx - seen.w / 2 / k, r: rx + seen.w / 2 / k, t: ry - seen.h / 2 / k, b: ry + seen.h / 2 / k };
  const page = pageOf(caption), layout = layoutOf(settings);
  const kept = held.current;
  let reach = fresh;
  if (kept && kept.page === page && kept.layout === layout) {
    const grow = kept.size ? settings.size / kept.size : 1;
    const before = grow === 1 ? kept.reach : { l: kept.reach.l * grow, r: kept.reach.r * grow, t: kept.reach.t * grow, b: kept.reach.b * grow };
    // After a move, the old reach only still fits if the caption moved as one piece (it's centered on its
    // anchor); styles anchored by an edge shift differently, so they start over from what's on screen.
    const moved = kept.x !== settings.x || kept.y !== settings.y;
    if (!moved || within(before, fresh, 2 / k))
      reach = { l: Math.min(before.l, fresh.l), r: Math.max(before.r, fresh.r), t: Math.min(before.t, fresh.t), b: Math.max(before.b, fresh.b) };
  }
  held.current = { page, layout, x: settings.x, y: settings.y, size: settings.size, reach };
  const mx = ((reach.l + reach.r) / 2) * k, my = ((reach.t + reach.b) / 2) * k;
  return { cx: ax + mx * cos - my * sin, cy: ay + mx * sin + my * cos, w: (reach.r - reach.l) * k, h: (reach.b - reach.t) * k };
}

/** The guides a move can catch: the best caption spot, the middle, and whatever the toolbar is showing. */
function snapTargets(sideways: boolean, guides: PreviewGuides, aspect: GuideAspect, bestY: number | undefined): Target[] {
  const targets: Target[] = [];
  if (bestY !== undefined) targets.push({ axis: "y", at: bestY, kind: "best" });
  targets.push({ axis: "y", at: 50, kind: "center" });
  if (sideways) targets.push({ axis: "x", at: 50, kind: "center" });
  if (guides.grid)
    for (const at of [100 / 3, 200 / 3]) {
      targets.push({ axis: "y", at, kind: "third" });
      if (sideways) targets.push({ axis: "x", at, kind: "third" });
    }
  if (guides.safeZones) {
    const safe = safeArea(aspect === "9:16" ? guides.platform : "none", aspect);
    targets.push({ axis: "y", at: safe.top * 100, kind: "safe", side: "min" }, { axis: "y", at: 100 - safe.bottom * 100, kind: "safe", side: "max" });
    if (sideways)
      targets.push({ axis: "x", at: safe.left * 100, kind: "safe", side: "min" }, { axis: "x", at: 100 - safe.right * 100, kind: "safe", side: "max" });
  }
  return targets;
}

/** The closest guide within reach on one axis (earlier ones win a tie), and the position that lands on it. */
function snapAxis(value: number, axis: "x" | "y", d: Grab, reach: number) {
  let found: { value: number; target: Target } | null = null,
    gap = reach;
  for (const target of d.targets) {
    if (target.axis !== axis || (target.side && !d.sides)) continue;
    const offset = target.side ? d.sides![axis][target.side === "min" ? 0 : 1] : 0;
    const distance = Math.abs(target.at - (value + offset));
    if (distance < gap || (!found && distance <= gap)) {
      found = { value: target.at - offset, target };
      gap = distance;
    }
  }
  return found;
}

/**
 * Direct control of the caption on the video: drag to move, a corner to resize, a side for the
 * line width, the top dot to tilt. The real caption follows the pointer live, so what you see while
 * dragging is exactly where it ends up. Nothing pushes it back: guides only help.
 *
 * A drag is shown through `onLive` (only the preview redraws) and told to the editor once, on release,
 * through `onCommit`: one undo step, and Escape leaves nothing behind.
 */
export default function CaptionCanvas({
  settings,
  cap,
  player,
  compositionWidth,
  aspect,
  guides,
  bestY,
  onLive,
  onCommit,
}: {
  /** The settings on screen, a drag under way included. */
  settings: CaptionSettings;
  cap: StyleCapabilities;
  player: PlayerRef | null;
  compositionWidth: number;
  aspect: GuideAspect;
  guides: PreviewGuides;
  /** The recommended caption height (% from the top), drawn as a guide. */
  bestY?: number;
  onLive: (patch: Patch | null) => void;
  onCommit: (patch: Patch) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const grab = useRef<Grab | null>(null);
  const held = useRef<Held | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const latest = useRef({ settings, player, cap, compositionWidth, aspect, guides, bestY, onLive, onCommit });
  useLayoutEffect(() => {
    latest.current = { settings, player, cap, compositionWidth, aspect, guides, bestY, onLive, onCommit };
  });
  const [box, setBox] = useState<Box | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(false);

  const measure = () => {
    const node = root.current;
    const area = node?.getBoundingClientRect();
    if (!node || !area?.width) return undefined;
    const now = latest.current;
    return measureCaption(node.parentElement, area, now.settings, now.compositionWidth, held);
  };
  const show = (next: Box | null | undefined) => {
    if (next === undefined) return;
    // Between captions there is nothing to hold, so no box is drawn (unless a gesture is under way).
    if (!next) {
      if (!grab.current) setBox(null);
    } else setBox((previous) => (sameBox(previous, next) ? previous : next));
  };
  const tools = useRef({ measure, show });
  useLayoutEffect(() => {
    tools.current = { measure, show };
  });

  useEffect(() => {
    if (!player) return;
    const update = () => setPlaying(player.isPlaying());
    update();
    player.addEventListener("play", update);
    player.addEventListener("pause", update);
    return () => {
      player.removeEventListener("play", update);
      player.removeEventListener("pause", update);
    };
  }, [player]);

  // Follow the rendered caption. Measuring every word costs a little, so it runs for a short while
  // after anything changes (a seek, an edit, a resize, a font or a style arriving), not on idle frames.
  useEffect(() => {
    let id = 0,
      seen = "",
      quietUntil = 0;
    let lastSettings: CaptionSettings | null = null;
    const host = root.current?.parentElement;
    // Anything redrawn in the frame (a word edited, a style that finished loading) is worth another look.
    const redrawn = new MutationObserver((records) => {
      if (records.some((record) => !root.current?.contains(record.target))) quietUntil = performance.now() + MEASURE_MS;
    });
    if (host) redrawn.observe(host, { subtree: true, childList: true, characterData: true, attributes: true });
    const tick = () => {
      id = requestAnimationFrame(tick);
      const node = root.current;
      const now = latest.current;
      if (!node || document.hidden) return;
      if (now.player?.isPlaying()) {
        seen = "";
        return;
      }
      const area = node.getBoundingClientRect();
      if (!area.width) return;
      const key = `${now.player?.getCurrentFrame() ?? 0}|${area.width}x${area.height}|${area.left},${area.top}|${document.fonts.status}`;
      const clock = performance.now();
      if (key !== seen || now.settings !== lastSettings) {
        seen = key;
        lastSettings = now.settings;
        quietUntil = clock + MEASURE_MS;
      }
      if (clock > quietUntil) return;
      tools.current.show(tools.current.measure());
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      redrawn.disconnect();
    };
  }, []);

  useEffect(() => {
    const away = (event: globalThis.PointerEvent) => {
      const target = event.target as Element;
      if (!root.current?.contains(target) && !target.closest("aside")) setSelected(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  // One change per screen frame: the newest pointer position wins, and it is on screen before that
  // frame is painted, so the caption and its box never trail the pointer.
  const pending = useRef<Step | null>(null);
  const raf = useRef(0);
  const paint = () => {
    raf.current = 0;
    const step = pending.current;
    pending.current = null;
    if (!step) return;
    flushSync(() => {
      latest.current.onLive(step.patch);
      setHud(step.hud);
    });
    // The caption is at its new spot now; the box goes around it in the same frame.
    const next = measure();
    if (next) flushSync(() => show(next));
  };
  const queue = (step: Step) => {
    pending.current = step;
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      stop.current?.();
    },
    [],
  );

  const free = (event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
    !latest.current.guides.snap || event.altKey || event.ctrlKey || event.metaKey;

  const moveTo = (event: ReactPointerEvent, d: Grab): Step => {
    const sideways = latest.current.cap.positionX;
    let dx = sideways ? event.clientX - d.px : 0;
    let dy = event.clientY - d.py;
    if (event.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    let x = d.settings.x + (dx / d.frameW) * 100,
      y = d.settings.y + (dy / d.frameH) * 100;
    const lines: Target[] = [];
    // Only the direction being dragged snaps: a straight pull down never shifts the caption sideways.
    if (!free(event)) {
      const onX = dx !== 0 ? snapAxis(x, "x", d, (SNAP_PX / d.frameW) * 100) : null;
      const onY = dy !== 0 ? snapAxis(y, "y", d, (SNAP_PX / d.frameH) * 100) : null;
      if (onX) {
        x = onX.value;
        lines.push(onX.target);
      }
      if (onY) {
        y = onY.value;
        lines.push(onY.target);
      }
    }
    x = clamp(tenth(x), 0, 100);
    y = clamp(tenth(y), 0, 100);
    return {
      patch: sideways ? { x, y } : { y },
      hud: { lines, readout: sideways ? `${Math.round(x)}%, ${Math.round(y)}%` : `${Math.round(y)}%` },
    };
  };

  // The caption grows from its middle and stays where it is; the corner follows the pointer.
  const sizeTo = (event: ReactPointerEvent, d: Grab): Step => {
    const from = Math.hypot(d.px - d.left - d.box.cx, d.py - d.top - d.box.cy);
    const to = Math.hypot(event.clientX - d.left - d.box.cx, event.clientY - d.top - d.box.cy);
    const size = clamp(Math.round(d.settings.size * (to / Math.max(8, from))), SIZE_MIN, SIZE_MAX);
    return { patch: { size }, hud: { lines: [], readout: `${size} px` } };
  };

  const widthTo = (event: ReactPointerEvent, d: Grab): Step => {
    const angle = ((d.settings.rotation ?? 0) * Math.PI) / 180;
    const along = Math.abs(
      (event.clientX - d.left - d.box.cx) * Math.cos(angle) + (event.clientY - d.top - d.box.cy) * Math.sin(angle),
    );
    const maxWidth = clamp(Math.round(((2 * along) / d.frameW) * 100) / 100, latest.current.cap.minWidth ?? 0.2, 1);
    return { patch: { maxWidth }, hud: { lines: [], readout: `${Math.round(maxWidth * 100)}%` } };
  };

  const rotateTo = (event: ReactPointerEvent, d: Grab): Step => {
    const raw = (Math.atan2(event.clientY - d.top - d.box.cy, event.clientX - d.left - d.box.cx) * 180) / Math.PI + 90;
    let rotation = Math.round(((((raw + 180) % 360) + 360) % 360) - 180);
    if (!free(event)) {
      const step = Math.round(rotation / 15) * 15;
      if (Math.abs(step - rotation) <= ROTATION_SNAP) rotation = step;
    }
    return { patch: { rotation }, hud: { lines: [], readout: `${rotation}°` } };
  };

  const finish = (cancel: boolean) => {
    const d = grab.current;
    if (!d) return;
    grab.current = null;
    stop.current?.();
    stop.current = null;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    pending.current = null;
    // One call either way: the editor hears the final value once, or the caption goes back untouched.
    if (!cancel && d.patch) latest.current.onCommit(d.patch);
    else latest.current.onLive(null);
    setMode(null);
    setHud(null);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const area = root.current?.getBoundingClientRect();
    if (!box || !area || grab.current || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Every later move and the release come here, wherever the pointer goes.
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setSelected(true);
    const now = latest.current;
    const next = ((event.target as HTMLElement).dataset?.mode as Mode | undefined) ?? "move";
    const ax = (now.settings.x / 100) * area.width,
      ay = (now.settings.y / 100) * area.height;
    grab.current = {
      mode: next,
      pointerId: event.pointerId,
      px: event.clientX,
      py: event.clientY,
      box,
      settings: now.settings,
      frameW: area.width,
      frameH: area.height,
      left: area.left,
      top: area.top,
      targets: next === "move" ? snapTargets(now.cap.positionX, now.guides, now.aspect, now.bestY) : [],
      sides: now.settings.rotation
        ? null
        : {
            x: [((box.cx - box.w / 2 - ax) / area.width) * 100, ((box.cx + box.w / 2 - ax) / area.width) * 100],
            y: [((box.cy - box.h / 2 - ay) / area.height) * 100, ((box.cy + box.h / 2 - ay) / area.height) * 100],
          },
      moved: false,
      patch: null,
    };
    const onEnd = () => finish(false);
    const onKey = (key: globalThis.KeyboardEvent) => {
      // Space would start the video under a caption that is still in hand.
      if (key.code === "Space") key.preventDefault();
      if (key.key !== "Escape") return;
      key.stopPropagation();
      finish(true);
    };
    window.addEventListener("blur", onEnd);
    window.addEventListener("keydown", onKey, true);
    stop.current = () => {
      window.removeEventListener("blur", onEnd);
      window.removeEventListener("keydown", onKey, true);
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = grab.current;
    if (!d || event.pointerId !== d.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.px, event.clientY - d.py) < DRAG_START_PX) return;
      d.moved = true;
      setMode(d.mode);
    }
    const step =
      d.mode === "move" ? moveTo(event, d) : d.mode === "size" ? sizeTo(event, d) : d.mode === "width" ? widthTo(event, d) : rotateTo(event, d);
    d.patch = step.patch;
    queue(step);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId === grab.current?.pointerId) finish(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (grab.current) return;
    if (event.key === "Escape") {
      setSelected(false);
      return;
    }
    const step = event.shiftKey ? 2 : 0.5;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = keys[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    onCommit({
      ...(cap.positionX ? { x: clamp(tenth(settings.x + delta[0]), 0, 100) } : {}),
      y: clamp(tenth(settings.y + delta[1]), 0, 100),
    });
  };

  const rotation = cap.rotation ? (settings.rotation ?? 0) : 0;
  const w = box ? Math.max(MIN_W, box.w + PAD * 2) : 0;
  const h = box ? Math.max(MIN_H, box.h + PAD * 2) : 0;
  return (
    <div ref={root} className={s.canvas}>
      {mode === "move" && (
        <>
          {cap.positionX && <span className={s.helperX} style={{ left: "50%" }} />}
          <span className={s.helperY} style={{ top: "50%" }} />
          {bestY !== undefined && (
            <span className={s.helperY} data-best style={{ top: `${bestY}%` }}>
              <em className={s.helperLabel}>Best caption spot</em>
            </span>
          )}
          {hud?.lines.map((line) => (
            <span
              key={`${line.axis}${line.at}`}
              className={line.axis === "x" ? s.lineX : s.lineY}
              style={line.axis === "x" ? { left: `${line.at}%` } : { top: `${line.at}%` }}
            />
          ))}
        </>
      )}
      {/* The box stays for the whole gesture, so the pointer it holds is never dropped. */}
      {box && (!playing || mode !== null) && (
        <div
          className={s.box}
          data-selected={selected || mode !== null}
          data-mode={mode ?? undefined}
          role="group"
          aria-label="Caption. Drag to move, arrow keys to nudge."
          tabIndex={0}
          style={{
            left: box.cx - w / 2,
            top: box.cy - h / 2,
            width: w,
            height: h,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
          }}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
        >
          {(["nw", "ne", "sw", "se"] as const).map((corner) => (
            <span key={corner} className={s.corner} data-corner={corner} data-mode="size" title="Drag to resize" />
          ))}
          {cap.width &&
            ([-1, 1] as const).map((side) => (
              <span key={side} className={s.side} data-side={side} data-mode="width" title="Drag to fit more or fewer words on a line" />
            ))}
          {cap.rotation && <span className={s.rotate} data-mode="rotate" title="Drag to tilt" />}
          {hud?.readout && <span className={s.readout}>{hud.readout}</span>}
        </div>
      )}
    </div>
  );
}
