"use client";
import type { ReactNode } from "react";
import type { PlayerRef } from "@remotion/player";
import ColorField from "./ColorField";
import { NumberSlider } from "./SettingsControls";
import {
  DEFAULT_LOOK,
  DEFAULT_VIDEO_FRAME,
  type VideoFrameSettings,
  type VideoSegment,
  type VideoShade,
} from "./videoSettings";
import s from "./CaptionSettingsPanel.module.css";
import v from "./VideoPanel.module.css";

type Change = (value: VideoFrameSettings | ((previous: VideoFrameSettings) => VideoFrameSettings), group?: string) => void;
const D = DEFAULT_VIDEO_FRAME;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One group of the tab: a title, a short line on what it does, and its controls in a box. */
function Group({ title, note, changed, onReset, children }: { title: string; note: string; changed: boolean; onReset: () => void; children: ReactNode }) {
  return (
    <section className={v.group}>
      <header className={v.groupHead}>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
        {changed && <button type="button" onClick={onReset}>Reset</button>}
      </header>
      <div className={v.box}>{children}</div>
    </section>
  );
}

/** A labelled on/off row; its settings open under it while on. */
function Toggle({ title, on, onToggle, children }: { title: string; on: boolean; onToggle: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className={v.toggle} data-on={on}>
      <div className={v.toggleHead}>
        <span>{title}</span>
        <button type="button" role="switch" className={s.switch} aria-checked={on} aria-label={`${title} on or off`} onClick={() => onToggle(!on)}>
          <span />
        </button>
      </div>
      {on && children && <div className={v.toggleBody}>{children}</div>}
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <div className={v.choice}>
      <span>{label}</span>
      <div className={v.segments} role="group" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * The video itself: framing, color look and shades. Everything here is done by FFmpeg in the final render
 * (app/src/remotion/videoFilter.ts), so the cheap caption-strip render stays.
 */
export default function VideoPanel({ video, onChange }: {
  video: VideoFrameSettings;
  onChange: Change;
  duration?: number;
  player?: PlayerRef | null;
  segments?: VideoSegment[];
}) {
  const set = (patch: Partial<VideoFrameSettings>, group?: string) => onChange((previous) => ({ ...previous, ...patch }), group);
  const shade = (key: "bottomShade" | "topShade", patch: Partial<VideoShade>, group?: string) =>
    onChange((previous) => ({ ...previous, [key]: { ...previous[key], ...patch } }), group ?? `video:${key}`);
  const looks = { bottomShade: video.bottomShade, topShade: video.topShade, vignette: video.vignette };
  const look = { ...DEFAULT_LOOK, ...video.look };
  const setLook = (patch: Partial<typeof look>) => onChange((previous) => ({ ...previous, look: { ...DEFAULT_LOOK, ...previous.look, ...patch } }), "video:look");
  const framing = { fit: video.fit, zoom: video.zoom, x: video.x, y: video.y, backdrop: video.backdrop, backdropColor: video.backdropColor, flipX: !!video.flipX };
  const framingDefault = { fit: D.fit, zoom: D.zoom, x: D.x, y: D.y, backdrop: D.backdrop, backdropColor: D.backdropColor, flipX: false };

  return (
    <div className={`${s.panel} ${v.page}`} data-settings-scroll>
      <Group title="Frame" note="How the video fills the screen" changed={!same(framing, framingDefault)}
        onReset={() => set({ ...framingDefault, flipX: undefined }, "video:frame-reset")}>
        <Choice label="Mode" value={video.fit} options={[["fill", "Fill"], ["fit", "Fit"]] as const} onChange={(fit) => set({ fit }, "video:fit")} />
        <NumberSlider label="Zoom" value={Math.round(video.zoom * 100)} min={100} max={300} step={5} unit="%" defaultValue={100}
          onChange={(zoom) => set({ zoom: zoom / 100 }, "video:zoom")} onReset={() => set({ zoom: 1 })} />
        <NumberSlider label="Left / right" value={video.x} min={0} max={100} unit="%" defaultValue={50}
          onChange={(x) => set({ x }, "video:x")} onReset={() => set({ x: 50 })} />
        <NumberSlider label="Up / down" value={video.y} min={0} max={100} unit="%" defaultValue={50}
          onChange={(y) => set({ y }, "video:y")} onReset={() => set({ y: 50 })} />
        <Toggle title="Mirror" on={!!video.flipX} onToggle={(on) => set({ flipX: on || undefined }, "video:flip")} />
        {video.fit === "fit" && (
          <>
            <Choice label="Background" value={video.backdrop} options={[["blur", "Blur"], ["color", "Color"]] as const}
              onChange={(backdrop) => set({ backdrop }, "video:backdrop")} />
            {video.backdrop === "color" && (
              <div className={s.fxColor}>
                <span>Background color</span>
                <ColorField label="Background color" color={video.backdropColor} onChange={(backdropColor) => set({ backdropColor }, "video:backdrop-color")} />
              </div>
            )}
          </>
        )}
      </Group>

      <Group title="Color" note="Adjust the look of the footage" changed={!same(look, DEFAULT_LOOK)} onReset={() => set({ look: DEFAULT_LOOK }, "video:look-reset")}>
        <NumberSlider label="Brightness" value={look.brightness} min={50} max={150} unit="%" defaultValue={100}
          onChange={(brightness) => setLook({ brightness })} onReset={() => setLook({ brightness: 100 })} />
        <NumberSlider label="Contrast" value={look.contrast} min={50} max={150} unit="%" defaultValue={100}
          onChange={(contrast) => setLook({ contrast })} onReset={() => setLook({ contrast: 100 })} />
        <NumberSlider label="Saturation" value={look.saturation} min={0} max={200} unit="%" defaultValue={100}
          onChange={(saturation) => setLook({ saturation })} onReset={() => setLook({ saturation: 100 })} />
        <NumberSlider label="Hue" value={look.hue} min={-180} max={180} unit="°" defaultValue={0}
          onChange={(hue) => setLook({ hue })} onReset={() => setLook({ hue: 0 })} />
        <Toggle title="Black & white" on={look.saturation === 0} onToggle={(on) => setLook({ saturation: on ? 0 : 100 })} />
      </Group>

      <Group title="Shade" note="Darken edges so captions stay readable" changed={!same(looks, { bottomShade: D.bottomShade, topShade: D.topShade, vignette: D.vignette })}
        onReset={() => set({ bottomShade: D.bottomShade, topShade: D.topShade, vignette: D.vignette }, "video:shade-reset")}>
        <Toggle title="Bottom shade" on={video.bottomShade.on} onToggle={(on) => shade("bottomShade", { on })}>
          <NumberSlider label="Strength" value={video.bottomShade.strength} min={0} max={100} unit="%" defaultValue={D.bottomShade.strength}
            onChange={(strength) => shade("bottomShade", { strength })} onReset={() => shade("bottomShade", { strength: D.bottomShade.strength })} />
          <NumberSlider label="Height" value={video.bottomShade.height} min={5} max={100} unit="%" defaultValue={D.bottomShade.height}
            onChange={(height) => shade("bottomShade", { height })} onReset={() => shade("bottomShade", { height: D.bottomShade.height })} />
          <div className={s.fxColor}>
            <span>Color</span>
            <ColorField label="Bottom shade color" color={video.bottomShade.color} onChange={(color) => shade("bottomShade", { color })} />
          </div>
        </Toggle>
        <Toggle title="Top shade" on={video.topShade.on} onToggle={(on) => shade("topShade", { on })}>
          <NumberSlider label="Strength" value={video.topShade.strength} min={0} max={100} unit="%" defaultValue={D.topShade.strength}
            onChange={(strength) => shade("topShade", { strength })} onReset={() => shade("topShade", { strength: D.topShade.strength })} />
          <NumberSlider label="Height" value={video.topShade.height} min={5} max={100} unit="%" defaultValue={D.topShade.height}
            onChange={(height) => shade("topShade", { height })} onReset={() => shade("topShade", { height: D.topShade.height })} />
          <div className={s.fxColor}>
            <span>Color</span>
            <ColorField label="Top shade color" color={video.topShade.color} onChange={(color) => shade("topShade", { color })} />
          </div>
        </Toggle>
        <Toggle title="Vignette" on={video.vignette.on} onToggle={(on) => set({ vignette: { ...video.vignette, on } }, "video:vignette")}>
          <NumberSlider label="Strength" value={video.vignette.strength} min={0} max={100} unit="%" defaultValue={D.vignette.strength}
            onChange={(strength) => set({ vignette: { ...video.vignette, strength } }, "video:vignette")}
            onReset={() => set({ vignette: { ...video.vignette, strength: D.vignette.strength } })} />
        </Toggle>
      </Group>
    </div>
  );
}
