import LogoLoader from "./LogoLoader";
import s from "./Skeleton.module.css";

/** Loading spots keep their place in the layout and show the Capiyo mark in the middle, not grey boxes. */
const box = { position: "relative" } as const;

export function VideoPreviewSkeleton({
  aspectRatio = "9:16",
  label = "Loading preview…",
}: {
  aspectRatio?: "9:16" | "4:5" | "16:9" | "1:1";
  label?: string;
}) {
  return (
    <div className={s.videoPreviewSkeleton} data-aspect={aspectRatio}>
      <LogoLoader fill size={52} label={label} />
    </div>
  );
}

export function StyleCardSkeleton() {
  return (
    <div className={s.styleCardSkeleton}>
      <LogoLoader fill size={30} />
    </div>
  );
}

export function PreviewSkeleton({
  label = "Loading preview",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={`${s.preview} ${compact ? s.compact : ""}`}>
      <LogoLoader fill size={compact ? 28 : 40} label={compact ? undefined : label} />
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className={s.panel} style={box}>
      <LogoLoader fill size={34} label="Loading controls" />
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className={s.timeline} style={box}>
      <LogoLoader fill size={30} />
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className={s.workspace} style={box}>
      <LogoLoader fill size={64} label="Loading Capiyo" />
    </div>
  );
}
