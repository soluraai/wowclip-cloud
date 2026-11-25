"use client";
import { useCallback, useRef, useState } from "react";
import type { Cue } from "../app/CaptionTimeline";
import type { CaptionSettings } from "../app/captionSettings";
import type { VideoFrameSettings } from "../app/videoSettings";

export type EditorSnapshot = { cues: Cue[]; settings: CaptionSettings; styleId: string; video: VideoFrameSettings };
const LIMIT = 80;
const BATCH_MS = 600;

/** Undo steps back through the user's own edits to the words and settings of the current style. */
export function useEditorHistory(initial: () => EditorSnapshot) {
  const [state, setState] = useState(initial);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const current = useRef(state);
  const past = useRef<EditorSnapshot[]>([]),
    future = useRef<EditorSnapshot[]>([]);
  const batch = useRef({ key: "", at: 0 });
  const apply = useCallback((next: EditorSnapshot) => {
    current.current = next;
    setState(next);
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);
  const commit = useCallback(
    (next: EditorSnapshot, group: string) => {
      const now = Date.now();
      // Repeated edits to one control (a color drag, a slider) form a single undo step.
      if (batch.current.key !== group || now - batch.current.at > BATCH_MS)
        past.current = [...past.current.slice(-(LIMIT - 1)), current.current];
      batch.current = { key: group, at: now };
      future.current = [];
      apply(next);
    },
    [apply],
  );
  const changeCues = useCallback(
    (value: Cue[] | ((previous: Cue[]) => Cue[]), group = "timeline") => {
      const before = current.current.cues;
      const next = typeof value === "function" ? value(before) : value;
      if (
        next === before ||
        (next.length === before.length && next.every((cue, index) => cue === before[index]))
      )
        return;
      commit({ ...current.current, cues: next }, group);
    },
    [commit],
  );
  const changeSettings = useCallback(
    (value: CaptionSettings | ((previous: CaptionSettings) => CaptionSettings)) => {
      const before = current.current.settings;
      const next = typeof value === "function" ? value(before) : value;
      const changed = (Object.keys({ ...before, ...next }) as (keyof CaptionSettings)[])
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(next[key]));
      if (!changed.length) return;
      commit({ ...current.current, settings: next }, `settings:${changed.join()}`);
    },
    [commit],
  );
  /** Video framing, shades and scene cuts; one drag or slider makes one undo step. */
  const changeVideo = useCallback(
    (value: VideoFrameSettings | ((previous: VideoFrameSettings) => VideoFrameSettings), group = "video") => {
      const before = current.current.video;
      const next = typeof value === "function" ? value(before) : value;
      if (next === before || JSON.stringify(next) === JSON.stringify(before)) return;
      commit({ ...current.current, video: next }, group);
    },
    [commit],
  );
  /** Moves to a new starting point, like a new style or an AI pass; Undo never crosses it. */
  const replace = useCallback(
    (patch: Partial<EditorSnapshot>) => {
      past.current = [];
      future.current = [];
      batch.current = { key: "", at: 0 };
      apply({ ...current.current, ...patch });
    },
    [apply],
  );
  const restore = useCallback(
    (next: EditorSnapshot) => {
      past.current = [];
      future.current = [];
      batch.current = { key: "", at: 0 };
      apply(next);
    },
    [apply],
  );
  const undo = useCallback(() => {
    const next = past.current.pop();
    if (!next) return;
    future.current.push(current.current);
    batch.current = { key: "", at: 0 };
    apply(next);
  }, [apply]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    batch.current = { key: "", at: 0 };
    apply(next);
  }, [apply]);
  return {
    ...state,
    changeCues,
    changeSettings,
    changeVideo,
    replace,
    restore,
    undo,
    redo,
    canUndo: depth.undo > 0,
    canRedo: depth.redo > 0,
  };
}
