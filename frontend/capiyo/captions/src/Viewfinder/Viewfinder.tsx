import { NO_SPACING, type PartSpacing } from "../Premium/sizes";
import React, { useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { useChosenEntrance } from "../BasicCaption/cueMotion";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { faceFor, heroOf, inkProps, keepInside, measureInk, setRow, useCaptionFaces, useCaptionStage, type StageProps } from "../Premium/captionStage";
import { signatureEase, signatureWordProgress, type SignatureCue } from "../Premium/Signature/engine";
import type { SignatureFace } from "../Premium/Signature/fonts";
import type { PartSizes } from "../Premium/sizes";
import { MotionWord } from "../Standard/MotionWord";
import { usePickedFaces } from "../Premium/parts";

const PICKS = { hero: "main", mono: "helper" } as const;

const FACES = {
  hero: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 800 },
  mono: { family: "IBM Plex Mono", src: "launch-caption-pack/fonts/standard-type/IBMPlexMono-Regular.ttf", weight: 400 },
};
const HERO_SIZE = 98, HELPER_SIZE = 34, READOUT_SIZE = 19;
const PAD_X = 26, PAD_Y = 22, ARM = 28, STROKE = 4, HELPER_GAP = 16;
const SNAP_MS = 420, FOCUS_MS = 520;
const REC_WIDTH = 66, CLOCK_WIDTH = 128;

type Faces = Record<keyof typeof FACES | "hindi", SignatureFace>;

const layoutFinder = (cue: SignatureCue, ctx: CanvasRenderingContext2D, faces: Faces, limit: number, cap: number, sizes: PartSizes, spacing: PartSpacing = NO_SPACING) => {
  const extra = spacing.main;
  const hero = heroOf(cue), at = cue.words.indexOf(hero);
  const text = hero.text.toUpperCase(), face = faceFor(text, faces.hero, faces.hindi);
  const room = limit - PAD_X * 2;
  const wanted = HERO_SIZE * sizes.main * (sizes.words[hero.id] ?? 1), tracking = -.02 + extra;
  const natural = measureInk(ctx, text, face, wanted, wanted * tracking);
  const fit = Math.min(1, room / Math.max(1, natural.left + natural.right));
  const size = wanted * Math.min(cap, fit), ink = measureInk(ctx, text, face, size, size * tracking);
  const look = (word: { id: string; text: string }) => ({ text: word.text.toUpperCase(), face: faces.mono,
    size: HELPER_SIZE * sizes.helper * (sizes.words[word.id] ?? 1), tracking: .5 + HELPER_SIZE * sizes.helper * (sizes.words[word.id] ?? 1) * spacing.helper });
  const before = setRow(ctx, cue.words.slice(0, at), faces.hindi, limit, look, .38);
  const after = setRow(ctx, cue.words.slice(at + 1), faces.hindi, limit, look, .38);
  const heroWidth = ink.left + ink.right;
  const boxWidth = Math.max(heroWidth + PAD_X * 2, Math.min(limit, 300)), boxHeight = ink.ascent + PAD_Y * 2;
  const above = before.runs.length ? before.ascent + before.descent + HELPER_GAP : READOUT_SIZE + HELPER_GAP;
  const below = after.runs.length ? after.ascent + after.descent + HELPER_GAP : READOUT_SIZE + HELPER_GAP;
  // The sentence can be wider than the brackets, so the rows hang from the whole block, not the box.
  const blockWidth = Math.max(boxWidth, before.width, after.width);
  return { hero, text, face, size, tracking: size * tracking, fit, ink, heroWidth, before, after, boxWidth, boxHeight, blockWidth, above, below, height: above + boxHeight + below };
};

const clock = (now: number, fps: number) => {
  const seconds = Math.floor(now / 1000), frames = Math.floor((now % 1000) * fps / 1000);
  return [Math.floor(seconds / 60), seconds % 60, frames].map(value => String(value).padStart(2, "0")).join(":");
};

/** Lands past the mark and settles back, the way a focus box locks onto a subject. */
const snap = (elapsed: number) => {
  const t = Math.max(0, elapsed / SNAP_MS);
  return t >= 1 ? 1 : 1 + .24 * Math.exp(-4.6 * t) * Math.cos(t * 8.4) * (1 - t);
};

/**
 * A camera finds the headline. Corner brackets lock onto the word while it pulls into focus, the
 * rest of the sentence runs along the frame in a mono face, and a small readout keeps recording.
 */
export const Viewfinder: React.FC<StageProps> = props => {
  const { presentationConfig } = props;
  const { fps } = useVideoConfig();
  const stage = useCaptionStage(props, 6, 32);
  const { now, unit, width, height, canvasWidth, canvasHeight, x, y, cue, cues, maxWidth, sizes, settled, reduced, needsHindi, tracking } = stage;
  // A font picked for the main word or the text around it replaces the design's own.
  const picked = usePickedFaces(FACES, presentationConfig?.parts, PICKS);
  const { faces, ready } = useCaptionFaces(picked, needsHindi);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Caption layout requires canvas text measurement.");
    const limit = Math.max(maxWidth, Math.min(676, maxWidth * sizes.main));
    const cap = evenSizeCap(cues.map(item => layoutFinder(item, ctx, faces, limit, 1, sizes, tracking).fit));
    return cues.map(item => layoutFinder(item, ctx, faces, limit, cap, sizes, tracking));
  }, [ready, cues, faces, maxWidth, sizes, tracking]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (layouts.length) onLayout?.((Math.max(...layouts.map(item => item.height)) + 38) * unit); }, [layouts, onLayout, unit]);
  const chosen = useChosenEntrance();
  const layout = cue && layouts[cue.index];
  if (!cue || !layout) return null;
  const { hero, ink, size, boxWidth, boxHeight, blockWidth, above, below, before, after, heroWidth } = layout;
  const parts = presentationConfig?.parts, wordColors = presentationConfig?.wordColors;
  const accent = presentationConfig?.highlights?.color ?? "#ffd60a";
  const main = wordColors?.[hero.id] ?? parts?.main?.color ?? "#ffffff", helper = parts?.helper?.color ?? "#ffffff";
  const still = settled || reduced;
  const held = still || chosen(hero.id, true);
  const heroAt = now - hero.startMs, shown = settled || heroAt >= 0;
  const focus = held ? 1 : signatureEase(heroAt / FOCUS_MS);
  const lock = still ? 1 : Math.min(shown ? snap(heroAt) : 1.22, Math.max(1, (canvasWidth - 8) / boxWidth));
  const left = -boxWidth / 2, right = boxWidth / 2, top = -boxHeight / 2, bottom = boxHeight / 2;
  const blockLeft = -blockWidth / 2, blockRight = blockWidth / 2;
  const centerX = keepInside(x, blockWidth, canvasWidth), centerY = keepInside(y, layout.height, canvasHeight);
  const reveal = still ? 1 : signatureEase((now - cue.startMs) / 280);
  const corners = [[left, top, 1, 1], [right, top, -1, 1], [right, bottom, -1, -1], [left, bottom, 1, -1]];
  const readout = presentationConfig?.features?.hud !== false;
  const row = (runs: typeof before.runs, start: number, baseline: number) => runs.map(run => {
    if (!settled && now < run.word.startMs) return null;
    const p = settled || chosen(run.word.id) ? 1 : signatureWordProgress(now, run.word, reduced);
    return <MotionWord key={run.word.id} id={run.word.id} startMs={run.word.startMs} size={run.size}>
      <text x={start + run.x + (1 - p) * -14} y={baseline} opacity={p} fill={wordColors?.[run.word.id] ?? helper}
        {...inkProps(run.face, run.size, run.tracking)}
        style={{ ...inkProps(run.face, run.size).style, filter: p < 1 ? `blur(${(1 - p) * 5}px)` : undefined }}>{run.text}</text>
    </MotionWord>;
  });
  const beforeLine = top - HELPER_GAP - before.descent, afterLine = bottom + HELPER_GAP + after.ascent;
  const tiny = { ...inkProps({ ...faces.mono }, READOUT_SIZE, 1), fill: "#ffffff", opacity: .82 * reveal };
  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", background: presentationConfig?.backgroundColor ?? "transparent" }}>
    <svg width={width} height={height} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} data-viewfinder={cue.id}
      aria-label={cue.words.map(word => word.text).join(" ")} style={{ position: "absolute", inset: 0, display: "block" }}>
      <g transform={`translate(${centerX} ${centerY + (above - below) / 2})`}>
        <g aria-hidden="true" data-viewfinder-frame="" transform={`scale(${lock})`} opacity={reveal}>
          {corners.map(([cornerX, cornerY, h, v], index) => <path key={index} fill="none" stroke={accent} strokeWidth={STROKE} strokeLinecap="square"
            d={`M ${cornerX + h * ARM} ${cornerY} H ${cornerX} V ${cornerY + v * ARM}`} />)}
        </g>
        <MotionWord id={hero.id} startMs={hero.startMs} size={size} main>
          {shown ? <text x={ink.left - heroWidth / 2} y={ink.ascent / 2} fill={main} opacity={focus} {...inkProps(layout.face, size, layout.tracking)}
            transform={focus < 1 ? `translate(0 ${(1 - focus) * 12}) scale(${1 + (1 - focus) * .05})` : undefined}
            style={{ ...inkProps(layout.face, size).style, filter: focus < 1 ? `blur(${(1 - focus) * 13}px)` : undefined }}>{layout.text}</text> : null}
        </MotionWord>
        {row(before.runs, blockLeft, beforeLine)}
        {row(after.runs, blockRight - after.width, afterLine)}
        {readout && before.width + REC_WIDTH + 18 <= blockWidth && <g aria-hidden="true" data-viewfinder-readout="">
          <rect x={blockRight - REC_WIDTH + 2} y={top - HELPER_GAP - READOUT_SIZE * .62} width={11} height={11} fill="#ff3b30" opacity={(.55 + .45 * Math.cos(now / 320)) * reveal} />
          <text x={blockRight} y={top - HELPER_GAP} textAnchor="end" {...tiny}>REC</text>
        </g>}
        {readout && after.width + CLOCK_WIDTH + 18 <= blockWidth && <text aria-hidden="true" x={blockLeft} y={bottom + HELPER_GAP + READOUT_SIZE * .76} {...tiny}>{clock(now, fps)}</text>}
      </g>
    </svg>
  </AbsoluteFill>;
};
