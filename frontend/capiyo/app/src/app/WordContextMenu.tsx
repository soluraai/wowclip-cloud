"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Cue } from "./CaptionTimeline";
import { cueText } from "../editor/words";
import s from "./WordContextMenu.module.css";
export default function WordContextMenu({
  word,
  x,
  y,
  onHighlight,
  onEdit,
  onReset,
  onClose,
}: {
  word: Cue;
  x: number;
  y: number;
  /** Missing when the style has no key words. */
  onHighlight?: (value: boolean | undefined) => void;
  onEdit: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 160;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - 206)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const act = (fn: () => void) => {
    fn();
    onClose();
  };
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Word actions for ${cueText(word)}`}
      className={s.menu}
      style={position}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || event.key === "Tab") onClose();
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const buttons = [
            ...ref.current!.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      <div className={s.word}>{cueText(word)}</div>
      {onHighlight && (
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            act(() => onHighlight(word.highlighted === true ? false : true))
          }
        >
          <span className={s.mark}>◆</span>
          {word.highlighted === true ? "Remove from key words" : "Make key word"}
          <kbd>Shift-click</kbd>
        </button>
      )}
      {onHighlight && word.highlighted !== undefined && (
        <button
          type="button"
          role="menuitem"
          onClick={() => act(() => onHighlight(undefined))}
        >
          Use template highlight
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => act(onEdit)}>
        Edit word text<kbd>F2</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!word.format && !word.highlight && !word.color}
        onClick={() => act(onReset)}
      >
        Reset word formatting
      </button>
    </div>,
    document.body,
  );
}
