"use client";
import { memo, useCallback, useMemo, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import type { PlayerRef } from "@remotion/player";
import type { VideoFrameValue } from "../../../captions/src/VideoFrame";
import type { PreviewAspectRatio } from "../remotion/adapter";
import CaptionCanvas from "./CaptionCanvas";
import PreviewOverlays from "./PreviewOverlays";
import { VideoPreviewSkeleton } from "./Skeleton";
import type { Cue } from "./CaptionTimeline";
import type { CaptionSettings } from "./captionSettings";
import type { PreviewGuides } from "./previewGuides";
import type { StyleCapabilities } from "./styleCapabilities";

// The player's code starts downloading as soon as the editor's does.
if (typeof window !== "undefined") {
  import("../remotion/RemotionPreview");
}
const RemotionPreview = dynamic(() => import("../remotion/RemotionPreview"), {
  ssr: false,
  loading: () => <VideoPreviewSkeleton label="Preparing preview player…" />,
});

/**
 * Everything inside the video frame: the player, the guides over it and the caption's handles.
 *
 * A drag on the caption lives here until it is let go. Only the preview redraws while the pointer moves
 * (not the editor's panels, timeline or style list), and the editor gets the final value once.
 */
function PreviewStage({
  playerRef,
  onReady,
  player,
  cues,
  settings,
  src,
  duration,
  aspectRatio,
  frameSize,
  styleId,
  video,
  cap,
  guides,
  bestY,
  onChange,
}: {
  playerRef: RefObject<PlayerRef | null>;
  onReady: (player: PlayerRef | null) => void;
  player: PlayerRef | null;
  cues: Cue[];
  settings: CaptionSettings;
  src: string;
  duration: number;
  aspectRatio: PreviewAspectRatio;
  frameSize: { width: number; height: number };
  styleId: string;
  video: VideoFrameValue;
  cap: StyleCapabilities;
  guides: PreviewGuides;
  bestY?: number;
  onChange: (patch: Partial<CaptionSettings>) => void;
}) {
  const [live, setLive] = useState<Partial<CaptionSettings> | null>(null);
  const shown = useMemo(() => (live ? { ...settings, ...live } : settings), [settings, live]);
  // Both land in one render: the caption never flashes back to where it started.
  const commit = useCallback(
    (patch: Partial<CaptionSettings>) => {
      setLive(null);
      onChange(patch);
    },
    [onChange],
  );
  return (
    <>
      <RemotionPreview
        playerRef={playerRef}
        onReady={onReady}
        cues={cues}
        settings={shown}
        src={src}
        duration={duration}
        aspectRatio={aspectRatio}
        frameSize={frameSize}
        styleId={styleId}
        video={video}
      />
      <PreviewOverlays guides={guides} aspect={aspectRatio} />
      <CaptionCanvas
        settings={shown}
        cap={cap}
        player={player}
        compositionWidth={frameSize.width}
        aspect={aspectRatio}
        guides={guides}
        bestY={bestY}
        onLive={setLive}
        onCommit={commit}
      />
    </>
  );
}

export default memo(PreviewStage);
