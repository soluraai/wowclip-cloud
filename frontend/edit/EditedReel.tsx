import React, { useMemo } from "react";
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, getRemotionEnvironment, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionStyleRenderer } from "../capiyo/captions/src/CaptionStyleRenderer";
import { TemplateStage } from "./templates/TemplateStage";
import { CARD_BAND, CardBand, Flash, FULL_STAGE, FullMedia, MediaFill, SceneStage, TOP_STAGE, transitionStyle } from "./layers";
import { buildEditTimeline } from "./timeline";
import type { EditTimeline, TimedInsert } from "./timeline";
import type { EditPlan } from "./types";

// The AI edit, drawn as one full 1080x1920 frame: the speaker (cut, reframed, punched in on the words that matter),
// B-roll cutaways, split screens, motion-graphic scenes, photo pop-ups, and the chosen caption style on top.
// The editor's player and the Lambda render both draw this same component.

export type EditedReelProps = {
  plan: EditPlan;
  /** The 9:16 speaker clip, uncut: the cuts are made here, frame-exact. */
  video: string;
  /** The caption template's props, exactly as the caption editor built them (CaptionStyleRenderer). */
  captions?: Record<string, unknown> | null;
};

const WIDTH = 1080;
const HEIGHT = 1920;
const HALF = 960;
const CARD_DROP = 160;
const CAPTION_FLOOR = 1640;
const DEFAULT_FACE = { x: 0.5, y: 0.36 };
// Jump cuts alternate between two framings, the way an editor hides them; never twice inside 1.1 s.
const FRAMING = [1, 1.075];
const FRAMING_GAP_SECONDS = 1.1;
const LAYER_CSS = ".wowclip-caption-layer > div { background-color: transparent !important; }";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const framingChanges = (timeline: EditTimeline) => {
  const changes: number[] = [];
  let last = -Infinity;
  for (const cut of timeline.cuts) {
    if (cut - last < FRAMING_GAP_SECONDS * timeline.fps) continue;
    changes.push(cut);
    last = cut;
  }
  return changes;
};

const zoomAmount = (zoom: EditTimeline["zooms"][number], frame: number, cuts: number[]) => {
  if (frame < zoom.from) return 0;
  // A cut always resets the camera: the punch ends on the cut instead of easing out across it.
  const nextCut = cuts.find((cut) => cut > zoom.from) ?? Infinity;
  if (frame >= nextCut) return 0;
  const punch = zoom.style === "punch";
  const peak = punch ? 0.09 : 0.06;
  const rise = interpolate(frame, [zoom.from, zoom.from + (punch ? 10 : Math.max(18, zoom.to - zoom.from))], [0, 1], {
    ...clamp,
    easing: punch ? Easing.out(Easing.quad) : Easing.inOut(Easing.sin),
  });
  const fall = interpolate(frame, [zoom.to, zoom.to + 22], [1, 0], { ...clamp, easing: Easing.inOut(Easing.sin) });
  return peak * rise * fall;
};

// While a split screen or a photo card is up, the speaker slides down and the band above holds the picture.
const BAND: Record<string, number> = { split: HALF, card: CARD_BAND };

const bandAt = (timeline: EditTimeline, frame: number) => {
  for (const insert of timeline.inserts) {
    const height = BAND[insert.type];
    if (!height || frame < insert.from || frame >= insert.from + insert.frames) continue;
    const enter = interpolate(frame - insert.from, [0, 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const exit = interpolate(insert.from + insert.frames - frame, [0, 8], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    return { type: insert.type, height, amount: Math.min(enter, exit) };
  }
  return { type: null, height: 0, amount: 0 };
};

const ARoll: React.FC<{ timeline: EditTimeline; video: string; face: { x: number; y: number }; rendering: boolean }> = ({
  timeline,
  video,
  face,
  rendering,
}) => {
  const frame = useCurrentFrame();
  const changes = useMemo(() => framingChanges(timeline), [timeline]);
  const framing = FRAMING[changes.filter((change) => change <= frame).length % 2];
  const zoom = Math.max(0, ...timeline.zooms.map((item) => zoomAmount(item, frame, timeline.cuts)));
  const band = bandAt(timeline, frame);
  const top = band.height * band.amount;
  const position = `${Math.round(face.x * 100)}% ${Math.round(face.y * 100)}%`;
  return (
    <div style={{ position: "absolute", left: 0, top, width: WIDTH, height: HEIGHT - top, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${(framing * (1 + zoom)).toFixed(4)})`, transformOrigin: position }}>
        {timeline.segments.map((segment) => (
          <Sequence key={segment.from} from={segment.from} durationInFrames={segment.frames} premountFor={rendering ? 0 : 20}>
            <OffthreadVideo
              src={video}
              trimBefore={segment.sourceFrom}
              muted={rendering}
              pauseWhenBuffering={!rendering}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position }}
            />
          </Sequence>
        ))}
      </AbsoluteFill>
    </div>
  );
};

const CardPanel: React.FC<{ insert: TimedInsert; rendering: boolean }> = ({ insert, rendering }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const exit = interpolate(insert.frames - frame, [0, 8], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return <CardBand media={insert.media!} frames={insert.frames} amount={Math.min(enter, exit)} rendering={rendering} />;
};

const SplitPanel: React.FC<{ insert: TimedInsert; accent: string; rendering: boolean }> = ({ insert, accent, rendering }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const exit = interpolate(insert.frames - frame, [0, 8], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const shown = Math.min(enter, exit);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: WIDTH, height: HALF, overflow: "hidden", transform: `translateY(${(-(1 - shown) * HALF).toFixed(1)}px)` }}>
      {insert.scene ? (
        <SceneStage scene={insert.scene} frames={insert.frames} stage={TOP_STAGE} accent={accent} />
      ) : insert.media ? (
        <MediaFill media={insert.media} frames={insert.frames} motion={insert.motion} rendering={rendering} />
      ) : null}
    </div>
  );
};

const FullInsert: React.FC<{ insert: TimedInsert; accent: string; rendering: boolean }> = ({ insert, accent, rendering }) => {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ ...transitionStyle(insert.enter, insert.exit, frame, insert.frames), backgroundColor: "#000" }}>
        {insert.type === "template" && insert.template ? (
          <TemplateStage template={insert.template} media={insert.media} frames={insert.frames} accent={accent} />
        ) : insert.type === "graphic" && insert.scene ? (
          <SceneStage scene={insert.scene} frames={insert.frames} stage={FULL_STAGE} accent={accent} />
        ) : insert.media ? (
          <FullMedia media={insert.media} frames={insert.frames} motion={insert.motion} rendering={rendering} />
        ) : null}
      </AbsoluteFill>
      {insert.enter === "flash" ? <Flash /> : null}
    </>
  );
};

const isTextVisual = (insert: TimedInsert) =>
  insert.type === "graphic" || insert.type === "template" || (insert.type === "split" && Boolean(insert.scene));

type Word = { startMs: number; endMs: number } & Record<string, unknown>;

/** The caption words move with the cuts: a word that was cut out is dropped, the rest land on the cut timeline. */
const captionsOnCutTimeline = (props: Record<string, unknown>, timeline: EditTimeline) => {
  const { ownVideo: _ownVideo, video: _video, ...rest } = props;
  const source = (props.sourceConfig ?? {}) as { transcript?: Word[] } & Record<string, unknown>;
  const words = Array.isArray(source.transcript) ? source.transcript : [];
  const kept: Word[] = [];
  for (const word of words) {
    const middle = (word.startMs + word.endMs) / 2;
    const at = timeline.mapMs(middle);
    if (at === null) continue;
    const start = timeline.mapMs(word.startMs) ?? at - Math.min(120, middle - word.startMs);
    const end = timeline.mapMs(Math.max(word.startMs, word.endMs - 1)) ?? at + Math.min(220, word.endMs - middle);
    kept.push({ ...word, startMs: Math.round(Math.max(0, start)), endMs: Math.round(Math.max(start + 40, end)) });
  }
  for (let index = 0; index < kept.length - 1; index++) {
    if (kept[index].endMs > kept[index + 1].startMs) kept[index].endMs = Math.max(kept[index].startMs + 20, kept[index + 1].startMs);
  }
  return {
    ...rest,
    sourceConfig: { ...source, background: undefined, transcript: kept, durationMs: Math.round((timeline.frames / timeline.fps) * 1000) },
  } as Record<string, unknown>;
};

const Captions: React.FC<{ props: Record<string, unknown>; timeline: EditTimeline }> = ({ props, timeline }) => {
  const frame = useCurrentFrame();
  const captionProps = useMemo(() => captionsOnCutTimeline(props, timeline), [props, timeline]);
  // In a split screen the caption block rides up to the seam between the two halves, clear of the speaker's face.
  // Under a photo card the speaker slides down a third, so the captions drop a little to stay under the chin.
  const layout = ((props.styleConfig as { layout?: { positionY?: number } } | undefined)?.layout ?? {}) as { positionY?: number };
  const anchor = typeof layout.positionY === "number" ? layout.positionY : 0.7;
  const band = bandAt(timeline, frame);
  const room = Math.min(CARD_DROP, Math.max(0, CAPTION_FLOOR - anchor * HEIGHT));
  const shift = band.amount * (band.type === "split" ? HALF + 20 - anchor * HEIGHT : band.type === "card" ? room : 0);
  // Text on screen already explains the line, so the captions step aside while a graphic or template is up.
  const hidden = Math.max(0, ...timeline.inserts.filter(isTextVisual).map((insert) => {
    const enter = interpolate(frame - insert.from, [-3, 3], [0, 1], clamp);
    const exit = interpolate(insert.from + insert.frames - frame, [0, 6], [0, 1], clamp);
    return Math.min(enter, exit);
  }));
  return (
    <AbsoluteFill style={{ transform: `translateY(${shift.toFixed(1)}px)`, opacity: 1 - hidden }}>
      <style>{LAYER_CSS}</style>
      <AbsoluteFill className="wowclip-caption-layer">
        <CaptionStyleRenderer {...(captionProps as object)} styleId={captionProps.styleId as string} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const EditedReel: React.FC<EditedReelProps> = ({ plan, video, captions }) => {
  const { fps } = useVideoConfig();
  const rendering = getRemotionEnvironment().isRendering;
  const timeline = useMemo(() => buildEditTimeline(plan, fps), [plan, fps]);
  const face = plan.face ?? DEFAULT_FACE;
  const premount = rendering ? 0 : 18;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ARoll timeline={timeline} video={video} face={face} rendering={rendering} />
      {timeline.inserts
        .filter((insert) => insert.type === "split")
        .map((insert) => (
          <Sequence key={insert.id} from={insert.from} durationInFrames={insert.frames} premountFor={premount}>
            <SplitPanel insert={insert} accent={plan.accent} rendering={rendering} />
          </Sequence>
        ))}
      {timeline.inserts
        .filter((insert) => insert.type === "broll" || insert.type === "graphic" || insert.type === "template")
        .map((insert) => (
          <Sequence key={insert.id} from={insert.from} durationInFrames={insert.frames} premountFor={premount}>
            <FullInsert insert={insert} accent={plan.accent} rendering={rendering} />
          </Sequence>
        ))}
      {timeline.inserts
        .filter((insert) => insert.type === "card" && insert.media)
        .map((insert) => (
          <Sequence key={insert.id} from={insert.from} durationInFrames={insert.frames} premountFor={premount}>
            <CardPanel insert={insert} rendering={rendering} />
          </Sequence>
        ))}
      {captions ? <Captions props={captions} timeline={timeline} /> : null}
    </AbsoluteFill>
  );
};
