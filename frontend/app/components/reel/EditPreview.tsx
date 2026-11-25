"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useMemo } from "react";

import { EditedReel } from "../../../edit/EditedReel";
import { editDuration, EDIT_FPS, REEL_HEIGHT, REEL_WIDTH } from "../../../edit/timeline";
import type { EditPlan } from "../../../edit/types";

type Props = {
  plan: EditPlan;
  video: string;
  captions: Record<string, unknown> | null;
  onPlayer: (player: PlayerRef | null) => void;
};

// The edited reel, played in the browser with the same component the Lambdas render (edit/EditedReel.tsx).
export function EditPreview({ plan, video, captions, onPlayer }: Props) {
  const frames = useMemo(() => editDuration(plan), [plan]);
  const inputProps = useMemo(() => ({ plan, video, captions }), [plan, video, captions]);
  return (
    <Player
      ref={onPlayer}
      component={EditedReel}
      inputProps={inputProps}
      durationInFrames={frames}
      compositionWidth={REEL_WIDTH}
      compositionHeight={REEL_HEIGHT}
      fps={EDIT_FPS}
      acknowledgeRemotionLicense
      controls
      loop
      clickToPlay
      doubleClickToFullscreen
      allowFullscreen
      spaceKeyToPlayOrPause
      showPosterWhenBuffering
      style={{ width: "100%", height: "100%" }}
      renderLoading={() => <div className="ai-preview-wait"><span className="spinner" /></div>}
    />
  );
}
