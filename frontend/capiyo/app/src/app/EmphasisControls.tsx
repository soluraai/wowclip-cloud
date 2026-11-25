"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Cue } from "./CaptionTimeline";
import type { EmphasisSettings } from "./captionSettings";
import { ControlSection, type SectionReset } from "./SettingsControls";
import type { StyleCapabilities } from "./styleCapabilities";
import ColorControls from "./ColorControls";
import ColorField from "./ColorField";
import { SCRIPT_FONTS } from "../../../captions/src/Basic/catalog";
import s from "./CaptionSettingsPanel.module.css";

export type AIState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | {
      status: "done";
      model: string;
      at: number;
      stats: { edited: number; emphasized: number; chunks: number };
    };

export type EmphasisContext = {
  cues: Cue[];
  /** The caption look picked at the top (Mix, native, English...), so font labels follow it. */
  script?: import("../language/languages").CaptionScript;
  emphasis: EmphasisSettings;
  onEmphasis: (patch: Partial<EmphasisSettings>) => void;
  /** Jumps to a word without changing what the panel edits. */
  onFocusWord: (id: string) => void;
  onMark: (id: string, value: boolean | undefined) => void;
  onClear: () => void;
};

const text = (cue: Cue) =>
  [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" ").replace(/[.,!?;:]+$/u, "");

/** Does the style have a key word color, box or shape of its own to pick? */
export const hasKeyLook = (cap: StyleCapabilities) => !!(cap.emphasisWord || cap.emphasisShape || cap.emphasisModes);

export type Target = "all" | "rest" | "key";

const TARGET_LABEL: Record<Target, string> = { all: "Whole caption", rest: "Normal text", key: "Emphasis" };
const TARGET_HINT: Record<Target, string> = {
  all: "Changes every word, emphasis words too.",
  rest: "Changes only the words that aren't emphasis words.",
  key: "Changes only the emphasis words.",
};

/** "Change for" at the top of a section: the whole caption, the normal text, or the key words alone. */
export function TargetPicker({
  value,
  options,
  onPick,
  keyCount,
}: {
  value: Target;
  options: Target[];
  onPick: (target: Target) => void;
  keyCount: number;
}) {
  return (
    <div className={s.targetPick}>
      <div className={s.targetSwitch} data-count={options.length} role="group" aria-label="Which text this section changes">
        {options.map((option) => (
          <button type="button" key={option} aria-pressed={value === option} onClick={() => onPick(option)}>
            {TARGET_LABEL[option]}
            {option === "key" && <em className={s.targetCount}>{keyCount}</em>}
          </button>
        ))}
      </div>
      <p className={s.targetHint}>{TARGET_HINT[value]}</p>
    </div>
  );
}

/** The words marked as key words, to jump to or unmark. */
export function KeyWordList({ context }: { context: EmphasisContext }) {
  const words = context.cues.filter((cue) => cue.highlighted === true);
  const box = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  // Height of the first three rows of chips, when there are more than three.
  const [cut, setCut] = useState<number>();
  useLayoutEffect(() => {
    const measure = () => {
      const chips = [...(box.current?.children ?? [])] as HTMLElement[];
      const tops = [...new Set(chips.map((chip) => chip.offsetTop))].sort((a, b) => a - b);
      setCut(tops.length > 3 ? tops[3] - tops[0] : undefined);
    };
    measure();
    const watch = new ResizeObserver(measure);
    if (box.current) watch.observe(box.current);
    return () => watch.disconnect();
  }, [words.length]);
  return (
    <div className={s.keyWordList}>
      {words.length > 0 ? (
        <>
        <div ref={box} className={s.emphasisChips}
          style={cut !== undefined && !all ? { maxHeight: cut, overflow: "hidden" } : undefined}>
          {words.map((cue) => (
            <span key={cue.id} className={s.emphasisChip} data-ai={cue.aiEmphasis === true}>
              <button
                type="button"
                title={`${cue.aiEmphasis ? "Picked by AI · " : ""}Jump to this word`}
                onClick={() => context.onFocusWord(cue.id)}
              >
                {text(cue)}
              </button>
              <button
                type="button"
                aria-label={`Remove ${text(cue)} from emphasis`}
                title="Remove"
                onClick={() => context.onMark(cue.id, false)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {cut !== undefined && (
          <button type="button" className={s.keyWordMore} onClick={() => setAll(!all)}>
            {all ? "Show less" : `Show all ${words.length}`}
          </button>
        )}
        </>
      ) : (
        <p className={s.targetHint}>Select a word in the caption and mark it as emphasis.</p>
      )}
    </div>
  );
}

/** The cursive font list of a style that draws its key words in one of its own scripts. */
export function KeyScriptFont({ context }: { context: EmphasisContext }) {
  return (
    <div className={s.inlineField}>
      <span>Key word font</span>
      <select
        className={s.fxSelect}
        aria-label="Key word font"
        value={context.emphasis.font ?? "caveat"}
        onChange={(event) => context.onEmphasis({ font: event.target.value })}
      >
        {Object.entries(SCRIPT_FONTS).map(([id, font]) => (
          <option key={id} value={id}>
            {font.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** How key words are painted: their color or gradient, a box behind them, or the shape the style draws. */
export function KeyLook({
  context,
  cap,
  section,
  defaults,
}: {
  context: EmphasisContext;
  cap: StyleCapabilities;
  section?: SectionReset;
  /** The design's own key word colors, for each Reset color button. */
  defaults?: Pick<EmphasisSettings, "color" | "backgroundColor">;
}) {
  const { emphasis } = context;
  const off = cap.emphasisToggle && !emphasis.enabled;
  return (
    <ControlSection name="KEY WORD COLOR" {...section}>
      <fieldset className={s.highlightFields} disabled={off}>
        <div className={s.colorGroup}>
          {cap.emphasisModes && (
            <div className={s.colorModes} role="group" aria-label="Emphasis look">
              {(["text", "fill"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={emphasis.mode === mode}
                  onClick={() => context.onEmphasis({ mode })}
                >
                  <i
                    className={s.emphasisGlyph}
                    data-mode={mode}
                    style={{
                      color: emphasis.color,
                      background: mode === "fill" ? emphasis.backgroundColor : undefined,
                    }}
                    aria-hidden="true"
                  >
                    Aa
                  </i>
                  {mode === "text" ? "Color" : "Box"}
                </button>
              ))}
            </div>
          )}
          {cap.emphasisShape && cap.emphasisShapeGradient ? (
            <ColorControls
              keyWord
              cap={cap}
              label={cap.emphasisShape}
              defaultColor={defaults?.backgroundColor ?? emphasis.backgroundColor}
              settings={{ color: emphasis.backgroundColor, colorMode: emphasis.shapeColorMode, gradientStops: emphasis.shapeGradientStops,
                gradientAngle: emphasis.shapeGradientAngle, gradientScope: "word" }}
              update={(patch) => context.onEmphasis({
                ...(patch.color !== undefined ? { backgroundColor: patch.color } : {}),
                ...(patch.colorMode !== undefined ? { shapeColorMode: patch.colorMode } : {}),
                ...(patch.gradientStops !== undefined ? { shapeGradientStops: patch.gradientStops } : {}),
                ...(patch.gradientAngle !== undefined ? { shapeGradientAngle: patch.gradientAngle } : {}),
              })}
            />
          ) : cap.emphasisShape && (
            <div className={s.highlightColorRow}>
              <label>{cap.emphasisShape}</label>
              <ColorField
                label={cap.emphasisShape}
                color={emphasis.backgroundColor}
                onChange={(backgroundColor) => context.onEmphasis({ backgroundColor })}
              />
            </div>
          )}
          {cap.emphasisGradient && emphasis.mode !== "fill" ? (
            <ColorControls
              keyWord
              cap={cap}
              label={cap.emphasisWord && cap.emphasisWord !== "Key word color" ? cap.emphasisWord : undefined}
              defaultColor={defaults?.color ?? emphasis.color}
              settings={{ ...emphasis, gradientScope: "word" }}
              update={(patch) => context.onEmphasis(patch)}
            />
          ) : cap.emphasisWord && (
            <div className={s.highlightColorRow}>
              <label>{emphasis.mode === "fill" ? "Text on box" : cap.emphasisWord}</label>
              <ColorField
                label={cap.emphasisWord}
                color={emphasis.color}
                onChange={(color) => context.onEmphasis({ color })}
              />
            </div>
          )}
          {cap.emphasisModes && emphasis.mode === "fill" && (
            <div className={s.highlightColorRow}>
              <label>Box color</label>
              <ColorField
                label="Box color"
                color={emphasis.backgroundColor}
                onChange={(backgroundColor) => context.onEmphasis({ backgroundColor })}
              />
            </div>
          )}
        </div>
      </fieldset>
    </ControlSection>
  );
}
