"use client";
import { useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_GRADIENT,
  type CaptionSettings,
  type GradientStop,
} from "./captionSettings";
import { ControlSection, NumberSlider, ResetIcon, type SectionReset } from "./SettingsControls";
import type { StyleCapabilities } from "./styleCapabilities";
import ColorField from "./ColorField";
import s from "./CaptionSettingsPanel.module.css";

function interpolateStop(stops: GradientStop[], position: number) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const before =
    [...sorted].reverse().find((item) => item.position <= position) ??
    sorted[0];
  const after =
    sorted.find((item) => item.position >= position) ??
    sorted[sorted.length - 1];
  const t =
    after.position === before.position
      ? 0
      : (position - before.position) / (after.position - before.position);
  return (
    "#" +
    [1, 3, 5]
      .map((index) =>
        Math.round(
          parseInt(before.color.slice(index, index + 2), 16) * (1 - t) +
            parseInt(after.color.slice(index, index + 2), 16) * t,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
// Relative luminance (0–1) of a #rrggbb color, used to keep previews and checkmarks readable.
function luminance(color: string) {
  if (!/^#[a-f0-9]{6}$/i.test(color)) return 1;
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const QUICK_COLORS: { name: string; value: string }[] = [
  { name: "White", value: "#ffffff" },
  { name: "Lemon", value: "#ffe36b" },
  { name: "Orange", value: "#ffb347" },
  { name: "Red", value: "#ff5c5c" },
  { name: "Pink", value: "#ff7ac8" },
  { name: "Violet", value: "#9d7bff" },
  { name: "Sky", value: "#5cc8ff" },
  { name: "Green", value: "#4ade80" },
  { name: "Black", value: "#111111" },
];
const GRADIENT_PRESETS: { name: string; from: string; to: string }[] = [
  { name: "Sunset", from: "#ff9a3c", to: "#ff3d6e" },
  { name: "Ocean", from: "#38bdf8", to: "#6366f1" },
  { name: "Aurora", from: "#34d399", to: "#3b82f6" },
  { name: "Gold", from: "#fde047", to: "#f59e0b" },
  { name: "Candy", from: "#f472b6", to: "#a78bfa" },
  { name: "Silver", from: "#ffffff", to: "#9ca3af" },
];
const MAX_STOPS = 8;

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

type ColorSettings = Pick<CaptionSettings, "color" | "colorMode" | "gradientStops" | "gradientAngle" | "gradientScope">;
const Plain = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export default function ColorControls({
  settings,
  update,
  defaultColor = "#ffffff",
  cap,
  section,
  keyWord = false,
  solidOnly = false,
  label,
  onResetColor,
  scopeLabels,
}: {
  /** Names of the two gradient scopes, when they aren't the whole word and each letter. */
  scopeLabels?: [string, string];
  defaultColor?: string;
  cap: StyleCapabilities;
  section?: SectionReset;
  /** Inside the Emphasis section: no heading of its own, and word-wide gradients only. */
  keyWord?: boolean;
  /** No gradient mode, for a part the design can only paint in one color. */
  solidOnly?: boolean;
  /** What the preview says instead of the default. */
  label?: string;
  /** Replaces going back to the default color, for a part with none of its own. */
  onResetColor?: () => void;
  settings: ColorSettings;
  update: (patch: Partial<ColorSettings>, schedule?: boolean) => void;
}) {
  const stops = settings.gradientStops ?? DEFAULT_GRADIENT;
  const [selected, setSelected] = useState(stops[0].id);
  const stop = stops.find((item) => item.id === selected) ?? stops[0];
  const track = useRef<HTMLDivElement>(null);
  const latest = useRef(stops);
  useLayoutEffect(() => {
    latest.current = stops;
  }, [stops]);
  const offersGradient = (cap.gradient || keyWord) && !solidOnly;
  const isGradient = offersGradient && settings.colorMode === "gradient";
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);
  const stopList = sortedStops
    .map((item) => `${item.color} ${item.position}%`)
    .join(", ");
  const gradient = `linear-gradient(90deg, ${stopList})`;
  const angle = settings.gradientAngle ?? 90;
  const activePreset =
    stops.length === 2
      ? GRADIENT_PRESETS.find(
          (preset) =>
            sortedStops[0].color.toLowerCase() === preset.from &&
            sortedStops[0].position === 0 &&
            sortedStops[1].color.toLowerCase() === preset.to &&
            sortedStops[1].position === 100,
        )?.name
      : undefined;
  // Average brightness decides whether the preview needs a light backdrop.
  const previewLuminance = isGradient
    ? stops.reduce((sum, item) => sum + luminance(item.color), 0) /
      stops.length
    : luminance(settings.color);
  const edit = (id: string, patch: Partial<GradientStop>) =>
    update(
      {
        gradientStops: latest.current.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
      true,
    );
  function add(position: number) {
    if (stops.length >= MAX_STOPS) return;
    const id = crypto.randomUUID();
    setSelected(id);
    update({
      gradientStops: [
        ...stops,
        { id, position, color: interpolateStop(stops, position) },
      ],
    });
  }
  function remove(id: string) {
    if (stops.length <= 2) return;
    const remaining = stops.filter((item) => item.id !== id);
    setSelected(remaining[0].id);
    update({ gradientStops: remaining });
  }
  if (!cap.textColor && !keyWord) return null;
  const Wrap = keyWord ? Plain : ControlSection;
  return (
    <Wrap name="TEXT COLOR" {...section}>
      <div
        className={s.colorPreview}
        data-light={previewLuminance < 0.18}
        aria-hidden="true"
      >
        <span
          style={
            isGradient
              ? {
                  backgroundImage: `linear-gradient(${angle}deg, ${stopList})`,
                }
              : { color: settings.color }
          }
          data-gradient={isGradient}
        >
          {label ?? (keyWord ? "Key word" : "Your caption")}
        </span>
        <small>
          {isGradient
            ? (activePreset ?? `${stops.length} colors`) + ` · ${angle}°`
            : settings.color.toUpperCase()}
        </small>
      </div>

      {offersGradient && (
        <div className={s.colorModes} role="group" aria-label="Color mode">
          {(["solid", "gradient"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={(settings.colorMode ?? "solid") === mode}
              onClick={() => update({ colorMode: mode })}
            >
              <i data-mode={mode} aria-hidden="true" />
              {mode === "solid" ? "Solid" : "Gradient"}
            </button>
          ))}
        </div>
      )}

      {!isGradient ? (
        <>
          <div className={s.colorGroup}>
            <span className={s.colorLabel}>Presets</span>
            <div
              className={s.quickColors}
              role="group"
              aria-label="Quick colors"
            >
              {QUICK_COLORS.map(({ name, value }) => {
                const active = settings.color.toLowerCase() === value;
                return (
                  <button
                    type="button"
                    key={value}
                    title={`${name} ${value.toUpperCase()}`}
                    aria-label={`Use ${name}`}
                    aria-pressed={active}
                    style={{
                      background: value,
                      color: luminance(value) > 0.4 ? "#1a1622" : "#ffffff",
                    }}
                    onClick={() => update({ color: value })}
                  >
                    {active && <CheckIcon />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={s.colorGroup}>
            <span className={s.colorLabel}>Custom</span>
            <div className={s.colorCustomRow}>
              <ColorField
                label="Text color"
                color={settings.color}
                onChange={(color) => update({ color }, true)}
              />
              <button
                type="button"
                className={s.reset}
                title="Reset color"
                aria-label="Reset color"
                onClick={() => (onResetColor ? onResetColor() : update({ color: defaultColor }))}
              >
                <ResetIcon />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={s.colorGroup}>
            <span className={s.colorLabel}>Presets</span>
            <div
              className={s.gradientPresets}
              role="group"
              aria-label="Gradient presets"
            >
              {GRADIENT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  aria-label={`${preset.name} gradient`}
                  aria-pressed={activePreset === preset.name}
                  onClick={() => {
                    setSelected("start");
                    update({
                      gradientStops: [
                        { id: "start", color: preset.from, position: 0 },
                        { id: "end", color: preset.to, position: 100 },
                      ],
                    });
                  }}
                >
                  <span
                    style={{
                      background: `linear-gradient(90deg, ${preset.from}, ${preset.to})`,
                    }}
                  />
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className={s.colorGroup}>
            <div className={s.stopsHeader}>
              <span className={s.colorLabel}>
                Colors{" "}
                <em>
                  {stops.length}/{MAX_STOPS}
                </em>
              </span>
              <div>
                <button
                  type="button"
                  disabled={stops.length >= MAX_STOPS}
                  aria-label="Add color stop"
                  title="Add color stop"
                  onClick={() => add(50)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Reverse gradient"
                  title="Reverse colors"
                  onClick={() =>
                    update({
                      gradientStops: stops.map((item) => ({
                        ...item,
                        position: 100 - item.position,
                      })),
                    })
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 5.5h10M9.5 3l2.5 2.5L9.5 8M14 10.5H4M6.5 8 4 10.5 6.5 13" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Reset gradient"
                  title="Reset gradient"
                  onClick={() => {
                    setSelected("start");
                    update({
                      gradientStops: DEFAULT_GRADIENT,
                      gradientAngle: 90,
                      gradientScope: "word",
                    });
                  }}
                >
                  <ResetIcon />
                </button>
              </div>
            </div>
            <div className={s.gradientBlock}>
              <div className={s.gradientTrackWrap}>
                <div
                  ref={track}
                  className={s.gradientTrack}
                  style={{ background: gradient }}
                  title="Click to add a color stop"
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    add(
                      Math.round(
                        Math.max(
                          0,
                          Math.min(
                            100,
                            ((event.clientX - rect.left) / rect.width) * 100,
                          ),
                        ),
                      ),
                    );
                  }}
                >
                  {stops.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      role="slider"
                      aria-label={`Gradient stop ${index + 1}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.position}
                      aria-valuetext={`${item.position}% ${item.color}`}
                      className={s.gradientStop}
                      data-selected={stop.id === item.id}
                      style={
                        {
                          left: `${item.position}%`,
                          "--stop-color": item.color,
                        } as React.CSSProperties
                      }
                      onFocus={() => setSelected(item.id)}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelected(item.id);
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        if (
                          !event.currentTarget.hasPointerCapture(
                            event.pointerId,
                          ) ||
                          !track.current
                        )
                          return;
                        const rect = track.current.getBoundingClientRect();
                        edit(item.id, {
                          position: Math.round(
                            Math.max(
                              0,
                              Math.min(
                                100,
                                ((event.clientX - rect.left) / rect.width) *
                                  100,
                              ),
                            ),
                          ),
                        });
                      }}
                      onPointerUp={(event) => {
                        if (
                          event.currentTarget.hasPointerCapture(
                            event.pointerId,
                          )
                        )
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          );
                      }}
                      onKeyDown={(event) => {
                        if (
                          ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            event.key,
                          )
                        ) {
                          event.preventDefault();
                          edit(item.id, {
                            position:
                              event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? 100
                                  : Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        item.position +
                                          (event.key === "ArrowLeft" ? -1 : 1),
                                      ),
                                    ),
                          });
                        }
                        if (
                          event.key === "Delete" ||
                          event.key === "Backspace"
                        ) {
                          event.preventDefault();
                          remove(item.id);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className={s.colorHint}>
                Click the bar to add a color · drag a marker to move it
              </p>
              <div className={s.stopEditor}>
                <ColorField
                  label="Stop color"
                  color={stop.color}
                  onChange={(color) => edit(stop.id, { color })}
                />
                <div className={s.stopPosition}>
                  <input
                    type="number"
                    aria-label="Stop position"
                    min={0}
                    max={100}
                    value={stop.position}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const position = event.target.valueAsNumber;
                      if (Number.isFinite(position))
                        edit(stop.id, {
                          position: Math.max(0, Math.min(100, position)),
                        });
                    }}
                  />
                  <span>%</span>
                </div>
                <button
                  type="button"
                  className={s.removeStop}
                  title={
                    stops.length <= 2
                      ? "A gradient needs at least 2 colors"
                      : "Remove selected color"
                  }
                  aria-label="Remove selected stop"
                  disabled={stops.length <= 2}
                  onClick={() => remove(stop.id)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 6h12M8 3h4M6 6l1 11h6l1-11M9 9v5M11 9v5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <NumberSlider
            label="Angle"
            value={angle}
            min={0}
            max={360}
            unit="°"
            onChange={(gradientAngle) => update({ gradientAngle }, true)}
            onReset={() => update({ gradientAngle: 90 })}
          />
          {(!keyWord || scopeLabels) && <div className={s.scopeRow}>
            <span>Apply to</span>
            <div className={s.segmented} aria-label="Gradient scope">
              {(["word", "character"] as const).map((scope) => (
                <button
                  type="button"
                  key={scope}
                  aria-pressed={(settings.gradientScope ?? "word") === scope}
                  onClick={() => update({ gradientScope: scope })}
                >
                  {scopeLabels ? scopeLabels[scope === "word" ? 0 : 1] : scope === "word" ? "Whole word" : "Each letter"}
                </button>
              ))}
            </div>
          </div>}
        </>
      )}
    </Wrap>
  );
}
