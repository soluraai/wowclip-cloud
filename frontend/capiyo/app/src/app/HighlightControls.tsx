"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  DEFAULT_HIGHLIGHTS,
  type CaptionSettings,
  type HighlightSettings,
} from "./captionSettings";
import { ControlSection, type SectionReset } from "./SettingsControls";
import ColorField from "./ColorField";
import ColorControls from "./ColorControls";
import s from "./CaptionSettingsPanel.module.css";
import { styleCapabilities } from "./styleCapabilities";
import type { Cue } from "./CaptionTimeline";
export type HighlightContext = {
  global: CaptionSettings;
  styleId: string;
  onGlobal: (settings: HighlightSettings) => void;
  /** The selected word, whose colors go on that word alone. */
  word: Cue | null;
  /** Null drops the word's own colors. */
  onWord: (patch: Partial<HighlightSettings> | null) => void;
};
/** The style's signature color, for the whole caption or the selected word. */
export default function HighlightControls({
  context,
  section,
}: {
  context: HighlightContext;
  section?: SectionReset;
}) {
  const shared = { ...DEFAULT_HIGHLIGHTS, ...context.global.highlights, ...context.word?.highlight };
  const cap = styleCapabilities(context.styleId);
  const latest = useRef(context),
    pending = useRef<Partial<HighlightSettings>>({}),
    frame = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = context;
  }, [context]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const update = (patch: Partial<HighlightSettings>) => {
    pending.current = { ...pending.current, ...patch };
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const value = pending.current;
        pending.current = {};
        if (latest.current.word) latest.current.onWord(value);
        else latest.current.onGlobal({
          ...DEFAULT_HIGHLIGHTS,
          ...latest.current.global.highlights,
          ...value,
        });
      });
  };
  if (!cap.accent) return null;
  const colorRow = (label: string, field: "color" | "backgroundColor") => (
    <div className={s.highlightColorRow} key={field}>
      <label>{label}</label>
      <ColorField
        label={label}
        color={shared[field]}
        onChange={(value) => update({ [field]: value })}
      />
    </div>
  );
  return (
    <ControlSection name="ACCENT" {...section}>
      <fieldset
        className={s.highlightFields}
        disabled={!!cap.accent.toggle && !shared.enabled}
      >
        {cap.accent.gradient && cap.accent.field === "color" ? (
          <ColorControls
            keyWord
            cap={cap}
            label={cap.accent.label}
            defaultColor={shared.color}
            scopeLabels={cap.accent.gradient === "scoped" ? ["Each word", "Whole line"] : undefined}
            settings={{ color: shared.color, colorMode: shared.colorMode, gradientStops: shared.gradientStops,
              gradientAngle: shared.gradientAngle, gradientScope: shared.gradientSpan === "line" ? "character" : "word" }}
            update={(patch) => {
              const { gradientScope, ...rest } = patch;
              update({ ...rest, ...(gradientScope ? { gradientSpan: gradientScope === "character" ? "line" : "word" } : {}) });
            }}
          />
        ) : colorRow(cap.accent.label, cap.accent.field)}
        {cap.accent.secondary &&
          colorRow(cap.accent.secondary.label, cap.accent.secondary.field)}
      </fieldset>
    </ControlSection>
  );
}
