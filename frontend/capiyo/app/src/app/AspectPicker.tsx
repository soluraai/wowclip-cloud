"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import s from "./AspectPicker.module.css";

/** Output shapes people post in, with where each one is used. */
const SHAPES: { w: number; h: number; use: string }[] = [
  { w: 9, h: 16, use: "Reels, TikTok, Shorts" },
  { w: 4, h: 5, use: "Instagram feed" },
  { w: 1, h: 1, use: "Square post" },
  { w: 16, h: 9, use: "YouTube" },
  { w: 3, h: 4, use: "Portrait" },
  { w: 4, h: 3, use: "Classic" },
  { w: 2, h: 3, use: "Pinterest" },
  { w: 21, h: 9, use: "Cinema" },
];

const close = (a: number, b: number) => Math.abs(a / b - 1) < 0.012;
/** "16:9" for a known shape, else "1.85:1". */
export const ratioName = (ratio: number) => {
  const known = SHAPES.find((shape) => close(shape.w / shape.h, ratio));
  if (known) return `${known.w}:${known.h}`;
  return ratio >= 1 ? `${+ratio.toFixed(2)}:1` : `1:${+(1 / ratio).toFixed(2)}`;
};

/** A small rectangle in the shape, so the choice is seen, not just read. */
const Shape = ({ ratio, size = 18 }: { ratio: number; size?: number }) => {
  const w = ratio >= 1 ? size : Math.max(5, size * ratio);
  const h = ratio >= 1 ? Math.max(5, size / ratio) : size;
  return <span className={s.shapeBox} style={{ width: size, height: size }}><i className={s.shape} style={{ width: w, height: h }} /></span>;
};

/**
 * The video's output shape, in the preview toolbar. "Original" is the upload's own shape; any other shape puts the
 * whole video in the middle of the new frame (no crop, no stretch), to zoom and move in the Video tab.
 */
export default function AspectPicker({ value, original, onChange }: {
  /** Width / height picked; undefined = the upload's own shape. */
  value?: number;
  original: number;
  onChange: (ratio: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ w: "", h: "" });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ top: 0, left: 0 });
  const current = value ?? original;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 252;
      setAt({ top: rect.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const shut = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", shut);
    document.addEventListener("keydown", shut);
    return () => {
      document.removeEventListener("pointerdown", shut);
      document.removeEventListener("keydown", shut);
    };
  }, [open]);

  const pick = (ratio: number | undefined) => {
    onChange(ratio === undefined || close(ratio, original) ? undefined : ratio);
    setOpen(false);
  };
  const w = Number(custom.w), h = Number(custom.h);
  const customOk = w > 0 && h > 0 && w / h >= 0.25 && w / h <= 4;

  return (
    <>
      <button ref={button} type="button" className={s.button} aria-expanded={open} title="Video shape (aspect ratio)" onClick={() => setOpen(!open)}>
        <Shape ratio={current} size={14} />
        <span className={s.value}>{ratioName(current)}</span>
        {value === undefined && <span className={s.tag}>Original</span>}
        <svg className={s.chevron} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && createPortal(
        <div ref={panel} className={s.panel} style={{ top: at.top, left: at.left }} role="dialog" aria-label="Video shape">
          <div className={s.grid}>
            <button type="button" className={s.option} data-active={value === undefined} onClick={() => pick(undefined)}
              title={`As uploaded (${ratioName(original)})`}>
              <Shape ratio={original} size={22} />
              <b>Original</b>
            </button>
            {SHAPES.map((shape) => {
              const ratio = shape.w / shape.h;
              return (
                <button type="button" key={`${shape.w}:${shape.h}`} className={s.option} title={shape.use}
                  data-active={value !== undefined && close(ratio, value)} onClick={() => pick(ratio)}>
                  <Shape ratio={ratio} size={22} />
                  <b>{shape.w}:{shape.h}</b>
                </button>
              );
            })}
          </div>
          <form className={s.custom} onSubmit={(event) => { event.preventDefault(); if (customOk) pick(w / h); }}>
            <span>W : H</span>
            <input inputMode="decimal" placeholder="W" aria-label="Custom width" value={custom.w} onChange={(event) => setCustom({ ...custom, w: event.target.value })} />
            <em>:</em>
            <input inputMode="decimal" placeholder="H" aria-label="Custom height" value={custom.h} onChange={(event) => setCustom({ ...custom, h: event.target.value })} />
            <button type="submit" disabled={!customOk}>Apply</button>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
