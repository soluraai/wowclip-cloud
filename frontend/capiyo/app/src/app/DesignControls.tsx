"use client";
import type { CSSProperties, ReactNode } from "react";
import {
  BLEND_MODES,
  DEFAULT_EFFECTS,
  resolveEffects,
  type BlendMode,
  type CaptionSettings,
  type TextEffects,
} from "./captionSettings";
import ColorField from "./ColorField";
import { ControlSection, NumberSlider, type SectionReset } from "./SettingsControls";
import s from "./CaptionSettingsPanel.module.css";

type Props = {
  settings: CaptionSettings;
  update: (patch: Partial<CaptionSettings>, schedule?: boolean) => void;
  wholeCaption: boolean;
  /** The style draws its own words: every effect goes on the whole caption as one layer. */
  layer?: boolean;
  section?: SectionReset;
  /** Heading, when this edits key words instead of the whole caption. */
  name?: string;
  /** Shows the blend picker even when this is not the whole caption (key words). */
  blend?: boolean;
  /** Shown first in the section: which kind of text this Design edits. */
  head?: ReactNode;
};

/** One-click looks. Each only touches the four effects; opacity and blend are kept. */
const LOOKS: { name: string; effects: Partial<TextEffects> }[] = [
  { name: "None", effects: {} },
  { name: "Outline", effects: { stroke: { on: true, color: "#000000", width: 2.5 } } },
  {
    name: "Soft shadow",
    effects: { shadow: { on: true, color: "#000000", opacity: 55, blur: 8, x: 0, y: 4 } },
  },
  {
    name: "Neon",
    effects: { glow: { on: true, color: "#39f0ff", opacity: 90, blur: 14 } },
  },
  {
    name: "3D pop",
    effects: {
      depth: { on: true, color: "#570df8", length: 7, angle: 60 },
      shadow: { on: true, color: "#000000", opacity: 45, blur: 6, x: 0, y: 3 },
    },
  },
  {
    name: "Comic",
    effects: {
      stroke: { on: true, color: "#000000", width: 3 },
      depth: { on: true, color: "#000000", length: 5, angle: 45 },
    },
  },
];

function Effect({
  title,
  on,
  onToggle,
  children,
}: {
  title: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={s.fxCard} data-on={on}>
      <div className={s.fxHead}>
        <span>{title}</span>
        <button
          type="button"
          role="switch"
          className={s.switch}
          aria-checked={on}
          aria-label={`${title} on or off`}
          onClick={() => onToggle(!on)}
        >
          <span />
        </button>
      </div>
      {on && <div className={s.fxBody}>{children}</div>}
    </div>
  );
}

function ColorRow({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className={s.fxColor}>
      <span>{label}</span>
      <ColorField label={label} color={color} onChange={onChange} />
    </div>
  );
}

/** Each blend mode as a small swatch: a light and a dark band behind "Aa" drawn in that mode. */
function BlendPicker({ value, onChange }: { value: BlendMode; onChange: (mode: BlendMode) => void }) {
  return (
    <div className={s.blendGrid} role="radiogroup" aria-label="Blend mode">
      {BLEND_MODES.map((mode) => (
        <button
          type="button"
          key={mode.id}
          role="radio"
          aria-checked={value === mode.id}
          title={mode.label}
          onClick={() => onChange(mode.id)}
        >
          <span className={s.blendSwatch} aria-hidden="true">
            <i style={{ mixBlendMode: mode.id as CSSProperties["mixBlendMode"] }}>Aa</i>
          </span>
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export function DesignControls({ settings, update, wholeCaption, layer: _layer, section, name = "DESIGN", blend, head }: Props) {
  const fx = resolveEffects(settings.effects);
  const set = (patch: Partial<TextEffects>, schedule = true) =>
    update({ effects: { ...fx, ...patch } }, schedule);
  const stroke = (patch: Partial<TextEffects["stroke"]>) =>
    set({ stroke: { ...fx.stroke, ...patch } });
  const shadow = (patch: Partial<TextEffects["shadow"]>) =>
    set({ shadow: { ...fx.shadow, ...patch } });
  const glow = (patch: Partial<TextEffects["glow"]>) =>
    set({ glow: { ...fx.glow, ...patch } });
  const depth = (patch: Partial<TextEffects["depth"]>) =>
    set({ depth: { ...fx.depth, ...patch } });
  const D = DEFAULT_EFFECTS;
  const looks = LOOKS;
  const activeLook = looks.find((look) => {
    const want = resolveEffects({ ...look.effects, opacity: fx.opacity, blend: fx.blend });
    return JSON.stringify(want) === JSON.stringify(fx);
  })?.name;

  return (
    <ControlSection name={name} {...section}>
      {head}
      <div className={s.colorGroup}>
        <span className={s.colorLabel}>Quick looks</span>
        <div className={s.fxLooks} role="group" aria-label="Quick looks">
          {looks.map((look) => (
            <button
              type="button"
              key={look.name}
              aria-pressed={activeLook === look.name}
              onClick={() =>
                update(
                  {
                    effects: resolveEffects({
                      ...look.effects,
                      opacity: fx.opacity,
                      blend: fx.blend,
                    }),
                  },
                  false,
                )
              }
            >
              {look.name}
            </button>
          ))}
        </div>
      </div>

      <Effect title="Stroke" on={fx.stroke.on} onToggle={(on) => stroke({ on })}>
        <ColorRow label="Stroke color" color={fx.stroke.color} onChange={(color) => stroke({ color })} />
        <NumberSlider
          label="Stroke width"
          value={fx.stroke.width}
          min={0.25}
          max={10}
          step={0.05}
          unit="px"
          defaultValue={D.stroke.width}
          onChange={(width) => stroke({ width })}
          onReset={() => stroke({ width: D.stroke.width })}
        />
      </Effect>

      <Effect title="Shadow" on={fx.shadow.on} onToggle={(on) => shadow({ on })}>
        <ColorRow label="Shadow color" color={fx.shadow.color} onChange={(color) => shadow({ color })} />
        <NumberSlider
          label="Shadow opacity"
          value={fx.shadow.opacity}
          min={0}
          max={100}
          unit="%"
          defaultValue={D.shadow.opacity}
          onChange={(opacity) => shadow({ opacity })}
          onReset={() => shadow({ opacity: D.shadow.opacity })}
        />
        <NumberSlider
          label="Shadow blur"
          value={fx.shadow.blur}
          min={0}
          max={30}
          step={0.5}
          unit="px"
          defaultValue={D.shadow.blur}
          onChange={(blur) => shadow({ blur })}
          onReset={() => shadow({ blur: D.shadow.blur })}
        />
        <NumberSlider
          label="Shadow X"
          value={fx.shadow.x}
          min={-30}
          max={30}
          step={0.5}
          unit="px"
          defaultValue={D.shadow.x}
          onChange={(x) => shadow({ x })}
          onReset={() => shadow({ x: D.shadow.x })}
        />
        <NumberSlider
          label="Shadow Y"
          value={fx.shadow.y}
          min={-30}
          max={30}
          step={0.5}
          unit="px"
          defaultValue={D.shadow.y}
          onChange={(y) => shadow({ y })}
          onReset={() => shadow({ y: D.shadow.y })}
        />
      </Effect>

      <Effect title="Glow" on={fx.glow.on} onToggle={(on) => glow({ on })}>
        <ColorRow label="Glow color" color={fx.glow.color} onChange={(color) => glow({ color })} />
        <NumberSlider
          label="Glow strength"
          value={fx.glow.opacity}
          min={0}
          max={100}
          unit="%"
          defaultValue={D.glow.opacity}
          onChange={(opacity) => glow({ opacity })}
          onReset={() => glow({ opacity: D.glow.opacity })}
        />
        <NumberSlider
          label="Glow size"
          value={fx.glow.blur}
          min={0}
          max={40}
          step={0.5}
          unit="px"
          defaultValue={D.glow.blur}
          onChange={(blur) => glow({ blur })}
          onReset={() => glow({ blur: D.glow.blur })}
        />
      </Effect>

      <Effect title="3D depth" on={fx.depth.on} onToggle={(on) => depth({ on })}>
        <ColorRow label="Depth color" color={fx.depth.color} onChange={(color) => depth({ color })} />
        <NumberSlider
          label="Depth"
          value={fx.depth.length}
          min={1}
          max={20}
          step={0.5}
          unit="px"
          defaultValue={D.depth.length}
          onChange={(length) => depth({ length })}
          onReset={() => depth({ length: D.depth.length })}
        />
        <NumberSlider
          label="Direction"
          value={fx.depth.angle}
          min={0}
          max={360}
          step={5}
          unit="°"
          defaultValue={D.depth.angle}
          onChange={(angle) => depth({ angle })}
          onReset={() => depth({ angle: D.depth.angle })}
        />
      </Effect>

      <div className={s.colorGroup}>
        <span className={s.colorLabel}>Blending</span>
        <NumberSlider
          label="Opacity"
          value={fx.opacity}
          min={0}
          max={100}
          unit="%"
          defaultValue={D.opacity}
          onChange={(opacity) => set({ opacity })}
          onReset={() => set({ opacity: D.opacity })}
        />
        {(wholeCaption || blend) && <BlendPicker value={fx.blend} onChange={(blend) => set({ blend }, false)} />}
      </div>
    </ControlSection>
  );
}
