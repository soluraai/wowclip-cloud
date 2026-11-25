"use client";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ANIMATION,
  type AnimationSettings,
  type CaptionSettings,
} from "./captionSettings";
import { ControlSection, type SectionReset } from "./SettingsControls";
import type { StyleCapabilities } from "./styleCapabilities";
import {
  enterFrame,
  exitFrame,
  type MotionIn,
  type MotionOut,
  type MotionUnit,
} from "../../../captions/src/BasicCaption/motion";
import s from "./CaptionSettingsPanel.module.css";

// Each list runs from the motions people reach for most to the rarest.
const IN: { id: MotionIn | "style"; label: string }[] = [
  { id: "style", label: "Original" },
  { id: "fade", label: "Fade" },
  { id: "trail", label: "Slide on" },
  { id: "pop", label: "Pop" },
  { id: "rise", label: "Slide up" },
  { id: "drop", label: "Slide down" },
  { id: "left", label: "Slide right" },
  { id: "right", label: "Slide left" },
  { id: "zoomin", label: "Zoom in" },
  { id: "zoom", label: "Zoom out" },
  { id: "bounce", label: "Bounce" },
  { id: "blur", label: "Blur" },
  { id: "wipe", label: "Wipe" },
  { id: "wipeleft", label: "Wipe back" },
  { id: "wipemid", label: "Open" },
  { id: "spin", label: "Spin" },
  { id: "none", label: "None" },
];
const ADVANCED_IN: { id: MotionIn; label: string }[] = [
  { id: "heatwave", label: "Heat wave" },
  { id: "glide", label: "Glide" },
  { id: "punch", label: "Punch in" },
  { id: "lens", label: "Lens focus" },
  { id: "slap", label: "Slap" },
  { id: "typewriter", label: "Typewriter" },
  { id: "blurrise", label: "Blur rise" },
  { id: "focus", label: "Soft focus" },
  { id: "snap", label: "Snap focus" },
  { id: "cinema", label: "Cinematic" },
  { id: "slam", label: "Slam" },
  { id: "stamp", label: "Stamp" },
  { id: "spring", label: "Spring" },
  { id: "elastic", label: "Elastic" },
  { id: "hookleft", label: "Hook right" },
  { id: "hookright", label: "Hook left" },
  { id: "whip", label: "Whip" },
  { id: "flip", label: "Flip up" },
  { id: "fold", label: "Flip down" },
  { id: "flipside", label: "Flip side" },
  { id: "stretch", label: "Stretch" },
  { id: "jelly", label: "Jelly" },
  { id: "tada", label: "Tada" },
  { id: "wobble", label: "Wobble" },
  { id: "swing", label: "Swing" },
  { id: "shake", label: "Shake" },
  { id: "roll", label: "Roll in" },
  { id: "skew", label: "Skew" },
  { id: "glitch", label: "Glitch" },
  { id: "rgb", label: "RGB split" },
  { id: "neon", label: "Neon" },
  { id: "flicker", label: "Flicker" },
];
const KEY_IN: { id: MotionIn | "same"; label: string }[] = [
  { id: "same", label: "Same as all" },
  ...IN.flatMap((preset) => (preset.id === "style" || preset.id === "none" ? [] : [{ id: preset.id, label: preset.label as string }])),
];
/** The main word keeps the style's own entrance until one is picked. */
const MAIN_IN = KEY_IN.map((preset) => (preset.id === "same" ? { ...preset, label: "Default" } : preset));
const OUT: { id: MotionOut; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "float", label: "Slide up" },
  { id: "sink", label: "Slide down" },
  { id: "slideleft", label: "Slide left" },
  { id: "slideright", label: "Slide right" },
  { id: "shrink", label: "Shrink" },
  { id: "zoomout", label: "Zoom out" },
  { id: "blur", label: "Blur" },
  { id: "blurup", label: "Blur up" },
  { id: "wipe", label: "Wipe" },
  { id: "popout", label: "Pop out" },
  { id: "fall", label: "Fall" },
  { id: "spinout", label: "Spin out" },
  { id: "flipout", label: "Flip out" },
  { id: "glitch", label: "Glitch" },
  { id: "flicker", label: "Flicker" },
];
const KEY_OUT: { id: MotionOut | "same"; label: string }[] = [
  { id: "same", label: "Same as all" },
  ...OUT.filter((preset) => preset.id !== "none"),
];
const UNITS: { id: MotionUnit; label: string }[] = [
  { id: "caption", label: "All at once" },
  { id: "word", label: "Word by word" },
  { id: "line", label: "Line by line" },
];
const REVEALS: { id: NonNullable<AnimationSettings["reveal"]>; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "line", label: "Line" },
  { id: "chunk", label: "Chunk" },
];
const PREVIEW_MS = 800;

/** A preset card that plays its own animation on hover, using the real motion engine. */
function MotionCard({
  label,
  selected,
  best,
  frameAt,
  onPick,
}: {
  label: string;
  selected: boolean;
  best?: boolean;
  frameAt: (t: number) => { opacity: number; transform: string; filter?: string; clipPath?: string };
  onPick: () => void;
}) {
  const [t, setT] = useState(1);
  const raf = useRef<number | null>(null);
  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setT(1);
  };
  const play = () => {
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - started) % (PREVIEW_MS + 500);
      setT(Math.min(1, elapsed / PREVIEW_MS));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className={s.motionCard}
      aria-pressed={selected}
      onPointerEnter={play}
      onPointerLeave={stop}
      onClick={onPick}
    >
      <span className={s.motionStage}>
        <i style={frameAt(t)}>Aa</i>
      </span>
      {label}
      {best && <em className={s.motionBest}>Best</em>}
    </button>
  );
}

export function MotionControls({
  settings,
  update,
  cap,
  wholeCaption,
  best,
  bestKey,
  section,
  onPreview,
  target: shared,
}: {
  /** Set when the panel's All text / Key words switch picks which words this motion is for. */
  target?: "all" | "key";
  settings: CaptionSettings;
  /** `picked` says an entrance or exit card was clicked, even one already selected. */
  update: (patch: Partial<CaptionSettings>, picked?: "in" | "out") => void;
  cap: StyleCapabilities;
  wholeCaption: boolean;
  /** The entrance this style looks best with; Default when its own motion is the best. */
  best?: MotionIn | "style";
  /** The key-word entrance this style is designed with, marked Best on the key-word tab. */
  bestKey?: MotionIn;
  section?: SectionReset;
  onPreview: () => void;
}) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const [ownTarget, setTarget] = useState<"all" | "key">("all");
  const target = shared ?? ownTarget;
  const [advanced, setAdvanced] = useState(() =>
    ADVANCED_IN.some((preset) => preset.id === settings.animation?.in),
  );
  // "Original" is only a choice for a style whose own built-in motion is its best one. Every other
  // style is designed around a real entrance, which is marked Best instead of a separate Default box.
  const inPresets = IN.filter((preset) => preset.id !== "style" || best === "style");
  // A new style's entrance may sit in the other group, and it has to show as selected.
  const [shownIn, setShownIn] = useState(settings.animation?.in);
  if (shownIn !== settings.animation?.in) {
    setShownIn(settings.animation?.in);
    setAdvanced(ADVANCED_IN.some((preset) => preset.id === settings.animation?.in));
  }
  const animation = { ...DEFAULT_ANIMATION, ...settings.animation };
  // Word-level motion needs more than one word on screen.
  const units = (settings.maxWords ?? 4) > 1
    ? UNITS.filter((unit) => cap.motionUnits.includes(unit.id))
    : [];
  const unit = units.some((item) => item.id === animation.unit) ? animation.unit : "caption";
  const reveals = REVEALS.filter((item) => item.id === "word" || cap.reveal?.includes(item.id));
  const reveal = reveals.some((item) => item.id === animation.reveal) ? animation.reveal : "word";
  const set = (patch: Partial<AnimationSettings>, preview = true, picked?: "in" | "out") => {
    update({ animation: { ...animation, ...patch } }, picked);
    if (preview) setTimeout(onPreview, 80);
  };
  // A selected word has one choice: its own entrance. Key words pick theirs the same way.
  const keyMotion = (cap.emphasis !== "none" || cap.partMotion) && cap.keyMotion !== false;
  const keyTab = !wholeCaption || (target === "key" && keyMotion);
  const keyChoice = (wholeCaption ? animation.keyIn : settings.wordIn) ?? "same";
  // Only the panel's Key words side has an exit of its own; a single selected word keeps entrances.
  const keyOutTab = keyTab && wholeCaption;
  const keyOut = animation.keyOut ?? "same";
  const pickKey = (id: MotionIn | "same") => {
    if (wholeCaption) return set({ keyIn: id });
    update({ wordIn: id === "same" ? undefined : id });
    setTimeout(onPreview, 80);
  };
  return (
    <ControlSection name="MOTION" {...section}>
      {wholeCaption && keyMotion && !shared && (
        <div className={s.colorModes} role="group" aria-label="Which words this motion is for">
          {(["all", "key"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={(keyTab ? "key" : "all") === value}
              onClick={() => setTarget(value)}
            >
              {(cap.motionLabels ?? (cap.partMotion ? ["Helper text", "Main word"] : ["All captions", "Emphasized words"]))[value === "all" ? 0 : 1]}
            </button>
          ))}
        </div>
      )}
      {!keyTab && reveals.length > 1 && (
        <div className={s.colorGroup}>
          <span className={s.colorLabel}>Show</span>
          <div className={s.colorModes} data-count={reveals.length} role="group" aria-label="How words appear">
            {reveals.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={reveal === item.id}
                onClick={() => set({ reveal: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!keyTab && units.length > 1 && (
        <div className={s.colorGroup}>
          <span className={s.colorLabel}>Animate</span>
          <div className={s.colorModes} data-count={units.length} role="group" aria-label="What animates">
            {units.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={unit === item.id}
                // Word and line need an entrance to show; Default has none of its own.
                onClick={() => set({ unit: item.id, in: item.id !== "caption" && animation.in === "style" ? (best && best !== "style" ? best : "rise") : animation.in })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={s.colorGroup}>
        {(!keyTab || keyOutTab) && <div className={s.colorModes} role="group" aria-label="Entrance or exit">
          {(["in", "out"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {value === "in" ? "In" : "Out"}
            </button>
          ))}
        </div>}
        {tab === "in" || (keyTab && !keyOutTab) ? (
          <div className={s.motionLevels} role="group" aria-label="Effect group">
            {([false, true] as const).map((value) => (
              <button
                type="button"
                key={String(value)}
                aria-pressed={advanced === value}
                onClick={() => setAdvanced(value)}
              >
                {value ? "Advanced" : "Basic"}
              </button>
            ))}
          </div>
        ) : null}
        <div className={s.motionGrid}>
          {keyOutTab && tab === "out"
            ? KEY_OUT.map((preset) => (
                <MotionCard
                  key={preset.id}
                  label={preset.label}
                  selected={keyOut === preset.id}
                  frameAt={(t) => exitFrame(preset.id === "same" ? "none" : preset.id, t >= 1 ? 0 : t)}
                  onPick={() => set({ keyOut: preset.id })}
                />
              ))
            : keyTab
            ? (advanced ? ADVANCED_IN : cap.partMotion ? MAIN_IN : KEY_IN).map((preset) => (
                <MotionCard
                  key={preset.id}
                  label={preset.label}
                  selected={keyChoice === preset.id}
                  best={bestKey === preset.id}
                  frameAt={(t) => enterFrame(preset.id === "same" ? "none" : preset.id, t)}
                  onPick={() => pickKey(preset.id)}
                />
              ))
            : tab === "in"
            ? (advanced ? ADVANCED_IN : inPresets).map((preset) => (
                <MotionCard
                  key={preset.id}
                  label={preset.label}
                  selected={animation.in === preset.id || (animation.in === "style" && best === preset.id)}
                  best={best === preset.id}
                  frameAt={(t) => enterFrame(preset.id === "style" ? "none" : preset.id, t)}
                  onPick={() => set({ in: preset.id, unit: preset.id === "style" ? "caption" : animation.unit }, true, "in")}
                />
              ))
            : OUT.map((preset) => (
                <MotionCard
                  key={preset.id}
                  label={preset.label}
                  selected={animation.out === preset.id}
                  frameAt={(t) => exitFrame(preset.id, t >= 1 ? 0 : t)}
                  onPick={() => set({ out: preset.id }, true, "out")}
                />
              ))}
        </div>
      </div>
      <button type="button" className={s.motionPreview} onClick={onPreview}>
        ▶ Preview
      </button>
    </ControlSection>
  );
}
