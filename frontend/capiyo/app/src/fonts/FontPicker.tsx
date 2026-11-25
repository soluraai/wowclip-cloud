"use client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { type FontFamily } from "./catalog";
import {
  fontPreviewReady,
  fontSampleReady,
  loadFontPreview,
  loadFontSample,
  preloadFace,
  previewFamily,
  sampleFamily,
} from "./runtime";
import s from "./FontPicker.module.css";

/** Which language a script's letters are for, as the picker labels it. */
const LANGUAGE: Record<string, string> = {
  devanagari: "Hindi", bengali: "Bangla", tamil: "Tamil", telugu: "Telugu", kannada: "Kannada",
  malayalam: "Malayalam", gujarati: "Gujarati", gurmukhi: "Punjabi", oriya: "Odia", arabic: "Urdu",
  sinhala: "Sinhala", thai: "Thai",
};
/** A few letters in each script, shown in the font itself. */
const SAMPLE: Record<string, string> = {
  devanagari: "नमस्ते", bengali: "নমস্কার", tamil: "வணக்கம்", telugu: "నమస్తే", kannada: "ನಮಸ್ಕಾರ",
  malayalam: "നമസ്കാരം", gujarati: "નમસ્તે", gurmukhi: "ਸਤ ਸ੍ਰੀ", oriya: "ନମସ୍କାର", arabic: "سلام",
  sinhala: "ආයුබෝවන්", thai: "สวัสดี",
};
type Script = { name: string; subset: string };
export const languageOf = (script: Script) => LANGUAGE[script.subset] ?? script.name;

function FontRow({
  font,
  selected,
  active,
  onChoose,
  onHover,
  script,
  scripts,
}: {
  font: FontFamily;
  selected: boolean;
  active: boolean;
  onChoose: () => void;
  onHover: () => void;
  /** The captions' script this font draws, if any: the row shows a sample in it. */
  script?: Script;
  /** Every script in the captions, for the language label. */
  scripts: Script[];
}) {
  const [ready, setReady] = useState(() => fontPreviewReady(font));
  const [sampled, setSampled] = useState(() => fontSampleReady(font));
  useEffect(() => {
    let alive = true;
    loadFontPreview(font)
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {});
    if (script)
      loadFontSample(font)
        .then(() => {
          if (alive) setSampled(true);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [font, script]);
  // "Hindi" when the font draws the captions' script, "English" when it only has Latin letters.
  const label = scripts.length
    ? scripts.filter((item) => font.subsets.includes(item.subset)).map(languageOf).join(" · ") || "English"
    : "";
  return (
    <button
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      id={`font-option-${encodeURIComponent(font.id)}`}
      className={s.fontRow}
      data-active={active}
      onPointerEnter={onHover}
      onClick={onChoose}
      style={{
        fontFamily:
          ready && font.previewSrc
            ? `${JSON.stringify(previewFamily(font))}, Inter, sans-serif`
            : undefined,
      }}
    >
      <span className={s.check}>{selected ? "✓" : ""}</span>
      <span>{font.family}</span>
      {script && sampled && (
        <span className={s.sample} style={{ fontFamily: `${JSON.stringify(sampleFamily(font))}, sans-serif` }}>
          {SAMPLE[script.subset] ?? ""}
        </span>
      )}
      {label && <span className={s.language} data-latin={label === "English"}>{label}</span>}
    </button>
  );
}

type Row = { heading: string } | { font: FontFamily };
export default function FontPicker({
  value,
  uploaded,
  families,
  loading,
  error,
  onLoad,
  onSelect,
  onUpload,
  busy,
  weight,
  italic,
  scripts,
  scriptOnly,
}: {
  value: string;
  uploaded: boolean;
  families: FontFamily[];
  loading: boolean;
  error: string;
  onLoad: () => void;
  onSelect: (font: FontFamily) => void;
  onUpload: () => void;
  busy: boolean;
  weight?: number;
  italic?: boolean;
  /** Scripts in the captions besides Latin: fonts that draw them are listed first. */
  scripts?: { name: string; subset: string; sample?: string }[];
  /** The captions show only those scripts (no English letters): fonts without them are left out. */
  scriptOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [top, setTop] = useState(0);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    // A reopened DOM scroller starts at zero. Its virtual window must too.
    if (!open) {
      setTop(0);
      setActive(-1);
    }
    setOpen(true);
    onLoad();
  };
  const hide = () => {
    setOpen(false);
  };
  useEffect(
    () => () => {
      if (warmTimer.current) clearTimeout(warmTimer.current);
    },
    [],
  );
  // Uploaded fonts carry no list of scripts: once open, each is loaded and checked for the captions' letters.
  const [drawn, setDrawn] = useState<ReadonlySet<string>>(new Set());
  const uploadKey = families.filter((font) => font.source === "upload").map((font) => font.id).join("|");
  const scriptKey = (scripts ?? []).map((script) => script.subset).join("|");
  useEffect(() => {
    if (!open || !scripts?.length || !uploadKey) return;
    let live = true;
    const uploads = families.filter((font) => font.source === "upload");
    void Promise.all(uploads.map(async (font) => {
      await loadFontSample(font).catch(() => undefined);
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return undefined;
      const family = sampleFamily(font);
      // Two different fallbacks measure the same only when the font itself draws every letter.
      const width = (fallback: string, sample: string) => { ctx.font = `40px ${JSON.stringify(family)}, ${fallback}`; return ctx.measureText(sample).width; };
      return scripts.some((script) => !!script.sample && Math.abs(width("serif", script.sample) - width("monospace", script.sample)) < 0.5) ? font.id : undefined;
    })).then((ids) => { if (live) setDrawn(new Set(ids.filter((id): id is string => !!id))); });
    return () => { live = false; };
    // families and scripts follow their keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploadKey, scriptKey]);
  const warm = (font: FontFamily) => {
    if (warmTimer.current) clearTimeout(warmTimer.current);
    warmTimer.current = setTimeout(
      () => void preloadFace(font, weight, italic).catch(() => {}),
      130,
    );
  };
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matched = families.filter((font) =>
      font.family.toLowerCase().includes(search),
    );
    const result: Row[] = [];
    // Captions in Hindi, Tamil and so on: the families that draw those letters themselves come first.
    // Any other font still works (a matching font draws its Hindi letters), it just won't style them,
    // so captions shown only in those scripts list only the fonts made for them.
    const listed = new Set<string>();
    for (const script of scripts ?? []) {
      const group = matched.filter((font) => (font.subsets.includes(script.subset) || drawn.has(font.id)) && !listed.has(font.id));
      group.forEach((font) => listed.add(font.id));
      if (group.length) result.push({ heading: `${languageOf(script)} fonts` }, ...group.map((font) => ({ font })));
    }
    // Native captions list only fonts that draw their letters: an English-only upload is left out too.
    const shown = (font: FontFamily) => !listed.has(font.id) && (!scriptOnly || !scripts?.length);
    for (const [heading, predicate] of [
      ["Your fonts", (f: FontFamily) => f.source === "upload"],
      ["Default fonts", (f: FontFamily) => f.source === "local" && !f.fallback],
      [
        "Language fallbacks",
        (f: FontFamily) => f.source === "local" && f.fallback,
      ],
      ["Google Fonts", (f: FontFamily) => f.source === "google"],
    ] as const) {
      const group = matched.filter((font) => predicate(font) && shown(font));
      if (group.length)
        result.push({ heading: scripts?.length && heading !== "Your fonts" ? `${heading} · English letters` : heading }, ...group.map((font) => ({ font })));
    }
    return result;
  }, [families, query, scripts, scriptOnly, drawn]);
  const height = Math.min(252, Math.max(72, rows.length * 36));
  const visibleTop = Math.min(top, Math.max(0, rows.length * 36 - height));
  const start = Math.max(0, Math.floor(visibleTop / 36) - 6);
  const end = Math.min(rows.length, Math.ceil((visibleTop + height) / 36) + 6);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, Math.max(260, rect.width));
      const total = height + 104;
      setPosition({
        width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top:
          rect.bottom + total + 8 <= window.innerHeight
            ? rect.bottom + 6
            : Math.max(8, rect.top - total - 6),
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    place();
    const observer = new ResizeObserver(place);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener("resize", place);
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) place();
    };
    window.addEventListener("scroll", scroll, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, height]);
  function move(direction: number) {
    if (!rows.length) return;
    let index = active;
    for (let n = 0; n < rows.length; n++) {
      index = (index + direction + rows.length) % rows.length;
      if ("font" in rows[index]) break;
    }
    setActive(index);
    if (list.current) {
      if (index * 36 < list.current.scrollTop)
        list.current.scrollTop = index * 36;
      else if ((index + 1) * 36 > list.current.scrollTop + height)
        list.current.scrollTop = (index + 1) * 36 - height;
    }
    const row = rows[index];
    if ("font" in row) warm(row.font);
  }
  function choose(font: FontFamily) {
    onSelect(font);
    hide();
    trigger.current?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        id="caption-font-family"
        type="button"
        className={s.trigger}
        aria-label="Font family"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) hide();
          else show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            show();
          }
          if (event.key === "Escape") hide();
        }}
      >
        <span>{value}</span>
        <span className={s.arrows} aria-hidden="true">
          ⌃<br />⌄
        </span>
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popup}
            className={s.popup}
            style={position}
            role="dialog"
            aria-label="Choose font family"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                hide();
                trigger.current?.focus();
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                move(event.key === "ArrowDown" ? 1 : -1);
              }
              if (
                event.key === "Enter" &&
                active >= 0 &&
                rows[active] &&
                "font" in rows[active] &&
                !(event.target as Element).closest('[role="option"]')
              ) {
                event.preventDefault();
                choose((rows[active] as { font: FontFamily }).font);
              }
            }}
          >
            <div className={s.search}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="6" />
                <path d="m15 15 5 5" />
              </svg>
              <input
                aria-label="Search fonts"
                placeholder="Search fonts…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setTop(0);
                  setActive(-1);
                  if (list.current) list.current.scrollTop = 0;
                }}
              />
            </div>
            <div
              ref={list}
              className={s.list}
              role="listbox"
              aria-label="Font families"
              aria-activedescendant={
                active >= 0 && rows[active] && "font" in rows[active]
                  ? `font-option-${encodeURIComponent((rows[active] as { font: FontFamily }).font.id)}`
                  : undefined
              }
              tabIndex={0}
              style={{ height }}
              onScroll={(event) => {
                if (warmTimer.current) clearTimeout(warmTimer.current);
                const nextTop = event.currentTarget.scrollTop;
                // Keep this small virtual window in step with native scrolling.
                // A deferred update can otherwise paint an empty viewport.
                flushSync(() => setTop(nextTop));
              }}
            >
              <div style={{ height: rows.length * 36, position: "relative" }}>
                {rows.slice(start, end).map((row, index) => (
                  <div
                    key={"font" in row ? row.font.id : row.heading}
                    style={{
                      position: "absolute",
                      top: (start + index) * 36,
                      height: 36,
                      left: 0,
                      right: 0,
                    }}
                  >
                    {"heading" in row ? (
                      <div className={s.group}>{row.heading}</div>
                    ) : (
                      <FontRow
                        font={row.font}
                        scripts={scripts ?? []}
                        script={scripts?.find((script) => row.font.subsets.includes(script.subset))}
                        active={active === start + index}
                        selected={
                          row.font.family === value &&
                          (uploaded
                            ? row.font.source === "upload"
                            : row.font.source !== "upload")
                        }
                        onChoose={() => choose(row.font)}
                        onHover={() => {
                          setActive(start + index);
                          warm(row.font);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              {!rows.length && (
                <div className={s.empty}>
                  {loading ? "Loading fonts…" : "No fonts found"}
                </div>
              )}
            </div>
            {error && (
              <p className={s.error} role="status">
                {error}
              </p>
            )}
            <button
              type="button"
              className={s.upload}
              disabled={busy}
              onClick={() => {
                onUpload();
              }}
            >
              ↑ {busy ? "Loading font…" : "Upload font"}
              <span>TTF · OTF · WOFF</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
