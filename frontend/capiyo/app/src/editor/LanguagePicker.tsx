"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import s from "./LanguagePicker.module.css";

export type PickerLanguage = { code: string; name: string; native: string; india?: boolean };

/**
 * A searchable language list (setup screen and Translate). Each row shows the name and the language's own script.
 * `auto` adds an "Auto detect" row on top, picked by the empty value.
 */
export function LanguagePicker({ value, onChange, languages, auto, size = "md", label }: {
  value: string;
  onChange: (code: string) => void;
  languages: PickerLanguage[];
  auto?: { title: string; hint: string };
  size?: "md" | "sm";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number; height: number }>();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (item: PickerLanguage) => !q || [item.name, item.native, item.code].some((text) => text.toLowerCase().includes(q));
    const india = languages.filter((item) => item.india && hit(item));
    const more = languages.filter((item) => !item.india && hit(item));
    const out: ({ kind: "group"; title: string } | { kind: "item"; code: string; name: string; native?: string; hint?: string })[] = [];
    if (auto && (!q || "auto detect".includes(q))) out.push({ kind: "item", code: "", name: auto.title, hint: auto.hint });
    if (india.length) out.push({ kind: "group", title: "Indian languages" }, ...india.map((item) => ({ kind: "item" as const, ...item })));
    if (more.length) out.push({ kind: "group", title: "More languages" }, ...more.map((item) => ({ kind: "item" as const, ...item })));
    return out;
  }, [languages, auto, query]);
  const items = rows.filter((row) => row.kind === "item");
  const current = value ? languages.find((item) => item.code === value) : undefined;

  const place_ = () => {
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom - 12, above = box.top - 12;
    const down = below >= 260 || below >= above;
    const height = Math.min(360, Math.max(180, down ? below : above));
    setPlace({ left: box.left, width: Math.max(box.width, 260), height, ...(down ? { top: box.bottom + 6 } : { bottom: window.innerHeight - box.top + 6 }) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place_();
    setQuery("");
    setActive(Math.max(0, items.findIndex((item) => item.code === value)));
    requestAnimationFrame(() => search.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const move = () => place_();
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    button.current?.focus();
  };

  const onKey = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (items.length ? (index + step + items.length) % items.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item.code);
    }
  };

  let index = -1;
  return (
    <div className={s.root} data-size={size}>
      <button type="button" ref={button} className={s.button} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
        {current ? (
          <span className={s.value}>
            <strong>{current.name}</strong>
            {current.native !== current.name && <span className={s.native} dir="auto">{current.native}</span>}
          </span>
        ) : (
          <span className={s.value}><AutoIcon /><strong>{auto?.title ?? "Pick a language"}</strong></span>
        )}
        <Chevron />
      </button>
      {open && place && createPortal(
        <div ref={panel} className={s.panel} data-size={size} data-language-picker="" onKeyDown={onKey}
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.height }}>
          <div className={s.search}>
            <SearchIcon />
            <input ref={search} value={query} placeholder="Search languages" aria-label="Search languages"
              onChange={(event) => { setQuery(event.target.value); setActive(0); }} />
          </div>
          <div ref={list} className={s.list} role="listbox" aria-label={label}>
            {rows.map((row) => {
              if (row.kind === "group") return <p key={row.title} className={s.group}>{row.title}</p>;
              index += 1;
              const at = index;
              const on = row.code === value;
              return (
                <div key={row.code || "auto"} role="option" aria-selected={on} data-index={at} data-active={at === active}
                  className={s.row} onPointerMove={() => setActive(at)} onClick={() => choose(row.code)}>
                  {row.code === "" && <AutoIcon />}
                  <span className={s.rowText}>
                    <strong>{row.name}</strong>
                    {row.hint && <em>{row.hint}</em>}
                  </span>
                  {row.native && row.native !== row.name && <span className={s.native} dir="auto">{row.native}</span>}
                  <i className={s.check} data-on={on}><Check /></i>
                </div>
              );
            })}
            {!items.length && <p className={s.empty}>No language called “{query}”.</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const Chevron = () => (
  <svg className={chevronClass} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const chevronClass = s.chevron;
const Check = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);
const AutoIcon = () => (
  <svg className={s.autoIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </svg>
);
