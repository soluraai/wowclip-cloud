"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { SettledMotionContext } from "../../../captions/src/BasicCaption/cueMotion";
import { VideoFrameContext, type VideoFrameValue } from "../../../captions/src/VideoFrame";
import { PreviewRenderer } from "./PreviewRenderer";
import { VideoPreviewSkeleton } from "../app/Skeleton";
import type { Cue } from "../app/CaptionTimeline";
import type { CaptionSettings } from "../app/captionSettings";
import { resolveCaptionStyleId } from "../app/styleCatalog";
import {
  captionFallbacks,
  compositionSize,
  createSourceSelector,
  createBasicStyle,
  pagedCues,
  createPresentation,
  createWordColors,
  PREVIEW_FPS,
  type PreviewAspectRatio,
} from "./adapter";
import s from "./RemotionPreview.module.css";

type Props = {
  playerRef: RefObject<PlayerRef | null>;
  onReady: (player: PlayerRef | null) => void;
  cues: Cue[];
  settings: CaptionSettings;
  src: string;
  duration: number;
  aspectRatio: PreviewAspectRatio;
  /** The frame in the video's own shape; the shape's preset when unknown. */
  frameSize?: { width: number; height: number };
  styleId: string;
  /** Framing, shades and kept scenes. Given through context, so panning the video never redraws the captions. */
  video: VideoFrameValue;
};

function RemotionPreview({
  playerRef,
  onReady,
  cues,
  settings,
  src,
  duration,
  aspectRatio,
  frameSize,
  styleId,
  video,
}: Props) {
  const [retry, setRetry] = useState(0);
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!player) return;
    const update = () => setPlaying(player.isPlaying());
    update();
    player.addEventListener("play", update);
    player.addEventListener("pause", update);
    return () => {
      player.removeEventListener("play", update);
      player.removeEventListener("pause", update);
    };
  }, [player]);
  // Moving through the timeline shows the real motion; it settles once the playhead stops.
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => {
    if (!player) return;
    let timer: ReturnType<typeof setTimeout>;
    const seeked = () => {
      setScrubbing(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrubbing(false), 600);
    };
    player.addEventListener("seeked", seeked);
    return () => {
      clearTimeout(timer);
      player.removeEventListener("seeked", seeked);
    };
  }, [player]);
  const size = frameSize ?? compositionSize(aspectRatio);
  const sourceSelector = useMemo(() => createSourceSelector(), []);
  const variant = resolveCaptionStyleId(styleId);
  // Where the caption sits changes neither its pages nor its look, so dragging it across the video
  // redoes only its placement: `look` keeps one identity for as long as nothing but x, y or the tilt changes.
  const lookKey = JSON.stringify({ ...settings, x: 0, y: 0, rotation: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const look = useMemo(() => settings, [lookKey]);
  const pages = useMemo(() => pagedCues(cues, look, variant), [cues, look, variant]);
  const sourceConfig = sourceSelector(pages, src, duration);
  const wordColors = useMemo(() => createWordColors(cues), [cues]);
  const fallbackFonts = useMemo(() => captionFallbacks(cues), [cues]);
  const presentationConfig = useMemo(
    () => createPresentation(look, wordColors, fallbackFonts, cues, variant),
    [look, wordColors, fallbackFonts, cues, variant],
  );
  const inputProps = useMemo(
    () => ({
      styleId: variant,
      // The video plays under the captions and is never redrawn with them (PreviewRenderer).
      ownVideo: true,
      sourceConfig,
      styleConfig: createBasicStyle(settings, variant),
      presentationConfig,
    }),
    [sourceConfig, presentationConfig, settings, variant],
  );
  const attach = useCallback(
    (player: PlayerRef | null) => {
      playerRef.current = player;
      setPlayer(player);
      onReady(player);
    },
    [playerRef, onReady],
  );
  const loading = useCallback(
    () => (
      <VideoPreviewSkeleton aspectRatio={aspectRatio} label="Rendering preview frames…" />
    ),
    [aspectRatio],
  );
  // A dropped video read (a dev-server reload, a network blip) throws in the player. Remount it quietly at the
  // same frame a few times before asking the user; a real, lasting failure still reaches the Retry button.
  const resumeAt = useRef(0);
  const autoRetries = useRef(0);
  const error = useCallback(
    () => <PlayerError auto={autoRetries.current < 3} onRetry={(auto) => {
      resumeAt.current = playerRef.current?.getCurrentFrame() ?? resumeAt.current;
      autoRetries.current = auto ? autoRetries.current + 1 : 0;
      setRetry((value) => value + 1);
    }} />,
    [playerRef],
  );
  useEffect(() => {
    if (retry && player) player.seekTo(resumeAt.current);
  }, [retry, player]);
  return (
    <SettledMotionContext.Provider value={!playing && !scrubbing}>
    <VideoFrameContext.Provider value={video}>
    <Player
      key={`${src}-${retry}`}
      ref={attach}
      component={PreviewRenderer}
      inputProps={inputProps}
      durationInFrames={Math.max(1, Math.ceil(duration * PREVIEW_FPS))}
      compositionWidth={size.width}
      compositionHeight={size.height}
      fps={PREVIEW_FPS}
      moveToBeginningWhenEnded={false}
      acknowledgeRemotionLicense
      style={{ width: "100%", height: "100%" }}
      controls={false}
      clickToPlay
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      renderLoading={loading}
      errorFallback={error}
      numberOfSharedAudioTags={1}
      showPosterWhenBuffering
    />
    </VideoFrameContext.Provider>
    </SettledMotionContext.Provider>
  );
}

function PlayerError({ auto, onRetry }: { auto: boolean; onRetry: (auto: boolean) => void }) {
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => onRetry(true), 400);
    return () => clearTimeout(timer);
  }, [auto, onRetry]);
  if (auto) return null;
  return (
    <div className={s.message} role="alert">
      <span>The preview could not load.</span>
      <button type="button" onClick={() => onRetry(false)}>
        Retry preview
      </button>
    </div>
  );
}

export default memo(RemotionPreview);
