"use client";
import { ResetIcon } from "./SettingsControls";
import s from "./CaptionSettingsPanel.module.css";

export type OverviewSwitch = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};
export type OverviewContext = {
  /** The style's main parts, each one a single on/off. */
  switches: OverviewSwitch[];
  changed: boolean;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Words carrying their own edits, which changes to the whole caption leave alone. */
  customWords: number;
  onClearWords: () => void;
};

const ArrowIcon = ({ flip }: { flip?: boolean }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={flip ? { transform: "scaleX(-1)" } : undefined}
  >
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

/** Always-visible history, global reset and the style's main switches. */
export default function StyleOverview({ context }: { context: OverviewContext }) {
  return (
    <div className={s.overview}>
      <div className={s.overviewTools}>
        <button
          type="button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!context.canUndo}
          onClick={context.onUndo}
        >
          <ArrowIcon />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!context.canRedo}
          onClick={context.onRedo}
        >
          <ArrowIcon flip />
        </button>
        <button
          type="button"
          className={s.overviewReset}
          disabled={!context.changed}
          onClick={context.onReset}
        >
          <ResetIcon />
          Reset all
        </button>
      </div>
      {context.switches.map((item) => (
        <div key={item.id} className={s.highlightToggle}>
          <span>{item.label}</span>
          <button
            type="button"
            role="switch"
            aria-label={item.label}
            aria-checked={item.checked}
            className={s.switch}
            onClick={() => item.onChange(!item.checked)}
          >
            <span />
          </button>
        </div>
      ))}
      {context.customWords > 0 && (
        <button type="button" className={s.overviewClear} onClick={context.onClearWords}>
          Reset {context.customWords} edited {context.customWords === 1 ? "word" : "words"}
        </button>
      )}
    </div>
  );
}
