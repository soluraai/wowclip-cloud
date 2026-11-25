"use client";
import { createContext, useContext, useId, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import s from "./CaptionSettingsPanel.module.css";
export function ResetIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10a8 8 0 1 1 2 8" />
      <path d="M3 4v6h6" />
    </svg>
  );
}
/** The thumb follows the pointer at once; the heavier caption update runs behind it. */
export function useSliderValue(value: number, onChange: (value: number) => void) {
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  return [pending ? draft : value, (next: number) => {
    setDraft(next);
    startTransition(() => onChange(next));
  }] as const;
}
/** Section-level reset: shows only once something in the section differs from the style. */
export type SectionReset = { changed?: boolean; onReset?: () => void };
/**
 * Folding a section near the bottom of the panel makes the panel shorter than where it is scrolled to,
 * and the browser snaps the scroll, so the heading lurches down. A bottom pad covers the gap while the
 * section folds, then melts away as the panel is scrolled up, so nothing jumps.
 */
const holdScroll = (from: HTMLElement | null, folding: number) => {
  const scroller = from?.closest<HTMLElement>("[data-settings-scroll]");
  if (!scroller || folding <= 0) return;
  const pad = () => parseFloat(scroller.style.paddingBottom) || 0;
  const content = scroller.scrollHeight - pad() - folding;
  const need = scroller.scrollTop + scroller.clientHeight - content;
  if (need <= pad()) return;
  scroller.style.paddingBottom = `${need}px`;
  if (scroller.dataset.holding) return;
  scroller.dataset.holding = "1";
  const shrink = () => {
    const rest = scroller.scrollHeight - pad();
    const next = Math.max(0, Math.min(pad(), scroller.scrollTop + scroller.clientHeight - rest));
    scroller.style.paddingBottom = next ? `${next}px` : "";
    if (!next) { scroller.removeEventListener("scroll", shrink); delete scroller.dataset.holding; }
  };
  scroller.addEventListener("scroll", shrink, { passive: true });
};

/**
 * Lets the panel give a section its name and a "Change for" row from outside, whichever control
 * draws it. Only the section directly inside takes it; sections nested in its body don't.
 */
export const SectionFrame = createContext<{ name?: string; head?: ReactNode }>({});
/** Which sections are open, by name, so a section keeps its fold when what it edits changes. */
const openSections = new Map<string, boolean>();
export function ControlSection({
  name: ownName,
  changed,
  onReset,
  children,
}: SectionReset & {
  name: string;
  children: ReactNode;
}) {
  const frame = useContext(SectionFrame);
  const name = frame.name ?? ownName;
  const [open, setOpenState] = useState(() => openSections.get(name) ?? false);
  const setOpen = (next: boolean) => {
    openSections.set(name, next);
    setOpenState(next);
  };
  const id = useId();
  const header = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const closing = open;
    if (closing) holdScroll(header.current, body.current?.scrollHeight ?? 0);
    setOpen(!closing);
    // Once a long section folds up, its heading may sit above the view: bring it back gently.
    if (closing) window.setTimeout(() => header.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 220);
  };
  return (
    <section className={s.section} data-tone={name.toLowerCase().split(" ").pop()}>
      <div className={s.sectionHeader} ref={header}>
        <button
          type="button"
          className={s.sectionHeading}
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
        >
          <span className={s.sectionTitle}>{name}</span>
          <svg
            className={s.sectionChevron}
            style={{ rotate: open ? "180deg" : "0deg" }}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {onReset && (open || changed) && (
          <button
            type="button"
            className={s.sectionReset}
            aria-label={`Reset ${name.toLowerCase()}`}
            title={`Reset ${name.toLowerCase()}`}
            disabled={!changed}
            onClick={onReset}
          >
            <ResetIcon />
          </button>
        )}
      </div>
      <div
        className={s.collapse}
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        <div className={s.fieldsClip} ref={body}>
          <div className={s.fields} id={id}>
            {frame.head}
            <SectionFrame.Provider value={{}}>{children}</SectionFrame.Provider>
          </div>
        </div>
      </div>
    </section>
  );
}
export function NumberSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  defaultValue,
  format,
  onChange,
  onReset,
  typedMin,
  typedMax,
}: {
  /** Typed values may go past the bar's ends, up to these. */
  typedMin?: number;
  typedMax?: number;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** When given, the reset button only lights up once the value moves away from it. */
  defaultValue?: number;
  /** Optional readable label next to the number, e.g. "Tight". */
  format?: (value: number) => string | undefined;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const id = useId();
  const [shown, slide] = useSliderValue(value, onChange);
  const changed =
    defaultValue === undefined || Math.abs(value - defaultValue) > step / 2;
  const fill = Math.max(0, Math.min(100, ((shown - min) / (max - min)) * 100));
  const lowest = typedMin ?? min, highest = typedMax ?? max;
  // Bipolar ranges (e.g. -45°…45°) fill outward from zero instead of from the left edge.
  const origin = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : 0;
  const caption = format?.(shown);
  return (
    <div className={s.control}>
      <div className={s.controlHead}>
        <label htmlFor={id}>{label}</label>
        {caption && <span className={s.controlHint}>{caption}</span>}
        <div className={s.controlValue}>
          <input
            type="number"
            aria-label={`${label} value`}
            min={lowest}
            max={highest}
            step={step}
            value={text ?? Number(shown.toFixed(2))}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setText(event.target.value);
              const next = event.target.valueAsNumber;
              if (Number.isFinite(next) && next >= lowest && next <= highest)
                onChange(next);
            }}
            onBlur={(event) => {
              const next = event.target.valueAsNumber;
              if (Number.isFinite(next))
                onChange(Math.max(lowest, Math.min(highest, next)));
              setText(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = String(value);
                setText(null);
                event.currentTarget.blur();
              }
            }}
          />
          {unit && <span>{unit}</span>}
        </div>
        <button
          type="button"
          className={s.controlReset}
          data-changed={changed}
          aria-label={`Reset ${label.toLowerCase()}`}
          title={`Reset ${label.toLowerCase()}`}
          onClick={() => {
            setText(null);
            onReset();
          }}
        >
          <ResetIcon />
        </button>
      </div>
      <input
        id={id}
        className={s.rangeSlider}
        type="range"
        value={shown}
        min={min}
        max={max}
        step={step}
        title="Double-click to reset"
        style={
          {
            "--from": `${Math.min(origin, fill)}%`,
            "--to": `${Math.max(origin, fill)}%`,
          } as CSSProperties
        }
        onChange={(event) => slide(Number(event.target.value))}
        onDoubleClick={() => {
          setText(null);
          onReset();
        }}
      />
    </div>
  );
}
