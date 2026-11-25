"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import type { CSSProperties, PointerEvent, KeyboardEvent } from "react";
import s from "./CaptionTimeline.module.css";
import type { CaptionWordEdits } from "./captionSettings";
import type { WordForms } from "../language/languages";
import WordContextMenu from "./WordContextMenu";
import type { AIState } from "./EmphasisControls";

export type TimelineWordControls = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onHighlight: (id: string, value: boolean | undefined) => void;
  onResetWord: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  highlightsEnabled: boolean;
  aiState?: AIState;
  onRunAI?: () => void;
};

export type Cue = CaptionWordEdits & {
  id: string;
  start: number;
  end: number;
  lead?: string;
  hero: string;
  trail?: string;
  color?: string;
  /** The highlight came from the AI pass (cleared when it re-runs or the user toggles it). */
  aiEmphasis?: boolean;
  /** Set by layoutCaptionPages: the next word starts a new caption page. */
  pageBreak?: boolean;
  /** AI word group ("why not you?"): every word in the group shares this id. */
  chunkId?: string;
  /** Emoji the AI picked for this word right after transcription (Creator Emoji shows it). */
  emoji?: string;
  /** Text before the AI corrected it, shown as a hint on the clip. */
  aiOriginal?: string;
  /** The word as it was before the user retyped it; Reset puts it back. */
  original?: { lead?: string; hero: string; trail?: string };
  /** The spoken word written each way (native script, English letters, English), for the caption language looks. */
  forms?: WordForms;
  /** Preview only (never saved): in Mix captions, the English form this word shows when it is a key or main word. */
  mix?: string;
  /** Preview only: in Mix captions, the word in English letters, for lines a design sets in English letters. */
  latin?: string;
};

/** Timeline zoom: from the whole video in view to a few words filling it. */
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;

type Props = TimelineWordControls & {
  cues: Cue[];
  onChange: (cues: Cue[]) => void;
  time: number;
  duration: number;
  playing: boolean;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
};

const words = (cue: Cue) =>
  [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" ");

const stamp = (time: number) => {
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const stampMs = (time: number) => {
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  const hundredths = Math.floor((Math.max(0, time) % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const TRACK_PAD_LEFT = 20;

function cueAt(cues: Cue[], time: number) {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].start > time) high = middle - 1;
    else low = middle + 1;
  }
  const cue = cues[high];
  return cue && time < cue.end ? cue : undefined;
}

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.4 3.9 1.6 6.1 3.4 7.6 1.6 1.3 3.6 1.8 6.1 1.9-2.5.1-4.5.6-6.1 1.9-1.8 1.5-3 3.7-3.4 7.6-.4-3.9-1.6-6.1-3.4-7.6C7 12.6 5 12.1 2.5 12c2.5-.1 4.5-.6 6.1-1.9C10.4 8.6 11.6 6.4 12 2.5Z" />
    </svg>
  );
}

type ClipEvents = {
  drag: (event: PointerEvent<HTMLDivElement>, cue: Cue, kind: "move" | "start" | "end") => void;
  select: (cue: Cue) => void;
  menu: (cue: Cue, x: number, y: number) => void;
};

/** Repaints only when this clip changes, not on every playback frame. */
const Clip = memo(function Clip({
  cue,
  left,
  width,
  selected,
  active,
  emphasized,
  events,
}: {
  cue: Cue;
  left: number;
  width: number;
  selected: boolean;
  active: boolean;
  emphasized: boolean;
  events: { current: ClipEvents };
}) {
  return (
    <div
      data-cue={cue.id}
      className={`${s.clip} ${selected ? s.selected : ""} ${active ? s.activeCue : ""} ${emphasized ? s.emphasis : ""}`}
      style={
        {
          left,
          width,
          "--clip-color": cue.color && cue.color !== "none" ? cue.color : undefined,
        } as CSSProperties
      }
      onPointerDown={(event) => events.current.drag(event, cue, "move")}
      onClick={(event) => {
        if (event.detail === 0) events.current.select(cue);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        events.current.menu(cue, event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.code === "Space") {
          event.preventDefault();
          event.stopPropagation();
          events.current.select(cue);
        }
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          events.current.menu(cue, rect.left, rect.bottom + 4);
        }
      }}
      aria-pressed={selected}
      role="button"
      tabIndex={0}
      aria-label={`${words(cue)}, ${stampMs(cue.start)} to ${stampMs(cue.end)}`}
      title={words(cue)}
    >
      <div
        className={s.leftHandle}
        onPointerDown={(event) => events.current.drag(event, cue, "start")}
        title="Drag to trim start"
      >
        <div className={s.handleBar} />
      </div>
      {/* A clip too narrow for a letter shows only its color; the word is in its tooltip. */}
      {width >= 22 && <span className={s.words}>{words(cue)}</span>}
      <div
        className={s.rightHandle}
        onPointerDown={(event) => events.current.drag(event, cue, "end")}
        title="Drag to trim end"
      >
        <div className={s.handleBar} />
      </div>
    </div>
  );
});

export default function CaptionTimeline({
  cues,
  onChange,
  time,
  duration,
  playing,
  onSeek,
  onPlay,
  onPause,
  selectedId,
  onSelect,
  onEdit,
  onHighlight,
  onResetWord,
  onUndo,
  onRedo,
  highlightsEnabled,
  aiState,
  onRunAI,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(800);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<Cue | null>(null);

  // Dedicated scroll rail state
  const [scrollProgress, setScrollProgress] = useState({
    leftRatio: 0,
    widthRatio: 1,
  });
  const railDragging = useRef<{
    startX: number;
    startScrollLeft: number;
  } | null>(null);

  // Active clip under playhead
  const sortedCues = useMemo(
    () => [...cues].sort((a, b) => a.start - b.start),
    [cues],
  );
  const activeCue = cueAt(sortedCues, time);
  const emphasisCount = useMemo(
    () => cues.filter((cue) => cue.highlighted === true).length,
    [cues],
  );
  const clipEvents = useRef<ClipEvents>({ drag() {}, select() {}, menu() {} });
  const selected = selectedId;

  // Drag tracking state
  const drag = useRef<{
    cue: Cue;
    startClientX: number;
    startSurfaceX: number;
    startCueStart: number;
    startCueEnd: number;
    kind: "move" | "start" | "end";
    min: number;
    max: number;
    changed: boolean;
  } | null>(null);

  // Scrubber drag tracking
  const scrubDrag = useRef<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const currentPointerX = useRef<number>(0);
  const autoScrollRaf = useRef<number | null>(null);

  const total = useMemo(
    () =>
      cues.reduce((end, cue) => Math.max(end, cue.end), Math.max(duration, 1)),
    [duration, cues],
  );
  // Word clips need enough horizontal room to remain readable when zoomed out.
  const basePxPerSec = Math.min(
    150,
    Math.max(110, (viewWidth - TRACK_PAD_LEFT * 2) / 4),
  );
  const px = basePxPerSec * zoom;
  const contentWidth = total * px;
  const surfaceWidth = contentWidth + TRACK_PAD_LEFT * 2;
  const tick = px >= 80 ? 1 : px >= 35 ? 2 : 5;
  const minorTick = tick / 4;
  const visibleStart = Math.max(0, (scrollOffset - TRACK_PAD_LEFT - 300) / px);
  const visibleEnd = (scrollOffset + viewWidth + 300 - TRACK_PAD_LEFT) / px;
  const firstTick = Math.max(0, Math.floor(visibleStart / minorTick));
  const lastTick = Math.min(
    Math.floor(total / minorTick),
    Math.ceil(visibleEnd / minorTick),
  );
  const visibleCues = useMemo(
    () =>
      cues.filter((cue) => cue.end >= visibleStart && cue.start <= visibleEnd),
    [cues, visibleStart, visibleEnd],
  );

  /* ── Update custom scroll rail state ── */
  const updateScrollRail = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollOffset(scrollLeft);
    if (scrollWidth <= clientWidth) {
      setScrollProgress({ leftRatio: 0, widthRatio: 1 });
    } else {
      const widthRatio = Math.max(0.08, clientWidth / scrollWidth);
      const leftRatio =
        (scrollLeft / (scrollWidth - clientWidth)) * (1 - widthRatio);
      setScrollProgress({ leftRatio, widthRatio });
    }
  }, []);

  /* ── Resize observer & wheel scroll / zoom ── */
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewWidth(element.clientWidth);
      updateScrollRail();
    });
    observer.observe(element);

    const onScroll = () => updateScrollRail();
    element.addEventListener("scroll", onScroll, { passive: true });

    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom((value) =>
          clamp(value * (event.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM),
        );
      } else if (event.deltaX) {
        element.scrollLeft += event.deltaX;
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });

    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("wheel", wheel);
    };
  }, [updateScrollRail]);

  /* ── Follow the playhead continuously once it reaches the right third ── */
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const x = time * px + TRACK_PAD_LEFT;
    if (!playing) {
      if (scrubDrag.current || drag.current) return;
      if (
        x < element.scrollLeft ||
        x > element.scrollLeft + element.clientWidth
      ) {
        element.scrollTo({
          left: Math.max(0, x - element.clientWidth * 0.5),
          behavior: "smooth",
        });
      }
      return;
    }
    const edge = element.scrollLeft + element.clientWidth * 0.7;
    if (x > edge || x < element.scrollLeft) {
      const target = Math.max(0, x - element.clientWidth * 0.7);
      element.scrollLeft += (target - element.scrollLeft) * 0.24;
    }
  }, [time, px, playing]);

  /* ── Calculation of drag preview based on pointer & track position ── */
  const computeDragCue = useCallback(
    (clientX: number): Cue | null => {
      const state = drag.current;
      const el = viewport.current;
      if (!state || !el) return null;

      const rect = el.getBoundingClientRect();
      const currentSurfaceX = clientX - rect.left + el.scrollLeft;
      const deltaSurfaceX = currentSurfaceX - state.startSurfaceX;
      const deltaTime = deltaSurfaceX / px;

      const cue = { ...state.cue };
      const durationOfCue = state.startCueEnd - state.startCueStart;

      if (state.kind === "move") {
        let nextStart = clamp(
          state.startCueStart + deltaTime,
          state.min,
          state.max - durationOfCue,
        );
        if (Math.abs(nextStart - state.min) < 0.08) nextStart = state.min;
        if (Math.abs(nextStart + durationOfCue - state.max) < 0.08)
          nextStart = state.max - durationOfCue;
        cue.start = Math.round(nextStart * 100) / 100;
        cue.end = Math.round((nextStart + durationOfCue) * 100) / 100;
      } else if (state.kind === "start") {
        let nextStart = clamp(
          state.startCueStart + deltaTime,
          state.min,
          state.startCueEnd - 0.2,
        );
        if (Math.abs(nextStart - state.min) < 0.08) nextStart = state.min;
        cue.start = Math.round(nextStart * 100) / 100;
        cue.end = state.startCueEnd;
      } else if (state.kind === "end") {
        let nextEnd = clamp(
          state.startCueEnd + deltaTime,
          state.startCueStart + 0.2,
          state.max,
        );
        if (Math.abs(nextEnd - state.max) < 0.08) nextEnd = state.max;
        cue.start = state.startCueStart;
        cue.end = Math.round(nextEnd * 100) / 100;
      }

      return cue;
    },
    [px],
  );

  /* ── Accelerated edge auto-scroll loop during drag ── */
  const runAutoScroll = useCallback(
    function scrollEdge() {
      const el = viewport.current;
      if (!el || (!drag.current && !scrubDrag.current)) return;

      const rect = el.getBoundingClientRect();
      const ptrX = currentPointerX.current;
      const edgeZone = 60;
      const minSpeed = 3;
      const maxSpeed = 24;

      let speed = 0;
      if (ptrX < rect.left + edgeZone) {
        const distance = rect.left + edgeZone - ptrX;
        const ratio = clamp(distance / edgeZone, 0, 1.5);
        speed = -(minSpeed + Math.pow(ratio, 1.8) * (maxSpeed - minSpeed));
      } else if (ptrX > rect.right - edgeZone) {
        const distance = ptrX - (rect.right - edgeZone);
        const ratio = clamp(distance / edgeZone, 0, 1.5);
        speed = minSpeed + Math.pow(ratio, 1.8) * (maxSpeed - minSpeed);
      }

      if (speed !== 0) {
        const prevScroll = el.scrollLeft;
        el.scrollLeft += speed;
        if (el.scrollLeft !== prevScroll) {
          if (drag.current) {
            const nextCue = computeDragCue(ptrX);
            if (nextCue) {
              drag.current.changed = true;
              setDragPreview(nextCue);
            }
          } else if (scrubDrag.current) {
            const curSurfaceX = ptrX - rect.left + el.scrollLeft;
            const targetTime = clamp(
              (curSurfaceX - TRACK_PAD_LEFT) / px,
              0,
              total,
            );
            onSeek(targetTime);
          }
        }
      }

      autoScrollRaf.current = requestAnimationFrame(scrollEdge);
    },
    [computeDragCue, onSeek, px, total],
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  const commit = onChange;

  function select(cue: Cue) {
    onPause();
    // A word's first frame is before its entrance has drawn anything, so land a little into it.
    onSeek(Math.max(cue.start, Math.min(cue.start + 0.3, cue.end - 0.02)));
    onSelect(cue.id);
  }

  function remove() {
    const chosen = cues.find((c) => c.id === selected);
    if (!chosen || cues.length <= 1) return;
    const next = cues.filter((cue) => cue.id !== chosen.id);
    commit(next);
    const fallbackIdx = Math.min(cues.indexOf(chosen), next.length - 1);
    select(next[fallbackIdx]);
  }

  /* ── Navigate between captions ── */
  function goToCaption(direction: "prev" | "next") {
    onPause();
    const sorted = [...cues].sort((a, b) => a.start - b.start);
    const idx = sorted.findIndex((c) => c.id === (selected ?? activeCue?.id));
    if (direction === "prev") {
      const target = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];
      if (target) select(target);
    } else {
      const target =
        idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : sorted[0];
      if (target) select(target);
    }
  }

  function beginDrag(
    event: PointerEvent<HTMLDivElement>,
    cue: Cue,
    kind: "move" | "start" | "end",
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    select(cue);
    if (event.shiftKey && kind === "move") {
      if (highlightsEnabled) onHighlight(cue.id, cue.highlighted === true ? false : true);
      return;
    }

    const el = viewport.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const surfaceX = event.clientX - rect.left + el.scrollLeft;

    const sorted = [...cues].sort((a, b) => a.start - b.start);
    const index = sorted.findIndex((c) => c.id === cue.id);

    drag.current = {
      cue,
      startClientX: event.clientX,
      startSurfaceX: surfaceX,
      startCueStart: cue.start,
      startCueEnd: cue.end,
      kind,
      min: sorted[index - 1]?.end ?? 0,
      max: sorted[index + 1]?.start ?? total,
      changed: false,
    };

    currentPointerX.current = event.clientX;
    stopAutoScroll();
    autoScrollRaf.current = requestAnimationFrame(runAutoScroll);
  }

  const finishDrag = useCallback(() => {
    stopAutoScroll();
    if (drag.current?.changed && dragPreview) {
      commit(
        cues.map((cue) => (cue.id === dragPreview.id ? dragPreview : cue)),
      );
      onSeek(dragPreview.start);
    }
    drag.current = null;
    setDragPreview(null);
    scrubDrag.current = false;
    setIsScrubbing(false);
    railDragging.current = null;
  }, [cues, dragPreview, stopAutoScroll, onSeek, commit]);

  /* ── Window level drag listeners ── */
  useEffect(() => {
    const onWindowPointerMove = (e: globalThis.PointerEvent) => {
      currentPointerX.current = e.clientX;

      if (railDragging.current && viewport.current) {
        const deltaX = e.clientX - railDragging.current.startX;
        const el = viewport.current;
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          const ratio = deltaX / el.clientWidth;
          el.scrollLeft =
            railDragging.current.startScrollLeft + ratio * maxScroll;
        }
        return;
      }

      if (scrubDrag.current && viewport.current) {
        const rect = viewport.current.getBoundingClientRect();
        const curSurfaceX = e.clientX - rect.left + viewport.current.scrollLeft;
        const targetTime = clamp((curSurfaceX - TRACK_PAD_LEFT) / px, 0, total);
        onSeek(targetTime);
        return;
      }

      if (!drag.current) return;

      if (
        !drag.current.changed &&
        Math.abs(e.clientX - drag.current.startClientX) < 3
      ) {
        return;
      }
      drag.current.changed = true;

      const nextCue = computeDragCue(e.clientX);
      if (nextCue) {
        setDragPreview(nextCue);
      }
    };

    const onWindowPointerUp = () => {
      if (drag.current || scrubDrag.current || railDragging.current) {
        finishDrag();
      }
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
    };
  }, [computeDragCue, finishDrag, onSeek, px, total]);

  function handleScrubStart(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-cue]")) return;
    if (event.button !== 0) return;
    onPause();
    scrubDrag.current = true;
    currentPointerX.current = event.clientX;

    const el = viewport.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const surfaceX = event.clientX - rect.left + el.scrollLeft;
    const targetTime = clamp((surfaceX - TRACK_PAD_LEFT) / px, 0, total);
    onSeek(targetTime);

    stopAutoScroll();
    autoScrollRaf.current = requestAnimationFrame(runAutoScroll);
  }

  function handlePlayheadPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    onPause();
    scrubDrag.current = true;
    setIsScrubbing(true);
    currentPointerX.current = event.clientX;
    stopAutoScroll();
    autoScrollRaf.current = requestAnimationFrame(runAutoScroll);
  }

  /* ── Dedicated Rail Scroll Actions ── */
  function scrollRailStep(direction: -1 | 1) {
    if (!viewport.current) return;
    viewport.current.scrollBy({ left: direction * 150, behavior: "smooth" });
  }

  function handleRailThumbPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (!viewport.current) return;
    railDragging.current = {
      startX: e.clientX,
      startScrollLeft: viewport.current.scrollLeft,
    };
  }

  function handleRailGroovePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!viewport.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const maxScroll =
      viewport.current.scrollWidth - viewport.current.clientWidth;
    viewport.current.scrollTo({
      left: clickRatio * maxScroll,
      behavior: "smooth",
    });
  }

  useLayoutEffect(() => {
    clipEvents.current = {
      drag: beginDrag,
      select,
      menu(cue, x, y) {
        select(cue);
        setContextMenu({ id: cue.id, x, y });
      },
    };
  });

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      (event.target as HTMLElement).closest(
        'input, textarea, select, [role="menu"]',
      )
    )
      return;
    if (event.code === "Space") {
      event.preventDefault();
      if (playing) onPause();
      else onPlay();
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove();
    }
    if (event.key === "Escape") setContextMenu(null);
    if (event.key === "F2" && selected) {
      event.preventDefault();
      onEdit(selected);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) onRedo();
      else onUndo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      onRedo();
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onPause();
      const delta =
        (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1.0 : 0.1);
      onSeek(clamp(time + delta, 0, total));
    }
  }

  return (
    <section
      className={s.timeline}
      style={{ "--track-inset": `${TRACK_PAD_LEFT}px` } as CSSProperties}
      aria-label="Caption timeline"
      data-highlights-enabled={highlightsEnabled}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* ── TIMELINE TRACK SCROLLER ── */}
      <div className={s.scroll} ref={viewport}>
        <div className={s.track} style={{ width: surfaceWidth }}>
          <div className={s.surface} onPointerDown={handleScrubStart}>
            {/* Ruler Ticks */}
            <div className={s.ruler}>
              {Array.from(
                { length: Math.max(0, lastTick - firstTick + 1) },
                (_, offset) => {
                  const index = firstTick + offset;
                  const tickTime = index * minorTick;
                  const tickX = TRACK_PAD_LEFT + tickTime * px;
                  const major = index % 4 === 0;
                  return (
                    <span
                      key={index}
                      className={major ? s.majorTick : s.minorTick}
                      style={{ left: tickX }}
                    >
                      {major && (
                        <span
                          className={
                            index === 0 ? s.firstTickLabel : s.tickLabel
                          }
                        >
                          {stamp(tickTime)}
                        </span>
                      )}
                    </span>
                  );
                },
              )}
            </div>

            {/* Caption Clips Lane */}
            <div className={s.lane}>
              {visibleCues.map((original) => {
                const cue =
                  dragPreview?.id === original.id ? dragPreview : original;
                const isSelected = selected === cue.id;

                return (
                  <Clip
                    key={cue.id}
                    cue={cue}
                    left={TRACK_PAD_LEFT + cue.start * px}
                    width={Math.max(20, (cue.end - cue.start) * px - 3)}
                    selected={isSelected}
                    active={activeCue?.id === cue.id}
                    emphasized={highlightsEnabled && cue.highlighted === true}
                    events={clipEvents}
                  />
                );
              })}
            </div>

            {/* Playhead Scrubber */}
            <div
              className={`${s.playhead} ${isScrubbing ? s.grabbing : ""}`}
              style={{
                left: TRACK_PAD_LEFT,
                transform: `translate3d(${clamp(time, 0, total) * px}px, 0, 0)`,
              }}
              onPointerDown={handlePlayheadPointerDown}
              title={`Drag playhead: ${stampMs(time)}`}
            >
              <div className={s.playheadHead} />
              <div className={s.playheadLine} />
            </div>
          </div>
        </div>
      </div>

      {/* ── TRACK RAIL / TIMELINE SCROLLBAR ── */}
      <div className={s.trackRail}>
        <button
          className={s.railArrow}
          onClick={() => scrollRailStep(-1)}
          aria-label="Scroll timeline left"
          title="Scroll left"
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          className={s.railGroove}
          onPointerDown={handleRailGroovePointerDown}
        >
          <div
            className={s.railThumb}
            style={{
              left: `${scrollProgress.leftRatio * 100}%`,
              width: `${scrollProgress.widthRatio * 100}%`,
            }}
            onPointerDown={handleRailThumbPointerDown}
          />
        </div>

        <button
          className={s.railArrow}
          onClick={() => scrollRailStep(1)}
          aria-label="Scroll timeline right"
          title="Scroll right"
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* ── BOTTOM CONTROL / TRANSPORT BAR ── */}
      <div className={s.transport}>
        <div className={s.transportLeft}>
          {onRunAI && (
            <button
              type="button"
              className={s.aiChip}
              data-status={aiState?.status ?? "idle"}
              onClick={onRunAI}
              disabled={aiState?.status === "running"}
              title={
                aiState?.status === "error"
                  ? aiState.message
                  : "Run the AI pass: punctuation, numbers, emphasis words and phrases"
              }
            >
              <SparkIcon />
              {aiState?.status === "running"
                ? "Analyzing…"
                : aiState?.status === "error"
                  ? "Retry AI"
                  : aiState?.status === "done"
                    ? "Re-run AI"
                    : "AI pass"}
            </button>
          )}
          {!onRunAI && aiState?.status === "running" && (
            <span className={s.aiChip} data-status="running" title="The AI is adding punctuation and marking key words">
              <SparkIcon />
              Finding key words…
            </span>
          )}
          {highlightsEnabled && (
            <span className={s.legend} title="Emphasis words on the timeline">
              <i aria-hidden="true" />
              {emphasisCount} emphasis
            </span>
          )}
        </div>

        {/* Center: Playback Controls (|< , ▶ , >|) */}
        <div className={s.playbackGroup}>
          {/* Previous Segment Button */}
          <button
            className={s.controlBtn}
            onClick={() => goToCaption("prev")}
            title="Previous caption (Shift+Left)"
            aria-label="Previous caption"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="5" width="2.5" height="14" />
              <path d="M19 6.27V17.73C19 18.52 18.12 18.99 17.46 18.55L8.87 12.82C8.28 12.43 8.28 11.57 8.87 11.18L17.46 5.45C18.12 5.01 19 5.48 19 6.27Z" />
            </svg>
          </button>

          {/* Play / Pause Button */}
          <button
            className={s.playPauseBtn}
            onClick={playing ? onPause : onPlay}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#121212">
                <rect x="6" y="5" width="3.5" height="14" />
                <rect x="14.5" y="5" width="3.5" height="14" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#121212">
                <path d="M7.5 5.2C7.5 4.4 8.4 3.9 9.1 4.3L19.2 11.1C19.8 11.5 19.8 12.5 19.2 12.9L9.1 19.7C8.4 20.1 7.5 19.6 7.5 18.8V5.2Z" />
              </svg>
            )}
          </button>

          {/* Next Segment Button */}
          <button
            className={s.controlBtn}
            onClick={() => goToCaption("next")}
            title="Next caption (Shift+Right)"
            aria-label="Next caption"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 6.27V17.73C5 18.52 5.88 18.99 6.54 18.55L15.13 12.82C15.72 12.43 15.72 11.57 15.13 11.18L6.54 5.45C5.88 5.01 5 5.48 5 6.27Z" />
              <rect x="17.5" y="5" width="2.5" height="14" />
            </svg>
          </button>
        </div>

        {/* Right: zoom (also Ctrl + wheel) and the time */}
        <div className={s.transportRight}>
        <div className={s.zoom} role="group" aria-label="Timeline zoom">
          <button type="button" onClick={() => setZoom((value) => clamp(value / 1.3, MIN_ZOOM, MAX_ZOOM))}
            disabled={zoom <= MIN_ZOOM + 1e-3} aria-label="Zoom out" title="Zoom out (Ctrl + scroll)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <input type="range" min={0} max={100} step={1} aria-label="Timeline zoom"
            value={Math.round(((Math.log(zoom) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))) * 100)}
            style={{ "--to": `${((Math.log(zoom) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))) * 100}%` } as CSSProperties}
            onChange={(event) => setZoom(Math.exp(Math.log(MIN_ZOOM) + (Number(event.target.value) / 100) * (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))))} />
          <button type="button" onClick={() => setZoom((value) => clamp(value * 1.3, MIN_ZOOM, MAX_ZOOM))}
            disabled={zoom >= MAX_ZOOM - 1e-3} aria-label="Zoom in" title="Zoom in (Ctrl + scroll)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
          </button>
          <button type="button" className={s.zoomFit} title="Show the whole video"
            onClick={() => setZoom(clamp((viewWidth - TRACK_PAD_LEFT * 2) / (total * basePxPerSec), MIN_ZOOM, MAX_ZOOM))}>
            Fit
          </button>
        </div>
        <div className={s.timeDisplay}>
          <span className={s.timeCurrent}>{stampMs(time)}</span>
          <span className={s.timeDivider}>/</span>
          <span className={s.timeTotal}>{stampMs(duration)}</span>
        </div>
        </div>
      </div>
      {contextMenu && cues.find((cue) => cue.id === contextMenu.id) && (
        <WordContextMenu
          word={cues.find((cue) => cue.id === contextMenu.id)!}
          x={contextMenu.x}
          y={contextMenu.y}
          onHighlight={highlightsEnabled ? (value) => onHighlight(contextMenu.id, value) : undefined}
          onEdit={() => onEdit(contextMenu.id)}
          onReset={() => onResetWord(contextMenu.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
}
