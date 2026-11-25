import React from "react";
import { Composition } from "remotion";
import { EditedReel } from "../EditedReel";
import { EDIT_FPS, REEL_HEIGHT, REEL_WIDTH, editDuration } from "../timeline";
import type { EditPlan } from "../types";

// The render site for AI-edited reels (deployed as sites/wowclip-edit). Capiyo's render Lambda asks every site for a
// composition named "AppBand" and lays it at `top` over the job's video; an AI edit is a whole opaque frame, laid at
// top 0 over a black carrier clip that only brings the cut audio (backend/optional_extras/ai_edit/make_audio_carrier_video.py).

type Props = { props?: Record<string, unknown> | null; edit: EditPlan; video: string; frames?: number };

const EMPTY: EditPlan = { version: 1, sourceDuration: 3, keep: [], trims: false, accent: "#F5B301", zooms: [], inserts: [] };

const AppBand: React.FC<Props> = ({ props, edit, video }) => <EditedReel plan={edit} video={video} captions={props ?? null} />;

export const Root: React.FC = () => (
  <Composition
    id="AppBand"
    component={AppBand}
    width={REEL_WIDTH}
    height={REEL_HEIGHT}
    fps={EDIT_FPS}
    durationInFrames={90}
    defaultProps={{ props: null, edit: EMPTY, video: "" } as Props}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, (props as Props).frames ?? editDuration((props as Props).edit ?? EMPTY)),
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
      fps: EDIT_FPS,
    })}
  />
);
