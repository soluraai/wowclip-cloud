"use client";
import { useState } from "react";
import type { CaptionSettings, PartId, PartSettings } from "./captionSettings";
import type { StyleCapabilities } from "./styleCapabilities";
import { ControlSection, NumberSlider, type SectionReset } from "./SettingsControls";
import s from "./CaptionSettingsPanel.module.css";

type Update = (patch: Partial<CaptionSettings>, schedule?: boolean) => void;
type Props = {
  settings: CaptionSettings;
  update: Update;
  defaults: CaptionSettings;
  cap: StyleCapabilities;
  wholeCaption: boolean;
  section?: SectionReset;
};
/** Standard and Premium: how many words a caption's normal text holds, or each of its two lines. */
export type WordCount = { max: number; main: boolean; twoLines: boolean };

/** Auto, then counts up to `max`: one row of buttons. */
function CountPicker({ label, value, max, onPick }: { label: string; value?: number; max: number; onPick: (value?: number) => void }) {
  return (
    <div className={s.inlineField}>
      <span>{label}</span>
      <div className={s.iconSegmented} role="group" aria-label={label}>
        {[undefined, ...Array.from({ length: max }, (_, i) => i + 1)].map((count) => (
          <button
            type="button"
            key={count ?? "auto"}
            title={count ? `At most ${count} word${count > 1 ? "s" : ""}` : "Fits the box, every caption about the same width"}
            aria-pressed={value === count}
            onClick={() => onPick(count)}
          >
            {count ?? "Auto"}
          </button>
        ))}
      </div>
    </div>
  );
}

function WordCountControls({ settings, update, count }: Pick<Props, "settings" | "update"> & { count: WordCount }) {
  const lines = settings.lineWords ?? {};
  const setLine = (line: "top" | "bottom", value?: number) => {
    const next = { ...lines, [line]: value };
    update({ lineWords: next.top === undefined && next.bottom === undefined ? undefined : next });
  };
  return (
    <div className={s.colorGroup}>
      <span className={s.colorLabel}>Words</span>
      {count.twoLines ? (
        <>
          <CountPicker label="Top line" value={lines.top} max={Math.min(count.max, 5)} onPick={(value) => setLine("top", value)} />
          <CountPicker label="Bottom line" value={lines.bottom} max={Math.min(count.max, 5)} onPick={(value) => setLine("bottom", value)} />
        </>
      ) : (
        <CountPicker label={count.main ? "Normal text" : "Per caption"} value={settings.normalWords}
          max={Math.min(count.max, 6)} onPick={(normalWords) => update({ normalWords })} />
      )}
      <p className={s.sectionNote}>
        {count.main ? "Words next to the main word. " : ""}Auto fits the words to the width, so every caption comes out about the same size.
      </p>
    </div>
  );
}

/** Snap points for the 3×3 position pad (percent of the frame). */
const PAD_X = [15, 50, 85] as const;
const PAD_Y = [15, 50, 80] as const;
const ROW_NAMES = ["Top", "Middle", "Bottom"];
const COLUMN_NAMES = ["left", "center", "right"];
const near = (a: number, b: number) => Math.abs(a - b) < 1.5;
const WORD_QUICK_PICKS = [1, 2, 3, 4, 6, 8, 10] as const;

const ALIGN_ICONS: Record<"left" | "center" | "right", string> = {
  left: "M3 4h14M3 8h9M3 12h14M3 16h9",
  center: "M3 4h14M5.5 8h9M3 12h14M5.5 16h9",
  right: "M3 4h14M8 8h9M3 12h14M8 16h9",
};

function PositionPad({ settings, update, sideways }: Pick<Props, "settings" | "update"> & { sideways: boolean }) {
  // A style that can't move sideways only offers top, middle and bottom; the others would do nothing.
  const columns = sideways ? PAD_X : ([50] as const);
  return (
    <div className={s.positionPad} data-columns={columns.length} role="group" aria-label="Quick position">
      {PAD_Y.map((y, row) =>
        columns.map((x) => {
          const column = PAD_X.indexOf(x);
          const active = (!sideways || near(settings.x, x)) && near(settings.y, y);
          const name =
            row === 1 && column === 1
              ? "Center"
              : `${ROW_NAMES[row]} ${COLUMN_NAMES[column]}`;
          return (
            <button
              type="button"
              key={`${x}-${y}`}
              title={name}
              aria-label={name}
              aria-pressed={active}
              onClick={() => update(sideways ? { x, y } : { y })}
            >
              <span />
            </button>
          );
        }),
      )}
    </div>
  );
}

export function LayoutControls({
  settings,
  update,
  defaults,
  cap,
  wholeCaption,
  section,
  words,
}: Props & { words?: WordCount }) {
  if (!wholeCaption)
    return (
      <ControlSection name="LAYOUT">
        <p className={s.sectionNote}>
          Applies to all words.
        </p>
      </ControlSection>
    );
  const maxWords = settings.maxWords ?? defaults.maxWords ?? 4;
  const range = cap.words;
  return (
    <ControlSection name="LAYOUT" {...section}>
      <div className={s.colorGroup}>
        <span className={s.colorLabel}>Position</span>
        <div className={s.positionRow}>
          <PositionPad settings={settings} update={update} sideways={cap.positionX} />
          <div className={s.positionSliders}>
            <NumberSlider
              label="Vertical"
              value={settings.y}
              min={0}
              max={100}
              step={0.1}
              unit="%"
              defaultValue={defaults.y}
              onChange={(y) => update({ y }, true)}
              onReset={() => update({ y: defaults.y })}
            />
            {cap.positionX && <NumberSlider
              label="Horizontal"
              value={settings.x}
              min={0}
              max={100}
              step={0.1}
              unit="%"
              defaultValue={50}
              onChange={(x) => update({ x }, true)}
              onReset={() => update({ x: 50 })}
            />}
          </div>
        </div>
        {cap.rotation && (
          <NumberSlider
            label="Rotation"
            value={settings.rotation ?? 0}
            min={-45}
            max={45}
            step={1}
            unit="°"
            defaultValue={0}
            onChange={(rotation) => update({ rotation }, true)}
            onReset={() => update({ rotation: undefined })}
          />
        )}
      </div>

      {cap.width && (
        <div className={s.colorGroup}>
          <span className={s.colorLabel}>Text box</span>
          {cap.width && (
            <NumberSlider
              label="Box width"
              value={Math.round((settings.maxWidth ?? 0.9) * 100)}
              min={20}
              max={100}
              step={1}
              unit="%"
              defaultValue={90}
              onChange={(value) => update({ maxWidth: value / 100 }, true)}
              onReset={() => update({ maxWidth: undefined })}
            />
          )}
        </div>
      )}

      {!range && words && <WordCountControls settings={settings} update={update} count={words} />}
      {range && (
      <div className={s.colorGroup}>
          <span className={s.colorLabel}>Lines & words</span>
          <div className={s.inlineField}>
            <span>Quick pick</span>
            <div className={s.iconSegmented} role="group" aria-label="Words per caption">
              {WORD_QUICK_PICKS.filter(
                (value) => value >= range[0] && value <= range[1],
              ).map((value) => (
                <button
                  type="button"
                  key={value}
                  title={`${value} word${value > 1 ? "s" : ""} at a time`}
                  aria-pressed={maxWords === value}
                  onClick={() => update({ maxWords: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <NumberSlider
            label="Words per caption"
            value={maxWords}
            min={range[0]}
            max={range[1]}
            step={1}
            defaultValue={defaults.maxWords ?? 4}
            format={(value) =>
              value <= 2 ? "Punchy" : value <= 5 ? "Balanced" : "Subtitle"
            }
            onChange={(value) => update({ maxWords: value }, true)}
            onReset={() => update({ maxWords: defaults.maxWords })}
          />
          {cap.maxLines && (
            <div className={s.inlineField}>
              <span>Max lines</span>
              <div className={s.iconSegmented} role="group" aria-label="Max lines">
                {([undefined, 1, 2, 3] as const).map((value) => (
                  <button
                    type="button"
                    key={value ?? "auto"}
                    title={
                      value
                        ? `Never more than ${value} line${value > 1 ? "s" : ""}`
                        : "Let the words-per-caption limit decide"
                    }
                    aria-pressed={settings.maxLines === value}
                    onClick={() => update({ maxLines: value })}
                  >
                    {value ?? "Auto"}
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
      )}
    </ControlSection>
  );
}

const SPACING_PRESETS = [
  { name: "Tight", letterSpacing: -0.5, wordSpacing: -0.5, lineSpacing: 0.95 },
  { name: "Normal", letterSpacing: 0, wordSpacing: 0, lineSpacing: 1.15 },
  { name: "Airy", letterSpacing: 1, wordSpacing: 2, lineSpacing: 1.4 },
] as const;

export function SpacingControls({
  settings,
  update,
  defaults,
  cap,
  wholeCaption,
  section,
  parts = [],
  updatePart,
}: Props & {
  /** Kinds of text that can take a letter spacing of their own, like Design and Motion. */
  parts?: { id: PartId; label: string }[];
  updatePart?: (id: PartId, patch: Partial<PartSettings> | null, schedule?: boolean) => void;
}) {
  const [picked, setPicked] = useState<PartId | "all">("all");
  const on = parts.some((part) => part.id === picked) && updatePart ? (picked as PartId) : "all";
  const letter = on === "all" ? settings.letterSpacing ?? 0 : settings.parts?.[on]?.letterSpacing ?? 0;
  const setLetter = (letterSpacing: number | undefined, schedule = false) =>
    on === "all" ? update({ letterSpacing }, schedule) : updatePart!(on, { letterSpacing }, schedule);
  const word = settings.wordSpacing ?? 0;
  const line = settings.lineSpacing ?? 1.1;
  // Word and line gaps only exist once a caption can hold more than one word.
  const multiWord = (settings.maxWords ?? defaults.maxWords ?? 4) > 1;
  const showLine = cap.lineSpacing && wholeCaption && multiWord;
  const showWord = cap.wordSpacing && wholeCaption && multiWord;
  if (!cap.letterSpacing && !showLine && !showWord) return null;
  // Styles built from kinds of text: one plain list, each kind with its letter and word gap (0 = the design's).
  if (cap.partText && parts.length > 0 && updatePart)
    return (
      <ControlSection name="SPACING" {...section}>
        {parts.map((part) => (
          <div className={s.colorGroup} key={part.id}>
            <span className={s.colorLabel}>{part.label}</span>
            <NumberSlider
              label="Letter spacing"
              value={settings.parts?.[part.id]?.letterSpacing ?? 0}
              min={-1}
              max={7.5}
              step={0.05}
              unit="px"
              defaultValue={0}
              onChange={(value) => updatePart(part.id, { letterSpacing: value || undefined }, true)}
              onReset={() => updatePart(part.id, { letterSpacing: undefined })}
            />
            <NumberSlider
              label="Word spacing"
              value={settings.parts?.[part.id]?.wordSpacing ?? 0}
              min={-4}
              max={20}
              step={0.5}
              unit="px"
              defaultValue={0}
              onChange={(value) => updatePart(part.id, { wordSpacing: value || undefined }, true)}
              onReset={() => updatePart(part.id, { wordSpacing: undefined })}
            />
          </div>
        ))}
      </ControlSection>
    );
  const activePreset = SPACING_PRESETS.find(
    (preset) =>
      Math.abs(preset.letterSpacing - letter) < 0.03 &&
      (!showWord || Math.abs(preset.wordSpacing - word) < 0.03) &&
      (!showLine || Math.abs(preset.lineSpacing - line) < 0.01),
  )?.name;
  return (
    <ControlSection name="SPACING" {...section}>
      {cap.letterSpacing && parts.length > 0 && updatePart && (
        <div className={s.colorGroup}>
          <span className={s.colorLabel}>Spacing for</span>
          <div className={s.fxLooks} role="group" aria-label="Which text this spacing changes">
            {[{ id: "all" as const, label: "Whole caption" }, ...parts].map((part) => (
              <button type="button" key={part.id} aria-pressed={on === part.id} onClick={() => setPicked(part.id)}>
                {part.label}
                {part.id !== "all" && (settings.parts?.[part.id]?.letterSpacing || settings.parts?.[part.id]?.wordSpacing) ? " •" : ""}
              </button>
            ))}
          </div>
        </div>
      )}
      {cap.letterSpacing && on === "all" && <div className={s.colorModes} role="group" aria-label="Spacing presets">
        {SPACING_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.name}
            aria-pressed={activePreset === preset.name}
            onClick={() =>
              update({
                letterSpacing: preset.letterSpacing,
                ...(showWord ? { wordSpacing: preset.wordSpacing } : {}),
                ...(showLine ? { lineSpacing: preset.lineSpacing } : {}),
              })
            }
          >
            <i
              className={s.spacingGlyph}
              data-preset={preset.name.toLowerCase()}
              aria-hidden="true"
            >
              Aa
            </i>
            {preset.name}
          </button>
        ))}
      </div>}
      {cap.letterSpacing && <NumberSlider
        label={on === "all" ? "Letter spacing" : `${parts.find((part) => part.id === on)?.label} spacing`}
        value={letter}
        min={-1}
        max={7.5}
        step={0.05}
        unit="px"
        defaultValue={on === "all" ? defaults.letterSpacing ?? 0 : 0}
        onChange={(value) => setLetter(value, true)}
        onReset={() => setLetter(on === "all" ? defaults.letterSpacing ?? 0 : undefined)}
      />}
      {/* Styles that set each kind of text apart take a word gap per kind; normal (0) by default. */}
      {cap.partText && on !== "all" && updatePart && <NumberSlider
        label={`${parts.find((part) => part.id === on)?.label} word spacing`}
        value={settings.parts?.[on]?.wordSpacing ?? 0}
        min={-4}
        max={20}
        step={0.5}
        unit="px"
        defaultValue={0}
        onChange={(value) => updatePart(on, { wordSpacing: value || undefined }, true)}
        onReset={() => updatePart(on, { wordSpacing: undefined })}
      />}
      {showWord && (
        <NumberSlider
          label="Word spacing"
          value={word}
          min={-1}
          max={12}
          step={0.25}
          unit="px"
          defaultValue={0}
          onChange={(wordSpacing) => update({ wordSpacing }, true)}
          onReset={() => update({ wordSpacing: undefined })}
        />
      )}
      {showLine && (
        <NumberSlider
          label="Line spacing"
          value={line}
          min={0.8}
          max={2.5}
          step={0.01}
          unit="×"
          defaultValue={defaults.lineSpacing ?? 1.1}
          onChange={(lineSpacing) => update({ lineSpacing }, true)}
          onReset={() => update({ lineSpacing: defaults.lineSpacing ?? 1.1 })}
        />
      )}
    </ControlSection>
  );
}
