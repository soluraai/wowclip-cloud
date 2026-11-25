"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PLATFORMS, type GuideAspect, type Platform, type PreviewGuides } from "./previewGuides";
import { ResetIcon } from "./SettingsControls";
import s from "./PreviewTools.module.css";

export type GuideControls = {
  guides: PreviewGuides;
  aspect: GuideAspect;
  onGuides: (patch: Partial<PreviewGuides>) => void;
};

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const TOGGLES: { id: "safeZones" | "grid" | "snap"; label: string; title: string; icon: ReactNode }[] = [
  {
    id: "safeZones",
    label: "Safe zones",
    title: "Show the area no app UI covers",
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7.5" y="7.5" width="9" height="9" strokeDasharray="2.5 2.5" /></>,
  },
  {
    id: "grid",
    label: "Grid",
    title: "Rule-of-thirds grid",
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>,
  },
  {
    id: "snap",
    label: "Snap",
    title: "Snap to guides while dragging. Hold Alt or Ctrl to place freely.",
    icon: <><path d="M5 4v8a7 7 0 0 0 14 0V4h-4v8a3 3 0 0 1-6 0V4Z" /><path d="M5 8h4M15 8h4" /></>,
  },
];

/** One-click way back to the template's own position or size, shown only after a change. */
export function PlacementReset({
  positionChanged,
  sizeChanged,
  onResetPosition,
  onResetSize,
}: {
  positionChanged: boolean;
  sizeChanged: boolean;
  onResetPosition: () => void;
  onResetSize: () => void;
}) {
  if (!positionChanged && !sizeChanged) return null;
  return (
    <div className={s.tools}>
      {positionChanged && (
        <button type="button" className={s.reset} onClick={onResetPosition} title="Reset position" aria-label="Reset position">
          <ResetIcon />
          <span className={s.resetLabel}>Reset </span><span className={s.resetWord}>Position</span>
        </button>
      )}
      {sizeChanged && (
        <button type="button" className={s.reset} onClick={onResetSize} title="Reset size" aria-label="Reset size">
          <ResetIcon />
          <span className={s.resetLabel}>Reset </span><span className={s.resetWord}>Size</span>
        </button>
      )}
    </div>
  );
}

/** Small marks so each app reads at a glance in the picker. */
const PLATFORM_ICON: Record<Platform, ReactNode> = {
  none: <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c5 0 9 4.5 10 7a12.8 12.8 0 0 1-3.2 4.3M6.6 6.6C4.3 8 2.6 10.2 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" /></>,
  reels: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M3 8.5h18M8.5 3l3 5.5M14.5 3l3 5.5" /><path d="M10 12.2v4.6l4-2.3-4-2.3Z" /></>,
  tiktok: <><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.4 5 4.6" /></>,
  shorts: <><path d="M15.6 3.5 8.4 7.3a4 4 0 0 0 0 7.1l1 .5-1 .5a4 4 0 0 0 3.7 7.1l7.2-3.8a4 4 0 0 0 0-7.1l-1-.5 1-.5a4 4 0 0 0-3.7-7.1Z" /><path d="M10.5 10v4.5l3.8-2.2-3.8-2.3Z" /></>,
};
const PLATFORM_NOTE: Record<Platform, string> = {
  none: "Plain preview",
  reels: "Buttons, caption and name",
  tiktok: "Side bar and caption",
  shorts: "Side bar and title",
};
const SHORT_LABEL: Record<Platform, string> = { none: "App UI", reels: "Reels", tiktok: "TikTok", shorts: "Shorts" };

/** "App UI": a small window to lay an app's buttons over the video, so captions stay clear of them. */
function PlatformPicker({ value, disabled, onChange }: { value: Platform; disabled: boolean; onChange: (platform: Platform) => void }) {
  const [openState, setOpen] = useState(false);
  // A disabled picker is always closed.
  const open = openState && !disabled;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 236;
      setAt({ top: rect.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const shut = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
        return;
      }
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", shut);
    document.addEventListener("keydown", shut);
    return () => {
      document.removeEventListener("pointerdown", shut);
      document.removeEventListener("keydown", shut);
    };
  }, [open]);
  return (
    <>
      <button ref={button} type="button" className={s.platformButton} aria-haspopup="dialog" aria-expanded={open}
        data-on={value !== "none"} disabled={disabled}
        title={disabled ? "App UI needs a 9:16 video" : "Preview an app's buttons over your video"}
        onClick={() => setOpen(!open)}>
        <Icon>{PLATFORM_ICON[value]}</Icon>
        <span className={s.platformLabel}>{SHORT_LABEL[value]}</span>
        <svg className={s.platformChevron} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && createPortal(
        <div ref={panel} className={s.platformPanel} style={{ top: at.top, left: at.left }} role="dialog" aria-label="App UI preview">
          <p className={s.platformHead}>Show an app over the video</p>
          {PLATFORMS.map((platform) => (
            <button key={platform.id} type="button" className={s.platformOption} data-active={value === platform.id}
              onClick={() => { onChange(platform.id); setOpen(false); }}>
              <Icon>{PLATFORM_ICON[platform.id]}</Icon>
              <span><b>{platform.id === "none" ? "Off" : platform.label}</b><small>{PLATFORM_NOTE[platform.id]}</small></span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function PreviewTools({
  guides,
  aspect,
  onGuides,
  onFullscreen,
}: GuideControls & { onFullscreen?: () => void }) {
  const vertical = aspect === "9:16";
  return (
    <div className={s.tools}>
      <PlatformPicker value={vertical ? guides.platform : "none"} disabled={!vertical} onChange={(platform) => onGuides({ platform })} />
      {TOGGLES.map((toggle) => (
        <button
          type="button"
          key={toggle.id}
          aria-pressed={guides[toggle.id]}
          aria-label={toggle.label}
          title={toggle.title}
          onClick={() => onGuides({ [toggle.id]: !guides[toggle.id] })}
        >
          <Icon>{toggle.icon}</Icon>
        </button>
      ))}
      {onFullscreen && (
        <button type="button" aria-label="Full screen" title="Watch the video full screen (F)" onClick={onFullscreen}>
          <Icon><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>
        </button>
      )}
    </div>
  );
}
