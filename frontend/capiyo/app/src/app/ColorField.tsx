"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorInput, HexColorPicker } from "react-colorful";
import s from "./ColorField.module.css";

export default function ColorField({
  color,
  onChange,
  label,
}: {
  color: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  }>();
  const field = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  // The picker follows the pointer instantly; the app and video catch up once per frame.
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef("");
  const frame = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shown = draft ?? color;
  const change = (value: string) => {
    const next = /^#[a-f0-9]{3}$/i.test(value)
      ? "#" +
        value
          .slice(1)
          .split("")
          .map((character) => character + character)
          .join("")
      : value;
    setDraft(next);
    pending.current = next;
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        onChange(pending.current);
      });
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setDraft(null), 300);
  };
  useEffect(() => () => clearTimeout(settle.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = field.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(286, Math.max(250, rect.width));
      const height = popup.current?.offsetHeight || 224;
      setPosition({
        width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top:
          rect.bottom + height + 14 < window.innerHeight
            ? rect.bottom + 7
            : Math.max(8, rect.top - height - 7),
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !field.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    place();
    const observer = new ResizeObserver(place);
    if (field.current) observer.observe(field.current);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <>
      <div ref={field} className={s.field}>
        <button
          ref={trigger}
          className={s.swatch}
          type="button"
          style={{ background: shown }}
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen(!open)}
        />
        <HexColorInput
          color={shown}
          onChange={change}
          prefixed
          aria-label={`${label} hex`}
        />
        <button
          className={s.expand}
          type="button"
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </div>
      {open &&
        position &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            aria-label={`${label} picker`}
            className={s.popup}
            style={position}
          >
            <div className={s.header}>
              <span>{label}</span>
              <span className={s.current}>{shown.toUpperCase()}</span>
              <button
                type="button"
                aria-label="Close color picker"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                ×
              </button>
            </div>
            <HexColorPicker color={shown} onChange={change} />
          </div>,
          document.body,
        )}
    </>
  );
}
