"use client";
import type React from "react";
import type { CaptionSettings, PartId, PartSettings } from "./captionSettings";
import type { StyleCapabilities } from "./styleCapabilities";
import { ControlSection, NumberSlider, type SectionReset } from "./SettingsControls";

const PART = { min: 70, max: 140 };

/**
 * One place for every size in a style: each text part, the emphasized words, or the selected word.
 * They are limited so a layout always has a size it can fit.
 */
export default function SizeControls({
  settings,
  update,
  updatePart,
  cap,
  wholeCaption,
  section,
  emphasis,
  overall,
}: {
  settings: CaptionSettings;
  update: (patch: Partial<CaptionSettings>, schedule?: boolean) => void;
  updatePart: (id: PartId, patch: Partial<PartSettings>, schedule?: boolean) => void;
  cap: StyleCapabilities;
  wholeCaption: boolean;
  section: SectionReset;
  /** The caption's Font Size, shown first when it shares this section with the part sizes. */
  overall?: React.ReactNode;
  /** Set when key words have a size of their own in this style. */
  emphasis?: { scale: number; onScale: (scale: number) => void };
}) {
  if (wholeCaption ? !cap.sizes?.length && !emphasis : !cap.sizes || cap.wordSizing === false || cap.overallSize && !cap.sizes.length && cap.wordSize !== false) return null;
  if (!wholeCaption)
    return (
      <ControlSection name="SIZE">
        <NumberSlider
          label="This word"
          value={Math.round((settings.sizeScale ?? 1) * 100)}
          {...PART}
          step={5}
          unit="%"
          defaultValue={100}
          onChange={(value) => update({ sizeScale: value / 100 }, true)}
          onReset={() => update({ sizeScale: undefined })}
        />
      </ControlSection>
    );
  return (
    <ControlSection name="SIZE" {...section}>
      {overall}
      {cap.sizes?.map((part) => (
        <NumberSlider
          key={part.id}
          label={part.label}
          value={Math.round((settings.parts?.[part.id]?.scale ?? 1) * 100)}
          {...PART}
          typedMin={30}
          typedMax={300}
          step={5}
          unit="%"
          defaultValue={100}
          onChange={(value) => updatePart(part.id, { scale: value / 100 }, true)}
          onReset={() => updatePart(part.id, { scale: undefined })}
        />
      ))}
      {emphasis && (
        <NumberSlider
          label="Key word size"
          value={Math.round(emphasis.scale * 100)}
          min={80}
          max={200}
          step={5}
          unit="%"
          defaultValue={100}
          onChange={(value) => emphasis.onScale(value / 100)}
          onReset={() => emphasis.onScale(1)}
        />
      )}
    </ControlSection>
  );
}
