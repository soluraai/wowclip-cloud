import { NO_SPACING, type PartSpacing } from "../Premium/sizes";
import React, { useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { useChosenEntrance } from "../BasicCaption/cueMotion";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { faceFor, heroOf, inkProps, keepInside, measureInk, setRow, useCaptionFaces, useCaptionStage, type StageProps } from "../Premium/captionStage";
import { signatureEase, signatureWordProgress, type SignatureCue } from "../Premium/Signature/engine";
import type { PartSizes } from "../Premium/sizes";
import type { SignatureFace } from "../Premium/Signature/fonts";
import { MotionWord } from "../Standard/MotionWord";
import { usePickedFaces } from "../Premium/parts";

const PICKS = { hero: "main", helper: "helper" } as const;

const FACES = {
  hero: { family: "Bebas Neue", src: "launch-caption-pack/fonts/standard-type/BebasNeue-Regular.ttf", weight: 400 },
  helper: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 600 },
};
const HERO_SIZE = 186, HELPER_SIZE = 40;
const ENTRANCE_MS = 460, SPLIT_MS = 380, FLASH_MS = 520;
/** Space the two halves open up, around the words that sit between them. */
const OPENING = 1.6;
const SEPARATION = 18;

type Faces = Record<keyof typeof FACES | "hindi", SignatureFace>;

const layoutSplit = (cue: SignatureCue, ctx: CanvasRenderingContext2D, faces: Faces, limit: number, cap: number, sizes: PartSizes, spacing: PartSpacing = NO_SPACING) => {
  const extra = spacing.main;
  const hero = heroOf(cue), at = cue.words.indexOf(hero);
  const text = hero.text.toUpperCase(), face = faceFor(text, faces.hero, faces.hindi);
  const wanted = HERO_SIZE * sizes.main * (sizes.words[hero.id] ?? 1);
  const natural = measureInk(ctx, text, face, wanted, wanted * extra);
  const fit = Math.min(1, limit / Math.max(1, natural.left + natural.right));
  const size = wanted * Math.min(cap, fit), ink = measureInk(ctx, text, face, size, size * extra);
  const look = (word: { id: string; text: string }) => {
    const size = HELPER_SIZE * sizes.helper * (sizes.words[word.id] ?? 1);
    return { text: word.text, face: faces.helper, size, tracking: size * spacing.helper };
  };
  const before = setRow(ctx, cue.words.slice(0, at), faces.hindi, limit, look);
  const after = setRow(ctx, cue.words.slice(at + 1), faces.hindi, limit, look);
  const opening = after.runs.length ? HELPER_SIZE * sizes.helper * OPENING : 0;
  const lead = before.runs.length ? before.ascent + before.descent + SEPARATION : 0;
  return { hero, text, face, size, tracking: size * extra, fit, ink, before, after, opening, lead,
    width: Math.max(ink.left + ink.right, before.width, after.width), height: lead + ink.ascent + opening };
};

/**
 * The headline is cut along its middle. Its halves arrive from opposite sides and meet in a flash
 * along the cut; when the next word is spoken they part, and the rest of the sentence appears inside.
 */
export const SplitLine: React.FC<StageProps> = props => {
  const { presentationConfig } = props;
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
    const cap = evenSizeCap(cues.map(item => layoutSplit(item, ctx, faces, limit, 1, sizes, tracking).fit));
    return cues.map(item => layoutSplit(item, ctx, faces, limit, cap, sizes, tracking));
  }, [ready, cues, faces, maxWidth, sizes, tracking]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (layouts.length) onLayout?.((Math.max(...layouts.map(item => item.height)) + 38) * unit); }, [layouts, onLayout, unit]);
  const chosen = useChosenEntrance();
  const uid = `split-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const layout = cue && layouts[cue.index];
  if (!cue || !layout) return null;
  const { hero, ink, size, opening, lead, before, after } = layout;
  const parts = presentationConfig?.parts, wordColors = presentationConfig?.wordColors;
  const upper = wordColors?.[hero.id] ?? parts?.main?.color ?? "#ffffff";
  const lower = presentationConfig?.highlights?.color ?? "#ff4d2e";
  const helper = parts?.helper?.color ?? "#ffffff";
  const still = settled || reduced;
  const held = still || chosen(hero.id, true);
  const heroAt = now - hero.startMs;
  const heroIn = held ? 1 : signatureEase(heroAt / ENTRANCE_MS);
  const firstAfter = after.runs[0]?.word;
  const open = firstAfter ? (settled ? 1 : reduced ? Number(now >= firstAfter.startMs) : signatureEase((now - firstAfter.startMs) / SPLIT_MS)) : 0;
  const part = open * opening / 2;
  const heroWidth = ink.left + ink.right, heroX = ink.left - heroWidth / 2;
  const baseline = ink.ascent / 2;
  // The halves arrive from the sides, so a wide headline travels only as far as the frame allows.
  const centerX = keepInside(x, layout.width, canvasWidth), centerY = keepInside(y, layout.height, canvasHeight);
  const edge = Math.max(0, Math.min(centerX, canvasWidth - centerX) - heroWidth / 2 - 8);
  const drift = (1 - heroIn) * Math.min(heroWidth * .22, 90, edge);
  const flash = held || heroAt < 0 ? 0 : 1 - signatureEase((heroAt - ENTRANCE_MS * .6) / FLASH_MS);
  const halves = [
    { id: `${uid}-upper`, y: -size, height: size, shift: -part, slide: -drift, fill: upper },
    { id: `${uid}-lower`, y: 0, height: size, shift: part, slide: drift, fill: lower },
  ];
  const row = (runs: typeof before.runs, left: number, top: number, drop: number) => runs.map(run => {
    if (!settled && now < run.word.startMs) return null;
    const p = settled || chosen(run.word.id) ? 1 : signatureWordProgress(now, run.word, reduced);
    return <MotionWord key={run.word.id} id={run.word.id} startMs={run.word.startMs} size={run.size}>
      <text x={left + run.x} y={top + (1 - p) * drop} opacity={p} fill={wordColors?.[run.word.id] ?? helper}
        {...inkProps(run.face, run.size, run.tracking)}
        style={{ ...inkProps(run.face, run.size).style, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined }}>{run.text}</text>
    </MotionWord>;
  });
  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", background: presentationConfig?.backgroundColor ?? "transparent" }}>
    <svg width={width} height={height} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} data-split-line={cue.id}
      aria-label={cue.words.map(word => word.text).join(" ")} style={{ position: "absolute", inset: 0, display: "block" }}>
      <defs>
        {halves.map(half => <clipPath id={half.id} key={half.id}><rect x={-canvasWidth} y={half.y} width={canvasWidth * 2} height={half.height} /></clipPath>)}
      </defs>
      <g transform={`translate(${centerX} ${centerY + lead / 2})`}>
        <g transform={`translate(0 ${-part})`}>{row(before.runs, -before.width / 2, -ink.ascent / 2 - SEPARATION - before.descent, 14)}</g>
        <MotionWord id={hero.id} startMs={hero.startMs} size={size} main>
          {now >= hero.startMs || settled ? <g opacity={heroIn} style={{ filter: heroIn < 1 ? `blur(${(1 - heroIn) * 9}px)` : undefined }}>
            {halves.map(half => <g key={half.id} transform={`translate(${half.slide} ${half.shift})`}>
              <g clipPath={`url(#${half.id})`}>
                <text x={heroX} y={baseline} fill={half.fill} {...inkProps(layout.face, size, layout.tracking)}>{layout.text}</text>
              </g>
            </g>)}
            {flash > 0 && <rect data-split-flash="" x={-heroWidth / 2 - 14} y={-1.25 - part} width={heroWidth + 28} height={2.5} fill="#ffffff" opacity={flash * (1 - open)} />}
          </g> : null}
        </MotionWord>
        {row(after.runs, -after.width / 2, after.ascent * .36, 12)}
      </g>
    </svg>
  </AbsoluteFill>;
};
