"use client";
import { useState } from "react";
import ColorControls from "./ColorControls";
import { ControlSection, type SectionReset } from "./SettingsControls";
import type { CaptionSettings, PartId, PartSettings } from "./captionSettings";
import type { PartSpec, StyleCapabilities } from "./styleCapabilities";
import s from "./CaptionSettingsPanel.module.css";

const COLOR_KEYS = ["color", "colorMode", "gradientStops", "gradientAngle"] as const;

export const partColored = (part?: PartSettings) => COLOR_KEYS.some((key) => part?.[key] !== undefined);

/** A part's color without anything picked, which hands it back to the design. */
export const withoutColor = (part: PartSettings): PartSettings => {
  const rest = { ...part };
  for (const key of COLOR_KEYS) delete rest[key];
  return rest;
};

/** One color at a time, because a style's parts share the same space in the panel. */
export default function PartColorControls({
  specs,
  settings,
  update,
  cap,
  section,
  name = "COLOR",
}: {
  name?: string;
  specs: PartSpec[];
  settings: CaptionSettings;
  update: (id: PartId, patch: Partial<PartSettings> | null, schedule?: boolean) => void;
  cap: StyleCapabilities;
  section: SectionReset;
}) {
  const [picked, setPicked] = useState(specs[0].id);
  const spec = specs.find((item) => item.id === picked) ?? specs[0];
  const part = settings.parts?.[spec.id];
  return (
    <ControlSection name={name} {...section}>
      {specs.length > 1 && (
        <div className={s.colorModes} data-count={specs.length} role="group" aria-label="Which text this color is for">
          {specs.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={item.id === spec.id}
              onClick={() => setPicked(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <ColorControls
        key={spec.id}
        keyWord
        solidOnly={!spec.gradient}
        label={spec.label}
        cap={cap}
        defaultColor={spec.color}
        settings={{ ...part, color: part?.color ?? spec.color ?? "#ffffff" }}
        update={(patch, schedule) => update(spec.id, patch, schedule)}
        onResetColor={() => update(spec.id, null)}
      />
    </ControlSection>
  );
}
