"use client";
import type { BoxSettings, CaptionSettings } from "./captionSettings";
import type { StyleCapabilities } from "./styleCapabilities";
import ColorControls from "./ColorControls";
import { ControlSection, NumberSlider, type SectionReset } from "./SettingsControls";
import s from "./CaptionSettingsPanel.module.css";

/** Focus Frame's default box tint, which follows the frame color until another is picked. */
const STYLE_BLUE = "#4777df";
export const BOX_DEFAULTS = { opacity: 38, frameWidth: 1.8, radius: 1.5, padding: 100, glow: 40, drawMs: 160 } as const;

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={s.fxCard} data-on={on}>
      <div className={s.fxHead}>
        <span>{label}</span>
        <button type="button" role="switch" className={s.switch} aria-checked={on} aria-label={`${label} on or off`} onClick={() => onChange(!on)}>
          <span />
        </button>
      </div>
    </div>
  );
}

/** Everything about the box a style draws around its key word: fill, frame, corners, handles, glow and timing. */
export function BoxControls({
  settings,
  update,
  cap,
  frameColor,
  section,
}: {
  settings: CaptionSettings;
  update: (patch: Partial<CaptionSettings>, schedule?: boolean) => void;
  cap: StyleCapabilities;
  frameColor: string;
  section?: SectionReset;
}) {
  const box = settings.box ?? {};
  const set = (patch: Partial<BoxSettings>, schedule = false) => {
    const next: BoxSettings = { ...settings.box, ...patch };
    for (const key of Object.keys(next) as (keyof BoxSettings)[]) if (next[key] === undefined) delete next[key];
    update({ box: Object.keys(next).length ? next : undefined }, schedule);
  };
  const legacy = settings.highlights?.backgroundColor;
  const color = box.color ?? (legacy && legacy.toLowerCase() !== STYLE_BLUE ? legacy : frameColor);
  const shown = settings.highlights?.enabled !== false;
  const slider = (key: keyof typeof BOX_DEFAULTS, label: string, min: number, max: number, step: number, unit: string) => (
    <NumberSlider
      label={label}
      value={box[key] ?? BOX_DEFAULTS[key]}
      min={min}
      max={max}
      step={step}
      unit={unit}
      defaultValue={BOX_DEFAULTS[key]}
      onChange={(value) => set({ [key]: value }, true)}
      onReset={() => set({ [key]: undefined })}
    />
  );
  return (
    <ControlSection name="BOX" {...section}>
      <Switch label="Show box" on={shown} onChange={(on) => update({ highlights: { ...settings.highlights!, enabled: on } })} />
      <fieldset className={s.highlightFields} disabled={!shown}>
        <div className={s.colorGroup}>
          <ColorControls
            keyWord
            cap={cap}
            label="Box color"
            defaultColor={frameColor}
            onResetColor={() => set({ color: undefined, colorMode: undefined, gradientStops: undefined, gradientAngle: undefined })}
            settings={{ color, colorMode: box.colorMode, gradientStops: box.gradientStops, gradientAngle: box.gradientAngle, gradientScope: "word" }}
            update={(patch) => set({
              ...(patch.color !== undefined ? { color: patch.color } : {}),
              ...(patch.colorMode !== undefined ? { colorMode: patch.colorMode } : {}),
              ...(patch.gradientStops !== undefined ? { gradientStops: patch.gradientStops } : {}),
              ...(patch.gradientAngle !== undefined ? { gradientAngle: patch.gradientAngle } : {}),
            })}
          />
          {slider("opacity", "Box opacity", 0, 100, 1, "%")}
        </div>
        <div className={s.colorGroup}>
          <span className={s.colorLabel}>Frame</span>
          {slider("frameWidth", "Frame width", 0, 8, 0.1, "px")}
          {slider("radius", "Corner radius", 0, 30, 0.5, "px")}
          {slider("padding", "Padding", 0, 300, 5, "%")}
          {slider("glow", "Glow", 0, 100, 1, "%")}
          <Switch label="Corner handles" on={box.handles !== false} onChange={(on) => set({ handles: on ? undefined : false })} />
        </div>
        <div className={s.colorGroup}>
          <span className={s.colorLabel}>Animation</span>
          {slider("drawMs", "Draw-on time", 0, 1200, 10, "ms")}
        </div>
      </fieldset>
    </ControlSection>
  );
}
