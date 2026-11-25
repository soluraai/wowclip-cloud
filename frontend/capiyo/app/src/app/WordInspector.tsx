"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Cue } from "./CaptionTimeline";
import { cueText, hasCustomFormat, type EditScope } from "../editor/words";
import s from "./WordInspector.module.css";
export type WordEditingContext = {
  word: Cue | null;
  scope: EditScope;
  focusRequest: number;
  /** False when the style formats all its words together. */
  wordFormat: boolean;
  revision?: number;
  onClose: () => void;
  onText: (text: string) => string | null;
  onReset: () => void;
  /** Missing when the style has no key words. */
  emphasis?: { on: boolean; onToggle: () => void };
  /** This word moves as part of the design, so it takes no motion of its own. */
  fixedMotion?: boolean;
};
export default function WordInspector({
  context,
}: {
  context: WordEditingContext;
}) {
  const { word, scope } = context;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef({ draft, save: context.onText });
  useLayoutEffect(() => {
    pending.current = { draft, save: context.onText };
  }, [draft, context.onText]);
  // Timeline selection changes on pointer-down, before the old input can blur.
  // Keep a valid pending edit when its inspector is replaced by another word.
  useEffect(
    () => () => {
      const edit = pending.current;
      if (edit.draft !== null) edit.save(edit.draft);
    },
    [],
  );
  useEffect(() => {
    if (context.focusRequest) {
      input.current?.focus();
      input.current?.select();
    }
  }, [context.focusRequest]);
  if (!word) return null;
  function save() {
    if (draft === null) return;
    const error = context.onText(draft);
    setError(error ?? "");
    if (!error) setDraft(null);
  }
  return (
    <div className={s.inspector}>
      <div className={s.heading}>
        <span>{scope === "word" ? "Editing word style" : "Editing word"}</span>
        <em>{scope === "word" ? "Styles apply to this word only" : "Style changes apply to all words"}</em>
      </div>
      <input
        ref={input}
        id="selected-word-text"
        aria-label="Selected word text"
        value={draft ?? cueText(word)}
        maxLength={400}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            setError("");
          }
        }}
      />
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {context.emphasis && (
        <button
          type="button"
          className={s.action}
          aria-pressed={context.emphasis.on}
          onClick={context.emphasis.onToggle}
        >
          {context.emphasis.on ? "Remove emphasis" : "Emphasize this word"}
        </button>
      )}
      {hasCustomFormat(word) && (
        <button type="button" className={s.action} onClick={context.onReset}>
          Reset this word
        </button>
      )}
      <button type="button" className={s.clear} onClick={context.onClose}>
        Back to all captions
      </button>
    </div>
  );
}
