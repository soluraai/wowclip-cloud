"use client";

import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { DEFAULT_ANIMATION, resolveEffects, type CaptionSettings, type KeyFormat, type PartId, type PartSettings, type TextEffects } from "./captionSettings";
import StyleOverview, { type OverviewContext } from "./StyleOverview";
import { ControlSection, NumberSlider, SectionFrame } from "./SettingsControls";
import s from "./CaptionSettingsPanel.module.css";
import FontPicker, { languageOf } from "../fonts/FontPicker";
import {
  LOCAL_FONTS,
  STYLE_FONTS,
  closestFace,
  fontFaces,
  loadGoogleCatalog,
  type FontFamily,
  type FontFaceOption,
} from "../fonts/catalog";
import {
  importFont,
  loadUploadedFonts,
  prepareFace,
  uploadedFamilies,
} from "../fonts/runtime";
import ColorControls from "./ColorControls";
import PartColorControls, { partColored, withoutColor } from "./PartControls";
import { DesignControls } from "./DesignControls";
import { BoxControls } from "./BoxControls";
import { LayoutControls, SpacingControls } from "./LayoutControls";
import { MotionControls } from "./MotionControls";
import SizeControls from "./SizeControls";
import WordInspector, { type WordEditingContext } from "./WordInspector";
import HighlightControls, { type HighlightContext } from "./HighlightControls";
import { scriptsIn } from "../../../captions/src/Script/scripts";
import { KeyLook, KeyWordList, TargetPicker, hasKeyLook, type EmphasisContext, type Target } from "./EmphasisControls";
import { SCRIPT_FONTS } from "../../../captions/src/Basic/catalog";
import { captionStyle } from "./styleCatalog";
import { defaultStyleSettings, settingsDiffer } from "../editor/words";
import { emphasisDefaults, styleCapabilities } from "./styleCapabilities";

function ResetIcon() {
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

function SelectArrows() {
  return (
    <svg
      width="13"
      height="16"
      viewBox="0 0 16 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 6 4-4 4 4M4 14l4 4 4-4" />
    </svg>
  );
}

function FontSelect({
  id,
  label,
  value,
  options,
  active,
  onOpen,
  onClose,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  active: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const selected = options.find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!active) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(
        285,
        Math.max(1, options.length) * 34 + 12 + (options.length === 1 ? 38 : 0),
      );
      setPosition({
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - rect.width - 8),
        ),
        top:
          rect.bottom + height + 8 > window.innerHeight
            ? Math.max(8, rect.top - height - 5)
            : rect.bottom + 5,
        width: rect.width,
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const observer = new ResizeObserver(place);
    if (trigger.current) observer.observe(trigger.current);
    place();
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
  }, [active, options.length, onClose]);

  function moveFocus(direction: number) {
    const buttons = Array.from(
      popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
        [],
    );
    if (!buttons.length) return;
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const index =
      current < 0
        ? Math.max(
            0,
            options.findIndex((option) => option.value === value),
          )
        : (current + direction + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={s.select}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={active}
        aria-controls={active ? `${id}-options` : undefined}
        onClick={() => {
          if (active) onClose();
          else onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            onOpen();
            requestAnimationFrame(() =>
              moveFocus(event.key === "ArrowDown" ? 1 : -1),
            );
          }
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <span className={selected ? "" : s.placeholder}>
          {selected?.label ?? "Select font"}
        </span>
        <span className={s.selectArrows}>
          <SelectArrows />
        </span>
      </button>
      {active &&
        position &&
        createPortal(
          <div
            ref={popup}
            id={`${id}-options`}
            className={s.menu}
            style={position}
            role="listbox"
            aria-label={label}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                if (event.key === "Home")
                  popup.current
                    ?.querySelector<HTMLButtonElement>('[role="option"]')
                    ?.focus();
                else if (event.key === "End") {
                  const buttons =
                    popup.current?.querySelectorAll<HTMLButtonElement>(
                      '[role="option"]',
                    );
                  buttons?.[buttons.length - 1]?.focus();
                } else moveFocus(event.key === "ArrowDown" ? 1 : -1);
              }
              if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault();
                trigger.current?.focus();
                onClose();
              }
            }}
          >
            {options.length ? (
              options.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  tabIndex={-1}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    onClose();
                    trigger.current?.focus();
                  }}
                >
                  <span className={s.optionCheck}>
                    {option.value === value && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m3 8 3 3 7-7" />
                      </svg>
                    )}
                  </span>
                  {option.label}
                </button>
              ))
            ) : (
              <div className={s.emptyMenu}>Loading available faces…</div>
            )}
            {options.length === 1 && (
              <div className={s.faceHint}>This font includes one face.</div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Which settings each section's reset puts back. */
const SECTION_KEYS = {
  fonts: ["font", "weight", "italic", "fontAsset", "fontUploadId", "size", "textCase"],
  color: ["color", "colorMode", "gradientStops", "gradientAngle", "gradientScope"],
  accent: ["highlights"],
  emphasis: ["emphasis"],
  design: ["effects"],
  motion: ["animation", "wordIn"],
  layout: ["x", "y", "rotation", "textAlign", "maxWidth", "maxWords", "normalWords", "lineWords", "maxLines", "autoFit"],
  spacing: ["letterSpacing", "wordSpacing", "lineSpacing"],
} as const satisfies Record<string, readonly (keyof CaptionSettings)[]>;

/** The sections that can change the whole caption, the normal text or the key words alone. */
type SectionId = "fonts" | "size" | "color" | "design" | "motion" | "spacing";
const COLOR_FIELDS = ["color", "colorMode", "gradientStops", "gradientAngle"] as const;

function CaptionSettingsPanel({
  settings,
  onChange,
  wordContext,
  highlightContext,
  emphasisContext,
  overview,
  onPreviewMotion,
}: {
  settings: CaptionSettings;
  onChange: (settings: CaptionSettings) => void;
  wordContext: WordEditingContext;
  highlightContext: HighlightContext;
  emphasisContext: EmphasisContext;
  overview: OverviewContext;
  onPreviewMotion: () => void;
}) {
  const styleDefaults = defaultStyleSettings(highlightContext.styleId);
  const cap = styleCapabilities(highlightContext.styleId);
  // Standard and Premium cut their own captions; the word count here caps the normal text in each.
  const designed = captionStyle(highlightContext.styleId);
  const wordCount = designed && designed.category !== "Basic" && "maxWords" in designed && !cap.words
    ? { max: Math.max(1, designed.maxWords - (cap.emphasis === "hero" ? 1 : 0)), main: cap.emphasis === "hero",
        twoLines: highlightContext.styleId === "double-trouble" }
    : undefined;
  const wholeCaption = wordContext.scope === "all" || !wordContext.word;
  // A word resets to the caption's settings, the caption to its style's.
  const baseline = wholeCaption ? styleDefaults : highlightContext.global;
  // Styles built on key words: each section starts with "Change for", picking the whole caption, the normal
  // text or the key words, like Premium does with its parts. The latest change wins: a whole-caption change
  // reaches the key words too. With emphasis off the pickers hide and every key word setting waits for later.
  const keyMode = wholeCaption && cap.target === "key" && (!cap.emphasisToggle || emphasisContext.emphasis.enabled);
  const [picks, setPicks] = useState<Partial<Record<SectionId, Target>>>({});
  const [targetStyle, setTargetStyle] = useState(highlightContext.styleId);
  if (targetStyle !== highlightContext.styleId) {
    setTargetStyle(highlightContext.styleId);
    setPicks({});
  }
  const keyCount = emphasisContext.cues.filter((cue) => cue.highlighted === true).length;
  // Scripts the captions are written in (besides Latin), so fonts made for them are offered first.
  const scriptText = emphasisContext.cues.slice(0, 120).map((cue) => `${cue.hero} ${cue.forms?.native ?? ""}`).join(" ");
  // The look picked at the top decides it: English letters (English, Roman) list English fonts only.
  const look = emphasisContext.script;
  const latinLook = look === "english" || look === "roman";
  const captionScripts = useMemo(() => latinLook ? [] : scriptsIn(scriptText), [scriptText, latinLook]);
  // Captions shown only in those scripts (native look): fonts without their letters are left out of the picker.
  const sampleCues = emphasisContext.cues.slice(0, 120);
  // Mix shows English letters too, so it lists both; native captions list only their script's fonts.
  const scriptOnly = captionScripts.length > 0 && look !== "mix" &&
    sampleCues.filter((cue) => /[A-Za-z]/.test(cue.hero)).length <= sampleCues.length * 0.25;
  // A part drawn in the captions' script (Hindi...): Mix keeps the main word in English letters.
  const nativePart = (id: PartId) => captionScripts.length > 0 && (look === "mix" ? id !== "main" : scriptOnly);
  const scriptName = captionScripts[0] ? languageOf(captionScripts[0]) : "";
  const pick = (id: SectionId, options: Target[]): Target => {
    const picked = keyMode ? picks[id] ?? "all" : "all";
    return options.includes(picked) ? picked : options[0] ?? "all";
  };
  /** The section's shared name and its "Change for" row, when it has more than one choice. */
  const sectionFrame = (id: SectionId, name: string, options: Target[], value: Target) =>
    keyMode && options.length > 1
      ? { name, head: <TargetPicker value={value} options={options} keyCount={keyCount} onPick={(next) => setPicks((now) => ({ ...now, [id]: next }))} /> }
      : {};
  // Size sliders move many times a frame; key word size goes out once per frame, like the others.
  const keyScaleFrame = useRef<number | null>(null);
  const keyScaleNext = useRef(1);
  const [menu, setMenu] = useState<string | null>(null);
  const [google, setGoogle] = useState<FontFamily[]>([]);
  const [uploads, setUploads] = useState<FontFamily[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [fontError, setFontError] = useState("");
  const [fontBusy, setFontBusy] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  /** The part a font upload is for; none means the caption's own font. */
  const uploadPart = useRef<PartId | null>(null);
  const selection = useRef(0);
  const mounted = useRef(true);
  const catalogRequested = useRef(false);
  const families = useMemo(
    () => [
      ...uploads,
      ...LOCAL_FONTS,
      ...STYLE_FONTS,
      ...google.filter(
        (font) =>
          ![...LOCAL_FONTS, ...STYLE_FONTS].some((local) => local.family === font.family),
      ),
    ],
    [uploads, google],
  );
  const selectedFont = families.find(
    (font) =>
      font.family === settings.font &&
      (settings.fontUploadId
        ? font.source === "upload"
        : font.source !== "upload"),
  );
  const faces = useMemo(
    () => fontFaces(selectedFont ?? LOCAL_FONTS[0]),
    [selectedFont],
  );
  function fetchCatalog() {
    if (catalogRequested.current) return;
    catalogRequested.current = true;
    setCatalogLoading(true);
    setCatalogError("");
    loadGoogleCatalog()
      .then((fonts) => {
        if (mounted.current) setGoogle(fonts);
      })
      .catch(() => {
        catalogRequested.current = false;
        if (mounted.current)
          setCatalogError(
            "Google catalogue unavailable. Local fonts still work.",
          );
      })
      .finally(() => {
        if (mounted.current) setCatalogLoading(false);
      });
  }
  useEffect(() => {
    mounted.current = true;
    void loadUploadedFonts()
      .then(() => {
        if (mounted.current) setUploads(uploadedFamilies());
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      !LOCAL_FONTS.some((font) => font.family === settings.font) &&
      !settings.fontUploadId
    )
      fetchCatalog();
  }, [settings.font, settings.fontUploadId]);
  const latest = useRef(settings);
  const pending = useRef<Partial<CaptionSettings>>({});
  const frame = useRef<number | null>(null);
  const contextKey = `${highlightContext.styleId}:${wordContext.scope === "word" ? wordContext.word?.id : "all"}:${wordContext.revision ?? 0}`;
  const [displayContext, setDisplayContext] = useState(contextKey);
  if (displayContext !== contextKey) {
    setDisplayContext(contextKey);
    setFontBusy(false);
    setFontError("");
  }
  useLayoutEffect(() => {
    selection.current++;
    pending.current = {};
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, [contextKey]);
  useLayoutEffect(() => {
    latest.current = settings;
  }, [settings]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const update = (changes: Partial<CaptionSettings>, schedule = false) => {
    pending.current = { ...pending.current, ...changes };
    const flush = () => {
      frame.current = null;
      const next = { ...latest.current, ...pending.current };
      pending.current = {};
      latest.current = next;
      onChange(next);
    };
    if (schedule) {
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    } else {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      flush();
    }
  };
  const changed = (keys: readonly (keyof CaptionSettings)[]) =>
    settingsDiffer(settings, baseline, [...keys]);
  const resetKeys = (keys: readonly (keyof CaptionSettings)[]) =>
    update(Object.fromEntries(keys.map((key) => [key, baseline[key]])));
  const resetFont = () => {
    setMenu(null);
    update(
      Object.fromEntries(
        SECTION_KEYS.fonts
          .filter((key) => key !== "size" && key !== "textCase")
          .map((key) => [key, baseline[key]]),
      ),
    );
  };
  async function selectFace(font: FontFamily, face: FontFaceOption, mirror: PartId[] = [], pinKey = false) {
    const token = ++selection.current;
    const before = latest.current;
    setFontBusy(true);
    setFontError("");
    try {
      const patch = await prepareFace(font, face);
      if (mounted.current && selection.current === token) {
        // Normal text on a style whose key words borrow the caption font: they keep the font they show now.
        if (pinKey && !before.parts?.main?.font)
          updatePart("main", { font: before.font, weight: before.weight, italic: before.italic, fontAsset: before.fontAsset, fontUploadId: before.fontUploadId });
        update(patch);
        // A whole-caption font reaches the parts that have a font of their own, key words included.
        mirror.forEach((id) => updatePart(id, patch));
      }
    } catch {
      if (mounted.current && selection.current === token)
        setFontError(
          "This font could not load. Try again or choose a local font.",
        );
    } finally {
      if (mounted.current && selection.current === token) setFontBusy(false);
    }
  }
  const updatePart = (id: PartId, patch: Partial<PartSettings> | null, schedule = false) => {
    const parts = pending.current.parts ?? latest.current.parts;
    const part = parts?.[id];
    update({ parts: { ...parts, [id]: patch ? { ...part, ...patch } : part && withoutColor(part) } }, schedule);
  };
  const clearPartFont = (id: PartId) => {
    const part = latest.current.parts?.[id];
    update({ parts: { ...latest.current.parts, [id]: part && { ...part, font: undefined, weight: undefined, italic: undefined,
      fontAsset: undefined, fontUploadId: undefined } } });
  };
  async function selectPartFace(id: PartId, font: FontFamily, face: FontFaceOption) {
    const token = ++selection.current;
    setFontBusy(true);
    setFontError("");
    try {
      const patch = await prepareFace(font, face);
      if (mounted.current && selection.current === token) updatePart(id, patch);
    } catch {
      if (mounted.current && selection.current === token)
        setFontError("This font could not load. Try again or choose a local font.");
    } finally {
      if (mounted.current && selection.current === token) setFontBusy(false);
    }
  }
  function chooseFont(font: FontFamily, mirror: PartId[] = [], pinKey = false) {
    const face = closestFace(
      font,
      latest.current.weight,
      latest.current.italic,
    );
    if (face) void selectFace(font, face, mirror, pinKey);
  }

  const familyOf = (name: string, uploaded?: boolean) =>
    families.find((font) => font.family === name && (uploaded ? font.source === "upload" : font.source !== "upload"));
  /** The weight and italic of a part's font, as the caption's own Font Face row does it. */
  const partFaceRow = (id: PartId, label: string, family: string, weight: number, italic: boolean | undefined, uploaded: boolean,
    base?: { weight: number; italic?: boolean }) => {
    const font = familyOf(family, uploaded);
    const options = font ? fontFaces(font) : [];
    if (!font || options.length < 2) return null;
    const menuId = `face-${id}`;
    return (
      <div className={s.row} key={menuId}>
        <label>{label}</label>
        <FontSelect
          id={`part-${id}-face`}
          label={label}
          value={options.some((option) => option.value === `${weight}${italic ? "i" : ""}`)
            ? `${weight}${italic ? "i" : ""}` : closestFace(font, weight, italic)?.value ?? `${weight}`}
          options={options}
          active={menu === menuId}
          onOpen={() => setMenu(menuId)}
          onClose={() => setMenu((current) => (current === menuId ? null : current))}
          onChange={(value) => {
            const face = options.find((option) => option.value === value);
            if (face) void selectPartFace(id, font, face);
          }}
        />
        {base && (
          <button
            type="button"
            className={s.reset}
            aria-label={`Reset ${label.toLowerCase()}`}
            title={`Reset ${label.toLowerCase()}`}
            onClick={() => {
              const face = closestFace(font, base.weight, base.italic);
              if (face) void selectPartFace(id, font, face);
            }}
          >
            <ResetIcon />
          </button>
        )}
      </div>
    );
  };
  const updateKey = (patch: Partial<KeyFormat>, schedule = false) => {
    const next: KeyFormat = { ...(pending.current.keyFormat ?? latest.current.keyFormat), ...patch };
    for (const key of Object.keys(next) as (keyof KeyFormat)[]) if (next[key] === undefined) delete next[key];
    update({ keyFormat: Object.keys(next).length ? next : undefined }, schedule);
  };
  // The key word's font starts as the design's: its own part face, the style's script, or the caption font.
  const keySpec = cap.parts?.find((part) => part.id === "main" && part.font);
  const script = cap.emphasisFonts
    ? SCRIPT_FONTS[(emphasisContext.emphasis.font ?? "caveat") as keyof typeof SCRIPT_FONTS] ?? SCRIPT_FONTS.caveat
    : undefined;
  const keyBase = keySpec?.font ?? (script ? { family: script.family, weight: script.weight, italic: script.italic }
    : cap.keyFont ? { family: settings.font, weight: settings.weight ?? 400, italic: settings.italic } : undefined);
  const keyPart = settings.parts?.main;
  const keyFamily = keyPart?.font ?? keyBase?.family;
  const keyWeight = keyPart?.weight ?? keyBase?.weight ?? 400;
  const keyItalic = keyPart?.italic ?? keyBase?.italic;
  // Standard sizes key words as a part; Basic as the emphasis size.
  const keyPartSize = !!cap.sizes?.some((part) => part.id === "main");
  const keySized = keyPartSize || cap.emphasisSize;
  const keyScale = keyPartSize ? settings.parts?.main?.scale ?? 1 : emphasisContext.emphasis.scale;
  const setKeyScale = (scale: number | undefined, schedule = false) => {
    if (keyPartSize) return updatePart("main", { scale }, schedule);
    keyScaleNext.current = scale ?? 1;
    if (!schedule) {
      if (keyScaleFrame.current !== null) cancelAnimationFrame(keyScaleFrame.current);
      keyScaleFrame.current = null;
      return emphasisContext.onEmphasis({ scale: keyScaleNext.current });
    }
    if (keyScaleFrame.current === null)
      keyScaleFrame.current = requestAnimationFrame(() => {
        keyScaleFrame.current = null;
        emphasisContext.onEmphasis({ scale: keyScaleNext.current });
      });
  };
  const keyMin = keyPartSize ? 0.7 : 0.5, keyMax = keyPartSize ? 1.4 : 2.5;
  const keyPx = Math.round(settings.size * keyScale);
  const minPx = Math.ceil(settings.size * keyMin), maxPx = Math.floor(settings.size * keyMax);
  const setKeyPx = (px: number, schedule = false) => {
    const clamped = Math.max(minPx, Math.min(maxPx, px));
    const scale = Math.round((clamped / settings.size) * 1000) / 1000;
    setKeyScale(Math.abs(scale - 1) < 0.001 ? undefined : scale, true);
    void schedule;
  };
  const keyCase = settings.keyFormat?.textCase;
  const keySizeRows = () => (
    <>
      <div className={s.row}>
        <label htmlFor="key-font-size">Font Size</label>
        <div className={s.stepper}>
          <button
            type="button"
            aria-label="Decrease key word size"
            title="Smaller (Shift: 5)"
            disabled={keyPx <= minPx}
            onClick={(event) => setKeyPx(keyPx - (event.shiftKey ? 5 : 1))}
          >
            −
          </button>
          <div className={s.sizeValue} title="Key word size in pixels">
            <input
              id="key-font-size"
              type="number"
              aria-label="Key word size in pixels"
              min={minPx}
              max={maxPx}
              value={keyPx}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const px = event.target.valueAsNumber;
                if (Number.isFinite(px) && px >= minPx && px <= maxPx) setKeyPx(px);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <span>px</span>
          </div>
          <button
            type="button"
            aria-label="Increase key word size"
            title="Larger (Shift: 5)"
            disabled={keyPx >= maxPx}
            onClick={(event) => setKeyPx(keyPx + (event.shiftKey ? 5 : 1))}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className={s.reset}
          aria-label="Reset key word size"
          title="Reset key word size"
          onClick={() => setKeyScale(undefined)}
        >
          <ResetIcon />
        </button>
      </div>
      <input
        className={`${s.rangeSlider} ${s.fontSizeSlider}`}
        type="range"
        min={minPx}
        max={maxPx}
        step="1"
        aria-label="Key word size slider"
        value={keyPx}
        style={{ "--from": "0%", "--to": `${((keyPx - minPx) / Math.max(1, maxPx - minPx)) * 100}%` } as CSSProperties}
        onChange={(event) => setKeyPx(Number(event.target.value), true)}
      />
    </>
  );
  /** One bar for the whole caption's size (Fonts); the parts' own sizes live in Size. */
  const sizeBar = (pin = false) => (
    <div className={s.colorGroup} key="caption-size">
      <span className={s.colorLabel}>Overall caption size</span>
      <input
        className={`${s.rangeSlider} ${s.fontSizeSlider}`}
        style={{ width: "100%", "--from": "0%", "--to": `${((settings.size - 8) / (MAX_CAPTION_SIZE - 8)) * 100}%` } as CSSProperties}
        type="range"
        min="8"
        max={MAX_CAPTION_SIZE}
        step="1"
        aria-label="Overall caption size"
        value={settings.size}
        onChange={(event) => setSize(Number(event.target.value), true, pin)}
      />
    </div>
  );

  /** Caption font size; for Normal text the key words keep the size they have now. */
  const setSize = (size: number, schedule = false, pin = false) => {
    update({ size }, schedule);
    if (pin && keySized && size !== settings.size)
      setKeyScale(Math.round(Math.max(keyMin, Math.min(keyMax, keyPx / size)) * 1000) / 1000, schedule);
  };

  // What each "Change for" choice shows: Whole caption every part, Normal text all but the key word's, Key words only that one.
  const forTarget = <T extends { id: PartId }>(list: T[] = [], t: Target) =>
    !keyMode ? list : t === "key" ? list.filter((item) => item.id === "main") : t === "rest" ? list.filter((item) => item.id !== "main") : list;

  // Size
  const sizeSection = wholeCaption && !!cap.sizes?.length;
  const sizeOptions: Target[] = keyMode
    ? ["all", ...(forTarget(cap.sizes, "rest").length ? ["rest" as const] : []), ...(keySized ? ["key" as const] : [])] : ["all"];
  const tSize = pick("size", sizeOptions);
  const shownSizes = forTarget(cap.sizes, tSize === "key" ? "rest" : tSize);
  // Premium keeps every size in its own section.
  // Styles built from parts size each one; the rest keep one size for the whole caption.
  const sized = !!cap.sizes?.length && !cap.overallSize;
  const fontKeys = sized ? SECTION_KEYS.fonts.filter((key) => key !== "size") : SECTION_KEYS.fonts;
  // Standard styles with part sizes keep Font Size in the same Size section, so there is only one.
  const mergedSize = wholeCaption && !!cap.overallSize && !!cap.sizes?.length;

  // Fonts
  const fontOptions: Target[] = keyMode ? ["all", "rest", ...(keyBase || keySized || cap.textCase ? ["key" as const] : [])] : ["all"];
  const tFonts = pick("fonts", fontOptions);
  const fontParts = forTarget(cap.parts, tFonts === "key" ? "rest" : tFonts).filter((part) => part.font);
  const pickedFonts = fontParts.some((part) => settings.parts?.[part.id]?.font);
  const showFonts = mergedSize || !sized || cap.fontFamily || cap.textCase || fontParts.length > 0;
  const fontsName = cap.fontFamily || fontParts.length ? "FONTS" : "SIZE";
  const fontMirror: PartId[] = keyMode && tFonts === "all"
    ? [...new Set<PartId>([...(keyBase ? ["main" as const] : []), ...(cap.parts ?? []).filter((part) => part.font).map((part) => part.id)])]
    : [];
  // Basic key words drawn in the caption font until a font is picked for them.
  const keyBorrowsFont = keyMode && tFonts === "rest" && !!cap.keyFont && !keySpec && !script;
  const setCase = (value: "preserve" | "uppercase" | "lowercase") => {
    const before = settings.textCase ?? baseline.textCase ?? "preserve";
    update({ textCase: value });
    if (!keyMode) return;
    if (tFonts === "all") { if (keyCase) updateKey({ textCase: undefined }); }
    else if (!keyCase && before !== value) updateKey({ textCase: before });
  };

  // Color
  const keyColorPart = !!cap.parts?.some((part) => part.id === "main" && part.color);
  const colorOptions: Target[] = keyMode ? ["all", "rest", ...(hasKeyLook(cap) || keyColorPart ? ["key" as const] : [])] : ["all"];
  const tColor = pick("color", colorOptions);
  // A key word color the style draws itself (color, box or shape) lives with the emphasis settings.
  const keyLook = keyMode && tColor === "key" && hasKeyLook(cap);
  const colorParts = keyLook ? [] : forTarget(cap.parts, tColor)
    .filter((part) => part.color && !(keyMode && tColor === "all" && part.id === "main" && hasKeyLook(cap)));
  const pickedColors = colorParts.some((part) => partColored(settings.parts?.[part.id]));
  /** Whole caption color: the caption's own, then every part and the key words follow it. */
  const colorAll = (patch: Partial<CaptionSettings>, schedule = false) => {
    update(patch, schedule);
    if (!keyMode || tColor !== "all") return;
    const look = Object.fromEntries(COLOR_FIELDS.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]])) as Partial<PartSettings>;
    if (!Object.keys(look).length) return;
    const keyInEmphasis = !!cap.emphasisWord;
    if (keyInEmphasis && emphasisContext.emphasis.mode !== "fill")
      emphasisContext.onEmphasis(cap.emphasisGradient ? look as never : { color: look.color ?? emphasisContext.emphasis.color });
    (cap.parts ?? []).filter((part) => part.color && !(keyInEmphasis && part.id === "main"))
      .forEach((part) => updatePart(part.id, look, schedule));
  };
  /** Whole caption on a style colored by parts: a part's color also reaches the key words when it is the normal text's. */
  const partColorAll = (id: PartId, patch: Partial<PartSettings> | null, schedule = false) => {
    updatePart(id, patch, schedule);
    if (id === "main" || !patch || !keyMode) return;
    const look = Object.fromEntries(COLOR_FIELDS.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]])) as Partial<PartSettings>;
    if (!Object.keys(look).length) return;
    if (cap.emphasisWord && emphasisContext.emphasis.mode !== "fill")
      emphasisContext.onEmphasis(cap.emphasisGradient ? look as never : { color: look.color ?? emphasisContext.emphasis.color });
    else if (keyColorPart && !colorParts.some((part) => part.id === "main")) updatePart("main", look, schedule);
  };

  /** Normal text color on a style whose key words share it: the key words keep the color they show now. */
  const partColorRest = (id: PartId, patch: Partial<PartSettings> | null, schedule = false) => {
    const mainSpec = cap.parts?.find((part) => part.id === "main"), spec = cap.parts?.find((part) => part.id === id);
    const shared = keyMode && !cap.emphasisWord && !!mainSpec?.color && mainSpec.color === spec?.color
      && cap.parts?.find((part) => part.id !== "main" && part.id !== "plain")?.id === id;
    if (shared && !partColored(settings.parts?.main)) {
      const own = settings.parts?.[id];
      updatePart("main", partColored(own)
        ? Object.fromEntries(COLOR_FIELDS.filter((key) => own?.[key] !== undefined).map((key) => [key, own?.[key]]))
        : { color: spec?.color });
    }
    updatePart(id, patch, schedule);
  };

  // Design
  const designOptions: Target[] = keyMode
    ? [...(cap.effects || cap.layerEffects ? ["all" as const] : []), "rest", ...(cap.keyDesign ? ["key" as const] : [])]
    : cap.effects || cap.layerEffects ? ["all"] : [];
  const tDesign = pick("design", designOptions);
  // Design for one kind of text at a time (lines, script, plain lines), or the whole caption.
  const partsForDesign = (t: Target) => (!keyMode || t === "rest") && cap.partDesign
    ? forTarget(cap.parts, "rest").filter((part) => part.font || part.color) : [];
  const designParts = partsForDesign(tDesign);
  const spacingParts = partsForDesign("all");
  const shownDesignParts = tDesign === "rest" && designParts.length < 2 ? [] : designParts;
  const [designPart, setDesignPart] = useState<PartId | "all">("all");
  const designOn = shownDesignParts.some((part) => part.id === designPart) ? (designPart as PartId) : "all";
  const designHead = shownDesignParts.length > 0 ? (
    <div className={s.colorGroup}>
      <span className={s.colorLabel}>Design for</span>
      <div className={s.fxLooks} role="group" aria-label="Which text this Design changes">
        {[{ id: "all" as const, label: tDesign === "rest" ? "All normal text" : "Whole caption" }, ...shownDesignParts].map((part) => (
          <button
            type="button"
            key={part.id}
            aria-pressed={designOn === part.id}
            onClick={() => setDesignPart(part.id)}
          >
            {part.label}
            {part.id !== "all" && settings.parts?.[part.id]?.effects ? " •" : ""}
          </button>
        ))}
      </div>
    </div>
  ) : undefined;
  /** Whole caption design: what changed also replaces that effect on the normal text's and key words' own design. */
  const designAll = (patch: Partial<CaptionSettings>, schedule = false) => {
    if (!keyMode || !("effects" in patch)) return update(patch, schedule);
    const next = patch.effects;
    const before = resolveEffects("effects" in pending.current ? pending.current.effects : latest.current.effects);
    // Only the fields that changed carry over (a stroke's width, not its color too), so the rest of their own look stays.
    const follow = (fx?: TextEffects) => {
      if (!fx || !next) return undefined;
      const out = { ...resolveEffects(fx) } as Record<string, unknown>;
      for (const key of Object.keys(next) as (keyof TextEffects)[]) {
        const now = next[key], was = before[key];
        if (JSON.stringify(now) === JSON.stringify(was)) continue;
        if (now && typeof now === "object" && was && typeof was === "object") {
          const changedFields = Object.keys(now).filter((field) => JSON.stringify((now as Record<string, unknown>)[field]) !== JSON.stringify((was as Record<string, unknown>)[field]));
          out[key] = { ...(out[key] as object), ...Object.fromEntries(changedFields.map((field) => [field, (now as Record<string, unknown>)[field]])) };
        } else out[key] = now;
      }
      return out as TextEffects;
    };
    const rest = "restEffects" in pending.current ? pending.current.restEffects : latest.current.restEffects;
    const keyFormat = "keyFormat" in pending.current ? pending.current.keyFormat : latest.current.keyFormat;
    update({
      ...patch,
      ...(rest ? { restEffects: follow(rest) } : {}),
      ...(keyFormat?.effects ? { keyFormat: { ...keyFormat, effects: follow(keyFormat.effects) } } : {}),
    }, schedule);
  };

  // Motion
  const keyMotion = (cap.emphasis !== "none" || cap.partMotion) && cap.keyMotion !== false;
  const motionOptions: Target[] = keyMode ? ["all", "rest", ...(keyMotion ? ["key" as const] : [])] : ["all"];
  const tMotion = pick("motion", motionOptions);
  /** Whole caption motion moves key words too; Normal text keeps the key words' motion as it is. */
  const motionUpdate = (patch: Partial<CaptionSettings>, picked?: "in" | "out") => {
    const next = patch.animation;
    if (!keyMode || !next || tMotion === "key") return update(patch);
    const before = { ...DEFAULT_ANIMATION, ...latest.current.animation };
    const animation = { ...next };
    // A click on a Whole caption card brings the emphasis words back with it, even on the card already picked.
    if (tMotion === "all") {
      if (picked === "in" || next.in !== before.in) animation.keyIn = "same";
      if (picked === "out" || next.out !== before.out) animation.keyOut = "same";
    } else {
      if (next.in !== before.in && (before.keyIn ?? "same") === "same" && before.in !== "style") animation.keyIn = before.in;
      if (next.out !== before.out && (before.keyOut ?? "same") === "same") animation.keyOut = before.out;
    }
    update({ ...patch, animation });
  };

  // Spacing
  const spacingOptions: Target[] = keyMode
    ? ["all", ...(cap.letterSpacing ? ["rest" as const] : []), ...(cap.keySpacing ? ["key" as const] : [])] : ["all"];
  const tSpacing = pick("spacing", spacingOptions);
  /** Whole caption letter spacing: key words drop a spacing of their own and follow it. */
  const spacingAll = (patch: Partial<CaptionSettings>, schedule = false) => {
    const keyFormat = "keyFormat" in pending.current ? pending.current.keyFormat : latest.current.keyFormat;
    if (keyMode && "letterSpacing" in patch && keyFormat?.letterSpacing !== undefined) {
      const { letterSpacing: _dropped, ...kept } = keyFormat;
      void _dropped;
      return update({ ...patch, keyFormat: Object.keys(kept).length ? kept : undefined }, schedule);
    }
    update(patch, schedule);
  };
  /** Normal text letter spacing: key words keep the spacing they have now. */
  const restSpacing = (letterSpacing: number, schedule = false) => {
    const keyFormat = "keyFormat" in pending.current ? pending.current.keyFormat : latest.current.keyFormat;
    const before = ("letterSpacing" in pending.current ? pending.current.letterSpacing : latest.current.letterSpacing) ?? 0;
    update({
      letterSpacing,
      ...(keyFormat?.letterSpacing === undefined && before !== letterSpacing ? { keyFormat: { ...keyFormat, letterSpacing: before } } : {}),
    }, schedule);
  };

  return (
    <div className={s.panel} data-settings-scroll>
      <WordInspector
        key={wordContext.word?.id ?? "none"}
        context={wordContext}
      />
      {wholeCaption && <StyleOverview context={overview} />}
              <input
                ref={uploadInput}
                type="file"
                hidden
                accept=".ttf,.otf,.woff,.woff2"
                aria-label="Upload custom font"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const token = ++selection.current;
                  setFontBusy(true);
                  setFontError("");
                  try {
                    const { font, face } = await importFont(file);
                    if (!mounted.current || selection.current !== token) return;
                    setUploads(uploadedFamilies());
                    const patch = await prepareFace(font, face);
                    if (mounted.current && selection.current === token) {
                      if (uploadPart.current) updatePart(uploadPart.current, patch);
                      else update(patch);
                    }
                  } catch (error) {
                    if (mounted.current && selection.current === token)
                      setFontError(
                        error instanceof Error
                          ? error.message
                          : "The font could not be uploaded.",
                      );
                  } finally {
                    if (mounted.current && selection.current === token)
                      setFontBusy(false);
                  }
                }}
              />
              {fontBusy && (
                <p className={s.fontStatus} role="status">
                  Loading font…
                </p>
              )}
              {fontError && (
                <p className={s.fontError} role="alert">
                  {fontError}
                </p>
              )}
      {keyMode && <KeyWordList context={emphasisContext} />}
      {(wholeCaption || !cap.wordColor) && (tFonts === "key" || showFonts) && (
        <SectionFrame.Provider value={sectionFrame("fonts", fontsName, fontOptions, tFonts)}>
          {tFonts === "key" ? (
            <ControlSection
              name="KEY WORD FONT"
              changed={!!keyPart?.font || keyScale !== 1 || !!keyCase}
              onReset={() => {
                clearPartFont("main");
                setKeyScale(undefined);
                updateKey({ textCase: undefined });
              }}
            >
          {keyBase && keyFamily && (
            <>
              <div className={s.row}>
                <label>Font Family</label>
                <FontPicker
                  value={keyFamily}
                  uploaded={!!keyPart?.fontUploadId}
                  families={families}
                  scripts={nativePart("main") ? captionScripts : []}
                  scriptOnly={nativePart("main")}
                  loading={catalogLoading}
                  error={catalogError}
                  onLoad={fetchCatalog}
                  onSelect={(font) => {
                    const face = closestFace(font, keyWeight, keyItalic);
                    if (face) void selectPartFace("main", font, face);
                  }}
                  onUpload={() => {
                    uploadPart.current = "main";
                    uploadInput.current?.click();
                  }}
                  busy={fontBusy}
                  weight={keyWeight}
                  italic={keyItalic}
                />
                <button
                  type="button"
                  className={s.reset}
                  aria-label="Reset key word font"
                  title="Reset key word font"
                  onClick={() => clearPartFont("main")}
                >
                  <ResetIcon />
                </button>
              </div>
              {partFaceRow("main", "Font Face", keyFamily, keyWeight, keyItalic, !!keyPart?.fontUploadId,
                keyBase && { weight: keyBase.weight ?? 400, italic: keyBase.italic })}
            </>
          )}
          {keySized && !sizeSection && keySizeRows()}
          {cap.textCase && cap.keyDesign && (
            <div className={s.colorGroup}>
              <span className={s.colorLabel}>Text case</span>
              <div className={s.colorModes} data-count="3" role="group" aria-label="Key word text case">
                {(
                  [
                    ["preserve", "Aa"],
                    ["uppercase", "AA"],
                    ["lowercase", "aa"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={(keyCase ?? settings.textCase ?? baseline.textCase ?? "preserve") === value}
                    title={value}
                    onClick={() => updateKey({ textCase: value === (settings.textCase ?? baseline.textCase ?? "preserve") ? undefined : value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
            </ControlSection>
          ) : (
            <ControlSection
              name={fontsName}
              changed={changed(fontKeys) || pickedFonts}
              onReset={() => {
                resetKeys(fontKeys);
                fontParts.forEach((part) => clearPartFont(part.id));
                if (keyMode && tFonts === "all") {
                  if (keyBase) clearPartFont("main");
                  updateKey({ textCase: undefined });
                }
              }}
            >
              {fontParts.map((part) => {
                const look = settings.parts?.[part.id];
                return (
                  <div className={s.colorGroup} key={part.id}>
                  <span className={s.colorLabel}>{part.label}{nativePart(part.id) && <span className={s.scriptTag}>({scriptName})</span>}</span>
                  <div className={s.row}>
                    <label>Font Family</label>
                    <FontPicker
                      value={look?.font ?? part.font!.family}
                      uploaded={!!look?.fontUploadId}
                      families={families}
                      scripts={nativePart(part.id) ? captionScripts : []}
                      scriptOnly={nativePart(part.id)}
                      loading={catalogLoading}
                      error={catalogError}
                      onLoad={fetchCatalog}
                      onSelect={(font) => {
                        const face = closestFace(font, part.font!.weight, part.font!.italic);
                        if (face) void selectPartFace(part.id, font, face);
                      }}
                      onUpload={() => {
                        uploadPart.current = part.id;
                        uploadInput.current?.click();
                      }}
                      busy={fontBusy}
                      weight={look?.weight ?? part.font!.weight}
                      italic={look?.italic ?? part.font!.italic}
                    />
                    <button
                      type="button"
                      className={s.reset}
                      aria-label={`Reset ${part.label.toLowerCase()} font`}
                      title={`Reset ${part.label.toLowerCase()} font`}
                      onClick={() => clearPartFont(part.id)}
                    >
                      <ResetIcon />
                    </button>
                  </div>
                  {partFaceRow(part.id, "Font Face", look?.font ?? part.font!.family, look?.weight ?? part.font!.weight,
                    look?.italic ?? part.font!.italic, !!look?.fontUploadId, part.font)}
                  {/* Hindi and other scripts have no capitals, so their text keeps no case control. */}
                  {cap.partText && !nativePart(part.id) && (
                    <div className={s.row}>
                      <label>Text case</label>
                      <div className={s.colorModes} data-count="3" role="group" aria-label={`${part.label} text case`}>
                        {([["preserve", "Aa"], ["uppercase", "AA"], ["lowercase", "aa"]] as const).map(([value, label]) => (
                          <button type="button" key={label}
                            aria-pressed={(look?.textCase ?? (part.id === "main" ? "uppercase" : "preserve")) === value}
                            title={value} onClick={() => updatePart(part.id, { textCase: value })}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}
              {cap.fontFamily && (
              <>
              <div className={s.row}>
                <label htmlFor="caption-font-family">Font Family</label>
                <FontPicker
                  value={settings.font}
                  uploaded={!!settings.fontUploadId}
                  families={families}
                  scripts={captionScripts}
                  scriptOnly={scriptOnly}
                  loading={catalogLoading}
                  error={catalogError}
                  onLoad={fetchCatalog}
                  onSelect={(font) => chooseFont(font, fontMirror, keyBorrowsFont)}
                  onUpload={() => {
                    uploadPart.current = null;
                    uploadInput.current?.click();
                  }}
                  busy={fontBusy}
                  weight={settings.weight}
                  italic={settings.italic}
                />
                <button
                  type="button"
                  className={s.reset}
                  aria-label="Reset font family"
                  title="Reset font family"
                  onClick={resetFont}
                >
                  <ResetIcon />
                </button>
              </div>
              <div className={s.row}>
                <label htmlFor="caption-font-face">Font Face</label>
                <FontSelect
                  id="caption-font-face"
                  label="Font face"
                  value={`${settings.weight ?? 400}${settings.italic ? "i" : ""}`}
                  options={faces}
                  active={menu === "face"}
                  onOpen={() => setMenu("face")}
                  onClose={() =>
                    setMenu((current) => (current === "face" ? null : current))
                  }
                  onChange={(value) => {
                    const face = faces.find((face) => face.value === value);
                    if (face && selectedFont)
                      void selectFace(selectedFont, face, fontMirror, keyBorrowsFont);
                  }}
                />
                <button
                  type="button"
                  className={s.reset}
                  aria-label="Reset font face"
                  title="Reset font face"
                  onClick={resetFont}
                >
                  <ResetIcon />
                </button>
              </div>
              </>
              )}
              {(mergedSize || (!sized && (wholeCaption || cap.wordSize !== false))) && sizeBar(tFonts === "rest")}
              {cap.textCase && (
                <div className={s.colorGroup}>
                  <span className={s.colorLabel}>Text case</span>
                  <div className={s.colorModes} data-count="3" role="group" aria-label="Text case">
                    {(
                      [
                        ["preserve", "Aa"],
                        ["uppercase", "AA"],
                        ["lowercase", "aa"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={(settings.textCase ?? baseline.textCase ?? "preserve") === value}
                        title={value}
                        onClick={() => setCase(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </ControlSection>
          )}
        </SectionFrame.Provider>
      )}
      {sizeSection && tSize === "key" ? (
        <SectionFrame.Provider value={sectionFrame("size", "SIZE", sizeOptions, tSize)}>
          <ControlSection name="SIZE" changed={keyScale !== 1} onReset={() => setKeyScale(undefined)}>
            {keySizeRows()}
          </ControlSection>
        </SectionFrame.Provider>
      ) : (
        <SectionFrame.Provider value={sizeSection ? sectionFrame("size", "SIZE", sizeOptions, tSize) : {}}>
          <SizeControls
            settings={settings}
            update={update}
            updatePart={updatePart}
            cap={keyMode ? { ...cap, sizes: shownSizes } : cap}
            wholeCaption={wholeCaption}
            overall={undefined}
            section={{
              // The caption's size is one bar in Fonts; this section only owns each part's own size.
              changed: shownSizes.some((part) => settings.parts?.[part.id]?.scale !== undefined),
              onReset: () => {
                shownSizes.forEach((part) => updatePart(part.id, { scale: undefined }));
              },
            }}
          />
        </SectionFrame.Provider>
      )}
      <SectionFrame.Provider value={sectionFrame("color", "TEXT COLOR", colorOptions, tColor)}>
        {keyLook ? (
          <KeyLook
            context={emphasisContext}
            cap={cap}
            defaults={emphasisDefaults(highlightContext.styleId)}
            section={{ changed: changed(SECTION_KEYS.emphasis), onReset: () => resetKeys(SECTION_KEYS.emphasis) }}
          />
        ) : wholeCaption && colorParts.length > 0 ? (
          <PartColorControls
            key={tColor}
            name={tColor === "key" ? "KEY WORD COLOR" : undefined}
            specs={colorParts}
            settings={settings}
            update={tColor === "all" ? partColorAll : tColor === "rest" ? partColorRest : updatePart}
            cap={cap}
            section={{
              changed: pickedColors,
              onReset: () => colorParts.forEach((part) => updatePart(part.id, null)),
            }}
          />
        ) : tColor !== "key" && (
          <ColorControls
            settings={settings}
            update={colorAll}
            defaultColor={baseline.color}
            cap={!wholeCaption && cap.wordColor ? { ...cap, textColor: true } : cap}
            section={{ changed: changed(SECTION_KEYS.color), onReset: () => resetKeys(SECTION_KEYS.color) }}
          />
        )}
      </SectionFrame.Provider>
      {!keyLook && wholeCaption && colorParts.length > 0 && tColor !== "key" && <ColorControls
        settings={settings}
        update={colorAll}
        defaultColor={baseline.color}
        cap={cap}
        section={{ changed: changed(SECTION_KEYS.color), onReset: () => resetKeys(SECTION_KEYS.color) }}
      />}
      {(wholeCaption || !cap.wordColor) && <HighlightControls
        context={highlightContext}
        section={
          wholeCaption
            ? { changed: changed(SECTION_KEYS.accent), onReset: () => resetKeys(SECTION_KEYS.accent) }
            : { changed: !!wordContext.word?.highlight, onReset: () => highlightContext.onWord(null) }
        }
      />}
      {keyMode && cap.box && (
        <BoxControls
          settings={settings}
          update={update}
          cap={cap}
          frameColor={emphasisContext.emphasis.color}
          section={{ changed: !!settings.box || settings.highlights?.enabled === false,
            onReset: () => update({ box: undefined, highlights: settings.highlights && { ...settings.highlights, enabled: true } }) }}
        />
      )}
      {designOptions.length > 0 && (
        <SectionFrame.Provider value={sectionFrame("design", "DESIGN", designOptions, tDesign)}>
          {tDesign === "key" ? (
            <DesignControls
              name="KEY WORD DESIGN"
              blend
              settings={{ ...settings, effects: settings.keyFormat?.effects ?? settings.effects }}
              update={(patch, schedule) => {
                if ("effects" in patch) updateKey({ effects: patch.effects }, schedule);
              }}
              wholeCaption={false}
              section={{ changed: !!settings.keyFormat?.effects, onReset: () => updateKey({ effects: undefined }) }}
            />
          ) : tDesign === "rest" ? (
            <DesignControls
              name="NORMAL TEXT DESIGN"
              head={designHead}
              blend
              settings={{ ...settings, effects: (designOn === "all" ? undefined : settings.parts?.[designOn]?.effects) ?? settings.restEffects ?? settings.effects }}
              update={(patch, schedule) => {
                if (!("effects" in patch)) return;
                if (designOn === "all") update({ restEffects: patch.effects }, schedule);
                else updatePart(designOn, { effects: patch.effects }, schedule);
              }}
              wholeCaption={false}
              section={{ changed: !!settings.restEffects || shownDesignParts.some((part) => settings.parts?.[part.id]?.effects),
                onReset: () => designOn === "all" ? update({ restEffects: undefined }) : updatePart(designOn, { effects: undefined }) }}
            />
          ) : (
            /* One section for every choice of "Design for", so switching parts keeps it open. */
            <DesignControls
              head={designHead}
              settings={designOn === "all" ? settings : { ...settings, effects: settings.parts?.[designOn]?.effects ?? settings.effects }}
              update={designOn === "all" ? designAll : (patch, schedule) => {
                if ("effects" in patch) updatePart(designOn, { effects: patch.effects }, schedule);
              }}
              wholeCaption={designOn === "all" ? wholeCaption : false}
              layer={cap.layerEffects}
              section={{ changed: changed(SECTION_KEYS.design) || designParts.some((part) => settings.parts?.[part.id]?.effects),
                onReset: () => {
                  if (designOn !== "all") return updatePart(designOn, { effects: undefined });
                  resetKeys(SECTION_KEYS.design);
                  designParts.forEach((part) => settings.parts?.[part.id]?.effects && updatePart(part.id, { effects: undefined }));
                } }}
            />
          )}
        </SectionFrame.Provider>
      )}
      {cap.motion && !wordContext.fixedMotion && (
        <SectionFrame.Provider value={sectionFrame("motion", "MOTION", motionOptions, tMotion)}>
          <MotionControls
            settings={settings}
            update={motionUpdate}
            cap={cap}
            target={keyMode ? (tMotion === "key" ? "key" : "all") : undefined}
            wholeCaption={wholeCaption}
            best={styleDefaults.animation?.in ?? "style"}
            bestKey={styleDefaults.animation?.keyIn === "same" ? undefined : styleDefaults.animation?.keyIn}
            onPreview={onPreviewMotion}
            section={{ changed: changed(SECTION_KEYS.motion), onReset: () => resetKeys(SECTION_KEYS.motion) }}
          />
        </SectionFrame.Provider>
      )}
      {wholeCaption && <LayoutControls
        words={wordCount}
        settings={settings}
        update={update}
        defaults={baseline}
        cap={cap}
        wholeCaption={wholeCaption}
        section={{ changed: changed(SECTION_KEYS.layout), onReset: () => resetKeys(SECTION_KEYS.layout) }}
      />}
      <SectionFrame.Provider value={sectionFrame("spacing", "SPACING", spacingOptions, tSpacing)}>
        {tSpacing === "key" ? (
          <ControlSection
            name="KEY WORD SPACING"
            changed={settings.keyFormat?.letterSpacing !== undefined}
            onReset={() => updateKey({ letterSpacing: undefined })}
          >
            <NumberSlider
              label="Letter spacing"
              value={settings.keyFormat?.letterSpacing ?? settings.letterSpacing ?? 0}
              min={-1}
              max={7.5}
              step={0.05}
              unit="px"
              defaultValue={settings.letterSpacing ?? 0}
              onChange={(letterSpacing) => updateKey({ letterSpacing }, true)}
              onReset={() => updateKey({ letterSpacing: undefined })}
            />
          </ControlSection>
        ) : tSpacing === "rest" ? (
          <ControlSection
            name="NORMAL TEXT SPACING"
            changed={(settings.letterSpacing ?? 0) !== (baseline.letterSpacing ?? 0)}
            onReset={() => restSpacing(baseline.letterSpacing ?? 0)}
          >
            <NumberSlider
              label="Letter spacing"
              value={settings.letterSpacing ?? 0}
              min={-1}
              max={7.5}
              step={0.05}
              unit="px"
              defaultValue={baseline.letterSpacing ?? 0}
              onChange={(letterSpacing) => restSpacing(letterSpacing, true)}
              onReset={() => restSpacing(baseline.letterSpacing ?? 0)}
            />
          </ControlSection>
        ) : (
          <SpacingControls
            settings={settings}
            update={spacingAll}
            defaults={baseline}
            cap={cap}
            wholeCaption={wholeCaption}
            parts={cap.partTabs && wholeCaption ? spacingParts : []}
            updatePart={updatePart}
            section={{ changed: changed(SECTION_KEYS.spacing) || spacingParts.some((part) => settings.parts?.[part.id]?.letterSpacing || settings.parts?.[part.id]?.wordSpacing),
              onReset: () => {
                resetKeys(SECTION_KEYS.spacing);
                spacingParts.forEach((part) => (settings.parts?.[part.id]?.letterSpacing || settings.parts?.[part.id]?.wordSpacing)
                  && updatePart(part.id, { letterSpacing: undefined, wordSpacing: undefined }));
                if (keyMode && settings.keyFormat?.letterSpacing !== undefined) updateKey({ letterSpacing: undefined });
              } }}
          />
        )}
      </SectionFrame.Provider>
    </div>
  );
}

/** The overall size bar's top end; big enough for one-word punchy captions. */
const MAX_CAPTION_SIZE = 160;

export default memo(CaptionSettingsPanel);
