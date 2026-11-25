import { useSpacing } from "../Premium/sizes";
import { MotionWord } from "../Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import { usePartSizes } from "../Premium/parts";
import type { PartSizes } from "../Premium/sizes";
import React, { useContext, useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { SCRIPT_FONTS } from "../Basic/catalog";
import type { BasicCaptionRendererProps } from "../BasicCaption/BasicCaptionRenderer";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { isRecord } from "../CaptionEngine/types";
import { activeCue } from "../LaunchCaptionPack/timeline";
import { compileSignature, signatureEase, signatureWordProgress } from "../Premium/Signature/engine";
import { signatureAsset } from "../Premium/Signature/fonts";
import { LineRevealContext, revealLines } from "../Standard/reveal";
import { useCuratedFaces } from "./fonts";
import { curatedMain, layoutCuratedCue, type CuratedVariant } from "./layout";
import { letterHighlightProgress } from "./letterHighlight";
import { accentGradient, keyGradient, leadColor, SvgPaint, textGradient } from "../Standard/paint";
import { SourceVideo } from "../SourceVideo";

export type CuratedCaptionProps = BasicCaptionRendererProps & { variant: CuratedVariant };
/** Words and characters a caption may take: at the design's size, more than this leaves the safe area. */
const CHUNKS: Record<CuratedVariant, [number, number]> = {
  "dynamic-simple": [5, 30], "verse-flow": [6, 36], "luma-script": [7, 42], "red-wipe": [6, 34], creator: [6, 34], hind: [6, 36], "relay-flow": [6, 36],
};
/** Verse Flow turns each caption a little in space, towards one side and then the other. */
const VERSE_TILT = [-11, 9, -7, 12];
const number = (value: unknown, fallback: number, lo: number, hi: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;

export const CuratedCaption: React.FC<CuratedCaptionProps> = ({ variant, sourceConfig, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame(), { width, height, fps } = useVideoConfig();
  const input = isRecord(styleConfig) ? styleConfig : {}, font = isRecord(input.font) ? input.font : {};
  const position = isRecord(input.layout) ? input.layout : {};
  const preview = !!presentationConfig?.onLayout, settled = preview && input.naturalWrap === true;
  const now = frame * 1000 / fps, unit = (preview ? width : Math.min(width, height)) / 720;
  const canvasWidth = width / unit, canvasHeight = height / unit;
  const mixed = variant === "luma-script" || variant === "verse-flow";
  const soft = mixed || variant === "dynamic-simple";
  const reduced = presentationConfig?.reducedMotion === true;
  // Relay Flow's headline type sits a little larger than the rest.
  const size = (preview ? 84 : number(font.size, 88, 40, 220)) * (variant === "relay-flow" ? 1.1 : 1);
  const maxWidth = 720 * (preview ? .78 : number(position.maxWidth, .84, .3, .92));
  const x = canvasWidth * (preview ? .5 : number(position.positionX, .5, .1, .9));
  const y = canvasHeight * (preview ? .5 : number(position.positionY, .72, .1, .9));
  const override = useMemo(() => !preview && typeof font.src === "string" && typeof font.family === "string" ? {
    family: font.family, src: font.src, weight: number(font.weight, 700, 100, 900), italic: font.italic === true,
  } : undefined, [preview, font.family, font.src, font.weight, font.italic]);
  const script = mixed && !preview ? SCRIPT_FONTS[presentationConfig?.emphasis?.font as keyof typeof SCRIPT_FONTS] : undefined;
  const keyFace = useMemo(() => script ? { family: script.family, src: script.src, weight: script.weight, italic: script.italic } : undefined, [script]);
  const cues = useMemo(() => {
    const [maxWords, maxCharacters] = CHUNKS[variant];
    const compiled = compileSignature(sourceConfig, maxWords, maxCharacters);
    // Once key words are chosen, a line without one has no hero of its own.
    return compiled.some(cue => cue.words.some(word => word.emphasis))
      ? compiled.map(cue => cue.words.some(word => word.emphasis) ? cue : { ...cue, heroId: "" }) : compiled;
  }, [sourceConfig, variant]);
  const needsHindi = useMemo(() => cues.some(cue => cue.words.some(word => /[\u0900-\u097f]/u.test(word.text))), [cues]);
  // Each kind of text takes the font picked for it: main is the headline row or key word, helper the rest.
  // Luma's normal words follow the caption font, so only its key words take a part.
  const partFonts = variant === "red-wipe" || variant === "creator" || variant === "hind" || variant === "relay-flow" || variant === "dynamic-simple" || mixed
    ? presentationConfig?.parts : undefined;
  const pickedKey = JSON.stringify([partFonts?.main?.family, partFonts?.main?.src, partFonts?.main?.weight, partFonts?.main?.italic,
    partFonts?.helper?.family, partFonts?.helper?.src, partFonts?.helper?.weight, partFonts?.helper?.italic]);
  const picked = useMemo(() => {
    const face = (look?: { family?: string; src?: string; weight?: number; italic?: boolean }) => look?.family && look.src
      ? { family: look.family, src: look.src, weight: look.weight ?? 400, italic: look.italic === true } : undefined;
    // Verse Flow's plain words are its main face, so they take the helper pick; Luma's follow the caption font.
    return mixed ? { serif: face(partFonts?.main), ...(variant === "verse-flow" ? { main: face(partFonts?.helper) } : {}) }
      : { main: face(partFonts?.main), sans: face(partFonts?.helper) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey]);
  const { faces, ready } = useCuratedFaces(variant, override, needsHindi, keyFace, picked);
  const tracking = useSpacing(presentationConfig);
  const byLine = useContext(LineRevealContext);
  const sizes = usePartSizes(presentationConfig);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Caption layout requires canvas text measurement.");
    const lay = (cap: number, own?: PartSizes) => cues.map(cue => layoutCuratedCue(cue, ctx, variant, faces, size, maxWidth, cap, own, tracking));
    const even = lay(evenSizeCap(lay(1).map(layout => layout.fit)), sizes);
    return byLine ? even.map(layout => ({ ...layout, runs: revealLines(layout.runs, run => run.row) })) : even;
  }, [ready, cues, faces, variant, size, maxWidth, byLine, sizes, tracking]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (layouts.length) onLayout?.((Math.max(...layouts.map(layout => layout.height)) + 38) * unit); }, [layouts, onLayout, unit]);
  const cue = activeCue(cues, now), layout = cue && layouts[cue.index];
  useCueMotion(cue?.startMs, cue?.endMs);
  const uid = `curated-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const background = sourceConfig.background;
  const premium = variant === "dynamic-simple" || variant === "verse-flow";
  const parts = premium ? presentationConfig?.parts : undefined;
  const chosen = useChosenEntrance();
  const accent = parts?.main?.color ?? (presentationConfig?.highlights?.enabled === false ? "#fff" :
    presentationConfig?.highlights?.color ?? (typeof input.accent === "string" ? input.accent : variant === "dynamic-simple" ? "#7839e8" : "#e6f65c"));
  const plainFill = parts?.helper?.color ?? "#fff";
  // A gradient picked for the key word or the normal text paints each word edge to edge.
  const keyPaint = variant === "luma-script" || variant === "hind" ? keyGradient(presentationConfig) : undefined;
  const textPaint = variant === "luma-script" ? textGradient(presentationConfig) : undefined;
  const glowColor = keyPaint ? leadColor(keyPaint) : accent;
  // Red Wipe's wipe and Creator's reply line follow the Accent, solid or gradient.
  const accentPaint = variant === "red-wipe" || variant === "creator" ? accentGradient(presentationConfig) : undefined;
  const replyColor = accentPaint ? leadColor(accentPaint) : variant === "creator" ? presentationConfig?.highlights?.color ?? "#2baeff" : "#2baeff";
  const wipeFill = accentPaint ? `url(#${uid}-accent)` : presentationConfig?.highlights?.color ?? "#b51008";
  const spokenMs = presentationConfig?.spokenMs;
  const activeIndex = cue ? cue.words.reduce((last, word, index) => (spokenMs?.[word.id] ?? word.startMs) <= now ? index : last, 0) : 0;
  const active = layout?.runs[activeIndex], previous = layout?.runs[Math.max(0, activeIndex - 1)];
  const progress = reduced || settled ? 1 : active ? signatureEase((now - active.word.startMs) / 180) : 0;
  const sameRow = active?.row === previous?.row;
  const railX = active && previous ? (sameRow ? previous.x + (active.x - previous.x) * progress : active.x) : 0;
  const railWidth = active && previous ? (sameRow ? previous.advance + (active.advance - previous.advance) * progress : active.advance * progress) : 0;
  const verse = variant === "verse-flow";
  const verseRow = verse ? layout?.runs.find(run => run.hero)?.row : undefined;
  const verseIn = !cue || settled || reduced ? 1 : signatureEase((now - cue.startMs) / 560);
  const verseTurn = verse && cue ? VERSE_TILT[cue.index % VERSE_TILT.length] : 0;
  // The caption swings in further than it rests, then keeps drifting while it is on screen.
  const verseAngle = verseTurn * (1.8 - .8 * verseIn) + (settled || reduced || !cue ? 0 : Math.sign(verseTurn) * -1.6 * (now - cue.startMs) / Math.max(1, cue.endMs - cue.startMs));
  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", background: presentationConfig?.backgroundColor ?? "transparent" }}>
    {background?.src && ("kind" in background && background.kind === "image" ? <Img src={signatureAsset(background.src)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={signatureAsset(background.src)} muted={background.muted ?? false} volume={background.volume ?? 1}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />)}
    {cue && layout && <svg width={width} height={height} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      data-curated-style={variant} aria-label={cue.words.map(word => word.text).join(" ")}
      data-caption-treatment={layout.treatment}
      style={{ position: "absolute", inset: 0, display: "block", ...(verse ? {
        transform: `perspective(${1000 * unit}px) rotateY(${verseAngle}deg) rotateX(${2.5 + (1 - verseIn) * 5}deg)`,
        transformOrigin: `${x * unit}px ${y * unit}px` } : {}) }}>
      <defs>
        <radialGradient id={`${uid}-cyan`} cx="65%" cy="0%" r="110%" gradientTransform="scale(1 2.2)">
          <stop offset="0" stopColor="#fff" /><stop offset=".15" stopColor="#fff" /><stop offset=".35" stopColor="#c4e8ff" />
          <stop offset=".74" stopColor={replyColor} /><stop offset="1" stopColor="#062538" />
        </radialGradient>
        <linearGradient id={`${uid}-relay`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c6fff1" /><stop offset=".5" stopColor="#62f0cd" /><stop offset="1" stopColor="#71cfff" />
        </linearGradient>
        {keyPaint && <SvgPaint id={`${uid}-key`} paint={keyPaint} />}
        {accentPaint && <SvgPaint id={`${uid}-accent`} paint={accentPaint}
          box={variant === "creator" && accentPaint.scope === "line" && layout.rows[1] ? { x: layout.rows[1].left, y: layout.rows[1].top,
            width: layout.rows[1].width, height: layout.rows[1].height } : undefined} />}
        {textPaint && <SvgPaint id={`${uid}-text`} paint={textPaint} />}
        <filter id={`${uid}-white`} x="-30%" y="-100%" width="160%" height="300%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="3.2" floodColor="#fff" floodOpacity=".6" />
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#fff" floodOpacity=".2" />
        </filter>
        <filter id={`${uid}-warm`} x="-40%" y="-100%" width="180%" height="300%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#ff9b3d" floodOpacity=".7" />
          <feDropShadow dx="0" dy="0" stdDeviation="9" floodColor="#ff9b3d" floodOpacity=".22" />
        </filter>
        <filter id={`${uid}-cyan-glow`} x="-30%" y="-100%" width="160%" height="300%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={replyColor} floodOpacity=".65" />
          <feDropShadow dx="0" dy="0" stdDeviation="9" floodColor={replyColor} floodOpacity=".22" />
        </filter>
        <filter id={`${uid}-accent-glow`} x="-40%" y="-110%" width="180%" height="320%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={glowColor} floodOpacity=".7" />
          <feDropShadow dx="0" dy="0" stdDeviation="11" floodColor={glowColor} floodOpacity=".22" />
        </filter>
        <filter id={`${uid}-subtle-glow`} x="-25%" y="-90%" width="150%" height="280%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#fff" floodOpacity=".32" />
        </filter>
        {layout.rows.map((row, i) => <clipPath id={`${uid}-row-${i}`} key={i}>
          <rect x={layout.left - 36} y={row.top - (variant === "red-wipe" ? 13 : 36)} width={layout.width + 72}
            height={row.height + (variant === "red-wipe" ? 26 : 72)} />
        </clipPath>)}
      </defs>
      <g transform={`translate(${x} ${y})`} data-curated-lockup={cue.id}>
        {variant === "red-wipe" && layout.rows.length > 1 && (() => {
          const row = layout.rows[1], first = layout.runs.find(run => run.row === 1)!;
          const p = settled || reduced && now >= first.word.startMs ? 1 : signatureEase((now - first.word.startMs) / 280);
          return <rect data-red-wipe="" x={row.left - 11} y={row.top - 5} width={(row.width + 22) * p}
            height={row.height + 12} fill={wipeFill} />;
        })()}
        {variant === "relay-flow" && active && now >= active.word.startMs && <g aria-hidden="true">
          <rect x={railX - 10} y={active.y - active.ascent - 9} width={railWidth + 20} height={active.ascent + active.descent + 18}
            rx="7" fill={`url(#${uid}-relay)`} opacity=".13" />
          <path d={`M ${railX - 2} ${active.y + active.descent + 13} h ${railWidth + 4}`}
            stroke="#62f0cd" strokeWidth="4" strokeLinecap="round" />
        </g>}
        {layout.runs.map(run => {
          if (!settled && now < run.word.startMs) return null;
          const main = curatedMain(variant, run.row, run.hero);
          const relay = variant === "relay-flow";
          // Relay Flow: each word slides out to the right from behind its own edge, slower when there
          // is room before the next word. A lower row's first word rises out from below instead.
          const nextStart = layout.runs.map(other => other.word.startMs).filter(start => start > run.word.startMs).sort((a, b) => a - b)[0];
          const relayMs = nextStart === undefined ? 460 : Math.max(220, Math.min(480, (nextStart - run.word.startMs) * .9));
          const p = settled || chosen(run.word.id, main) ? 1 : relay
            ? now < run.word.startMs ? 0 : reduced ? 1 : signatureEase((now - run.word.startMs) / relayMs)
            : signatureWordProgress(now, run.word, reduced);
          const riseUp = relay && run.row > 0 && layout.runs.find(other => other.row === run.row) === run;
          const isDynamicHero = variant === "dynamic-simple" && run.hero;
          const highlighted = isDynamicHero ? letterHighlightProgress(now, run.word.startMs, run.word.endMs,
            run.letterEdges ?? [0, 1], reduced) : 0;
          const originalFill = variant === "creator" && run.row === 1 ? `url(#${uid}-${accentPaint ? "accent" : "cyan"})` :
            variant === "hind" && run.hero ? keyPaint ? `url(#${uid}-key)` : presentationConfig?.highlights?.color ?? "#ff9b3d" :
              mixed ? run.hero ? keyPaint ? `url(#${uid}-key)` : accent : textPaint ? `url(#${uid}-text)` : parts?.helper?.color ?? (typeof font.color === "string" ? font.color : "#fff") :
              variant === "relay-flow" && run.hero ? `url(#${uid}-relay)` : plainFill;
          const fill = presentationConfig?.wordColors?.[run.word.id] ?? originalFill;
          const glow = variant === "red-wipe" ? undefined : variant === "hind" ? run.hero ? "warm" : "white" :
            variant === "creator" ? run.row === 1 ? "cyan-glow" : "white" :
              mixed ? run.hero ? "accent-glow" : variant === "luma-script" ? undefined : "subtle-glow" : "subtle-glow";
          // Skew around each glyph's baseline, so the measured row stays centered.
          const clipId = `${uid}-cut-${layout.runs.indexOf(run)}`;
          return <MotionWord key={run.word.id} id={run.word.id} startMs={run.word.startMs} size={run.size} main={main}><g clipPath={`url(#${uid}-row-${run.row})`} data-curated-word={run.word.id}>
            {relay && p < 1 && <clipPath id={clipId}><rect x={run.x - run.left - 6} y={run.y - run.ascent - 10}
              width={run.left + run.right + 12} height={run.ascent + run.descent + 20} /></clipPath>}
            <g clipPath={relay && p < 1 ? `url(#${clipId})` : undefined}>
            <g transform={relay ? `translate(${riseUp ? 0 : -(1 - p) * run.size * .6} ${riseUp ? (1 - p) * run.size * .55 : 0})` : verse ? `translate(${(1 - p) * (verseRow === undefined || run.row === verseRow ? 0 : run.row < verseRow ? -30 : 30)} ${run.hero ? (1 - p) * 26 : 0})` :
              `translate(0 ${(1 - p) * (variant === "dynamic-simple" ? 30 : soft ? 18 : 20)})`}
              opacity={soft || relay ? Math.min(1, p * 1.6) : 1} style={(soft || relay) && p < 1 ? { filter: `blur(${(1 - p) * (verse ? 9 : 6)}px)` } : undefined}>
              {isDynamicHero && highlighted > 0 && <rect data-letter-highlight={run.word.id}
                x={run.x - run.left - 10} y={run.y - run.ascent - 7}
                width={(run.left + run.right + 20) * highlighted} height={run.ascent + run.descent + 14} rx="4" fill={accent} />}
              {verse && run.hero && <text aria-hidden="true" x={run.x + run.size * .055} y={run.y + run.size * .055} fontFamily={`"${run.face.family}"`}
                fontSize={run.size} fontWeight={run.face.weight} fontStyle={run.face.italic ? "italic" : "normal"} letterSpacing={run.tracking}
                fill="none" stroke={fill} strokeWidth={1.2} opacity=".42" style={{ whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal" }}>{run.text}</text>}
              <text x={run.x} y={run.y} fontFamily={`"${run.face.family}"`} fontSize={run.size} fontWeight={run.face.weight}
                fontStyle={run.face.italic ? "italic" : "normal"} letterSpacing={run.tracking} fill={fill}
                transform={variant === "creator" && run.row === 1 ? `translate(0 ${run.y}) skewX(-7) translate(0 ${-run.y})` : undefined}
                filter={glow ? `url(#${uid}-${glow})` : undefined}
                style={{ whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal" }}>{run.text}</text>
            </g>
            </g>
          </g></MotionWord>;
        })}
      </g>
    </svg>}
  </AbsoluteFill>;
};

export const resolveCuratedMetadata = ({ props }: { props: Pick<CuratedCaptionProps, "sourceConfig"> }) => {
  const cues = compileSignature(props.sourceConfig, 7);
  return { fps: 30, durationInFrames: Math.max(30, Math.ceil(Math.max(props.sourceConfig.durationMs ?? 0, cues[cues.length - 1]?.endMs ?? 0) * .03)) };
};
