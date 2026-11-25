import { useSpacing } from "../sizes";
import React, { useContext, useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { CueMotionContext, useCueMotion } from "../../BasicCaption/cueMotion";
import type { BasicCaptionRendererProps } from "../../BasicCaption/BasicCaptionRenderer";
import { evenSizeCap } from "../../CaptionEngine/evenSize";
import { isRecord } from "../../CaptionEngine/types";
import { activeCue } from "../../LaunchCaptionPack/timeline";
import { MotionWord } from "../../Standard/MotionWord";
import { chosenEntrance, darken, gradientLine, lighten, usePartSizes, type PartLook } from "../parts";
import type { PartSizes } from "../sizes";
import { compileSignature, signatureEase, signatureWordProgress, type SignatureVariant } from "./engine";
import { signatureAsset, useSignatureFaces } from "./fonts";
import { layoutSignatureCue, type SignatureRun } from "./layout";
import { cursorDragPose, dragCorner } from "./drag";
import { SourceVideo } from "../../SourceVideo";

export type SignatureCaptionProps = BasicCaptionRendererProps & { variant: SignatureVariant };

const pickedFace = (part?: PartLook) => part?.family && part.src
  ? { family: part.family, src: part.src, weight: part.weight ?? 400, italic: part.italic === true } : undefined;
/** The word's fill: what the user chose, or the design's own stops. */
const FillStops: React.FC<{ part?: PartLook; shades: (color: string) => string[]; fallback: string[]; id: string; line: ReturnType<typeof gradientLine> }> =
  ({ part, shades, fallback, id, line }) => {
    const stops = part?.gradient?.stops ?? (part?.color ? shades(part.color) : fallback).map((color, index, all) =>
      ({ color, position: index / (all.length - 1) * 100 }));
    return <linearGradient id={id} {...(part?.gradient ? gradientLine(part.gradient.angle) : line)}>
      {stops.map((stop, index) => <stop key={index} offset={stop.position / 100} stopColor={stop.color} />)}
    </linearGradient>;
  };
export const SignatureCaption: React.FC<SignatureCaptionProps> = ({ variant, sourceConfig, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps, unit = width / 720, canvasHeight = height / unit;
  const preview = !!presentationConfig?.onLayout;
  const reduced = presentationConfig?.reducedMotion === true;
  const input = isRecord(styleConfig) ? styleConfig : {};
  const font = isRecord(input.font) ? input.font : {};
  const position = isRecord(input.layout) ? input.layout : {};
  const value = (n: unknown, fallback: number, lo: number, hi: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  const fontSize = preview ? 112 : value(font.size, 88, 56, 180) * 1.4;
  const sizes = usePartSizes(presentationConfig);
  const maxWidth = 720 * (preview ? .76 : value(position.maxWidth, .84, .45, .9));
  const positionX = preview ? .5 : value(position.positionX, .5, .15, .85);
  const positionY = preview ? .5 : value(position.positionY, .72, .15, .85);
  const override = useMemo(() => !preview && typeof font.src === "string" && typeof font.family === "string" ? {
    src: font.src, family: font.family, weight: value(font.weight, variant === "ember-lock" ? 900 : 800, 100, 900),
    italic: font.italic === true,
  } : undefined, [preview, font.src, font.family, font.weight, font.italic, variant]);
  const cues = useMemo(() => compileSignature(sourceConfig), [sourceConfig]);
  const needsHindi = useMemo(() => cues.some(cue => cue.words.some(word => /[\u0900-\u097f]/u.test(word.text))), [cues]);
  const parts = preview ? undefined : presentationConfig?.parts;
  const mainPart = parts?.main, helperPart = parts?.helper;
  const mainFace = pickedFace(mainPart), helperFace = pickedFace(helperPart);
  const mainKey = JSON.stringify(mainFace), helperKey = JSON.stringify(helperFace);
  const chosenMain = useMemo(() => mainKey ? JSON.parse(mainKey) as typeof mainFace : override, [mainKey, override]);
  const chosenHelper = useMemo(() => helperKey ? JSON.parse(helperKey) as typeof helperFace : undefined, [helperKey]);
  const { faces, ready } = useSignatureFaces(variant, chosenMain, needsHindi, chosenHelper);
  const tracking = useSpacing(presentationConfig);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Signature captions require text measurement.");
    const lay = (cap: number, own?: PartSizes) => cues.map(cue => layoutSignatureCue(cue, ctx, variant, faces, fontSize, maxWidth, cap, own, tracking));
    return lay(evenSizeCap(lay(1).map(layout => layout.fit)), sizes);
  }, [ready, cues, variant, faces, fontSize, maxWidth, sizes, tracking]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (layouts.length) onLayout?.((Math.max(...layouts.map(layout => layout.height)) + 34) * unit);
  }, [layouts, onLayout, unit]);
  const cue = activeCue(cues, now);
  const layout = cue && layouts[cue.index];
  useCueMotion(cue?.startMs, cue?.endMs);
  const motion = useContext(CueMotionContext)?.animation;
  const uid = `signature-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const hero = layout?.runs.find(run => run.role === "hero");
  const heroAge = hero ? now - hero.word.startMs : 0;
  const corner = layout && cue ? dragCorner(cue.heroId,
    layout.runs.some(run => run.role === "before"), layout.runs.some(run => run.role === "after")) : 0;
  const drag = layout && cue ? cursorDragPose(layout.box, corner, heroAge,
    Math.min(640, Math.max(180, (cue.endMs - (hero?.word.startMs ?? cue.startMs)) * .72)), reduced) : undefined;
  const mode = cue ? cue.index % 3 : 0;
  const amber = variant === "ember-lock";
  const background = sourceConfig.background;
  const chosenHero = chosenEntrance(motion, true, hero?.word.id);
  const shine = reduced ? 0 : signatureEase((heroAge - 220) / 1100);
  // The ember catches: its glow flares as the word rises out of it, then settles to a warm breath.
  const ignite = reduced ? 0 : 1 - signatureEase(heroAge / 620);
  const rise = reduced || chosenHero ? 1 : signatureEase(heroAge / 300);
  const selected = mainPart?.gradient?.stops[0]?.color ?? mainPart?.color;
  const selectionEdge = selected ? lighten(selected, .34) : "#76b6ff";
  const drawWord = (run: SignatureRun, glow = false, sheen = false) => {
    if (now < run.word.startMs) return null;
    const p = !amber && run.role === "hero" || chosenEntrance(motion, run.role === "hero", run.word.id) ? 1 : signatureWordProgress(now, run.word, reduced);
    const direction = run.role === "before" ? -1 : 1;
    const fill = sheen ? `url(#${uid}-shine)` : amber && run.role === "hero" ? `url(#${uid}-orange)` : run.role === "hero" ? "#fffdf8" : helperPart?.color ?? "#fffdf8";
    return <g key={run.word.id} data-signature-word={run.word.id} data-role={run.role}
      transform={`translate(0 ${(1 - p) * 18 * direction})`}>
      <text x={run.x} y={run.y} fontFamily={`"${run.face.family}"`} fontWeight={run.face.weight}
        fontStyle={run.face.italic ? "italic" : "normal"} fontSize={run.size} letterSpacing={run.tracking} fill={fill}
        filter={sheen ? undefined : glow ? `url(#${uid}-warm-glow)` : amber
          ? `url(#${uid}-${run.role === "hero" ? "hero-shade" : "helper-shade"})` : undefined}
        style={{ whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal" }}>{run.text}</text>
    </g>;
  };
  const motionWord = (run: SignatureRun, content: React.ReactNode, main = false) =>
    <MotionWord key={run.word.id} id={run.word.id} startMs={run.word.startMs} size={run.size} main={main} fixed={main && !amber}>{content}</MotionWord>;
  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "transparent", overflow: "hidden", pointerEvents: "none" }}>
    {background?.src && ("kind" in background && background.kind === "image" ? <Img src={signatureAsset(background.src)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <SourceVideo src={signatureAsset(background.src)}
      muted={background.muted ?? false} volume={background.volume ?? 1} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />)}
    {background?.src && !preview && <AbsoluteFill style={{
      background: "linear-gradient(to bottom, transparent 38%, rgba(0,0,0,.14) 58%, rgba(0,0,0,.46) 100%)",
    }} />}
    {cue && layout && hero && <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      aria-label={cue.words.map(word => word.text).join(" ")} data-signature-style={variant}
      style={{ position: "absolute", inset: 0, display: "block" }}>
      <defs>
        <FillStops id={`${uid}-orange`} part={amber ? mainPart : undefined} line={{ x1: 0, y1: 0, x2: 0, y2: 1 }}
          shades={color => [lighten(color, .28), color, darken(color, .32)]} fallback={["#ffb347", "#ff6200", "#b52a00"]} />
        <FillStops id={`${uid}-selection`} part={amber ? undefined : mainPart} line={{ x1: 0, y1: 0, x2: 1, y2: 1 }}
          shades={color => [lighten(color, .26), color, darken(color, .24)]} fallback={["#38bdf8", "#2f74ff", "#1e3fd0"]} />
        {hero && <linearGradient id={`${uid}-shine`} gradientUnits="userSpaceOnUse"
          x1={hero.x - hero.left - hero.size + (hero.left + hero.right + hero.size * 2) * shine}
          x2={hero.x - hero.left + (hero.left + hero.right + hero.size * 2) * shine} y1="0" y2="0">
          <stop offset="0" stopColor="#fff8cb" stopOpacity="0" /><stop offset=".5" stopColor="#fff8cb" stopOpacity=".88" />
          <stop offset="1" stopColor="#fff8cb" stopOpacity="0" />
        </linearGradient>}
        <filter id={`${uid}-warm-glow`} x="-25%" y="-100%" width="150%" height="300%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={`${uid}-hero-shade`} x="-15%" y="-40%" width="130%" height="190%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#1c0700" floodOpacity=".62" />
        </filter>
        <filter id={`${uid}-helper-shade`} x="-20%" y="-80%" width="140%" height="260%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#ff7a18" floodOpacity=".22" />
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1c0700" floodOpacity=".82" />
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#000" floodOpacity=".46" />
        </filter>
        {amber && <clipPath id={`${uid}-rise`}>
          <rect x={layout.left - 40} width={layout.right - layout.left + 80} y={layout.top - 40 + (layout.bottom - layout.top + 80) * (1 - rise)} height={layout.bottom - layout.top + 80} />
        </clipPath>}
      </defs>
      <g transform={`translate(${720 * positionX} ${canvasHeight * positionY})`} data-signature-lockup={cue.id}>
        {!amber && heroAge >= 0 && drag && <g data-signature-system="" data-fixed-corner={corner}>
          <g transform={drag.transform}>
          <rect data-signature-selection={mode === 0 ? "solid" : mode === 1 ? "outline" : "dashed"}
            x={layout.box.left} y={layout.box.top} width={layout.box.width} height={layout.box.height} rx="3"
            fill={mode === 0 ? `url(#${uid}-selection)` : selected ?? "#2f74ff"} fillOpacity={mode === 0 ? 1 : .08}
            stroke={mode === 0 ? "none" : selectionEdge} strokeWidth="2.3" strokeDasharray={mode === 2 ? "8 6" : undefined} />
          {motionWord(hero, drawWord(hero), true)}
          </g>
          <rect x={drag.anchorX - 2.5} y={drag.anchorY - 2.5} width="5" height="5" fill="#fff" stroke={selectionEdge} strokeWidth="1" />
          <rect x={drag.x - 2.5} y={drag.y - 2.5} width="5" height="5" fill="#fff" stroke={selectionEdge} strokeWidth="1" />
          <g data-signature-cursor="" opacity={drag.pointerOpacity}
            transform={`translate(${drag.pointerX} ${drag.pointerY}) rotate(${drag.angle}) scale(1.45)`}>
            <path d="M0.6 0.6 L0.6 18.4 L4.9 14.3 L7.7 20.4 L10.6 19.0 L7.8 13.1 L13.0 12.9 Z"
              fill="#101010" stroke="#ffffff" strokeWidth="1.1" strokeLinejoin="round" />
          </g>
        </g>}
        {amber && motionWord(hero, <>
          <g opacity={.3 + ignite * .55} aria-hidden="true">{drawWord(hero, true)}</g>
          <g clipPath={rise < 1 ? `url(#${uid}-rise)` : undefined}>{drawWord(hero)}</g>
          {shine > 0 && shine < 1 && <g aria-hidden="true">{drawWord(hero, false, true)}</g>}
        </>, true)}
        {layout.runs.filter(run => run.role !== "hero").map(run => motionWord(run, drawWord(run)))}
      </g>
    </svg>}
  </AbsoluteFill>;
};

export const resolveSignatureMetadata = ({ props }: { props: SignatureCaptionProps }) => {
  const cues = compileSignature(props.sourceConfig);
  return { fps: 30, durationInFrames: Math.max(30, Math.ceil(Math.max(props.sourceConfig.durationMs ?? 0,
    cues[cues.length - 1]?.endMs ?? 0) * .03)) };
};
