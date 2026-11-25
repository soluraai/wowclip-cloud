"use client";

import { memo, useCallback, useSyncExternalStore } from "react";
import type { PlayerRef } from "@remotion/player";
import CaptionTimeline, {
  type Cue,
  type TimelineWordControls,
} from "../app/CaptionTimeline";
import { PREVIEW_FPS } from "./adapter";

// Frame updates stay in this small sibling. The app, panels and Player do not
// re-render sixty times a second just to move the timeline playhead.
function PlayerTimeline({
  player,
  cues,
  onChange,
  duration,
  ...wordControls
}: TimelineWordControls & {
  player: PlayerRef | null;
  cues: Cue[];
  onChange: (cues: Cue[]) => void;
  duration: number;
}) {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!player) return () => {};
      player.addEventListener("frameupdate", notify);
      player.addEventListener("play", notify);
      player.addEventListener("pause", notify);
      player.addEventListener("ended", notify);
      return () => {
        player.removeEventListener("frameupdate", notify);
        player.removeEventListener("play", notify);
        player.removeEventListener("pause", notify);
        player.removeEventListener("ended", notify);
      };
    },
    [player],
  );
  // A primitive snapshot also initializes correctly when a hidden timeline is
  // reopened mid-playback, or when the uploaded video's Player is replaced.
  const getSnapshot = useCallback(
    () => (player?.getCurrentFrame() ?? 0) * 2 + (player?.isPlaying() ? 1 : 0),
    [player],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const time = Math.floor(snapshot / 2) / PREVIEW_FPS;
  const playing = snapshot % 2 === 1;
  const seek = useCallback(
    (seconds: number) => {
      const frame = Math.max(
        0,
        Math.min(
          Math.ceil(duration * PREVIEW_FPS) - 1,
          Math.ceil(seconds * PREVIEW_FPS - 1e-7),
        ),
      );
      player?.seekTo(frame);
    },
    [player, duration],
  );
  const play = useCallback(() => {
    if (!player) return;
    if (player.getCurrentFrame() >= Math.ceil(duration * PREVIEW_FPS) - 1)
      player.seekTo(0);
    player.play();
  }, [player, duration]);
  const pause = useCallback(() => player?.pause(), [player]);
  return (
    <CaptionTimeline
      {...wordControls}
      cues={cues}
      onChange={onChange}
      time={time}
      duration={duration}
      playing={playing}
      onSeek={seek}
      onPlay={play}
      onPause={pause}
    />
  );
}

export default memo(PlayerTimeline);
