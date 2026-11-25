import { keyGradient, leadColor, SvgPaint } from "../paint";
import { MotionWord } from "../MotionWord";
import { useChosenEntrance, useCueMotion } from "../../BasicCaption/cueMotion";
import React, { useContext, useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { activeCue } from "../../LaunchCaptionPack/timeline";
import { LineRevealContext, revealLines } from "../reveal";
import { PartSizesContext } from "../../Premium/parts";
import type { CaptionSource } from "../../LaunchCaptionPack/types";
import { clamp, finite } from "../../CaptionEngine/types";
import type { BasicCaptionPresentation } from "../../BasicCaption/BasicCaptionRenderer";
import { editorialSelectSource } from "../../EditorialSelect/source";
import { compileTypography, type KineticVariant } from "./engine";
import { captionAsset, hindiText, usePickedTypography, useTypographyFonts, type Face } from "./fonts";
import { evenTypeLayouts, layoutKinetic } from "./layout";
import { captionDrift, out, revealAt } from "./motion";
import { fourSideFrom, rowsByBaseline } from "../fourSide";
import { SourceVideo } from "../../SourceVideo";

export type KineticStyleProps = {
  variant: KineticVariant;
  sourceConfig?: CaptionSource;
  styleConfig?: { positionX?: number; positionY?: number; maxWidth?: number; naturalWrap?: boolean };
  presentationConfig?: BasicCaptionPresentation;
};
const CRIMSON_MS = 640;
const faces: Record<KineticVariant, readonly Face[]> = {
  "crimson-rise": ["condensed", "sans"], "pocket-flow": ["heavy", "sans", "italic"], "prism-relay": ["capital", "mono"],
};

const PICKS: Record<KineticVariant, Partial<Record<Face, "main" | "helper">>> = {
  "crimson-rise": { condensed: "main", sans: "helper" }, "pocket-flow": { heavy: "main", italic: "main", sans: "helper" },
  "prism-relay": { capital: "main", mono: "helper" },
};

export const KineticStyle: React.FC<KineticStyleProps> = ({ variant, sourceConfig = editorialSelectSource, styleConfig, presentationConfig }) => {
  const { width, height, fps } = useVideoConfig();
  const now = useCurrentFrame() * 1000 / fps;
  const uid = `kinetic-${useId().replace(/[^a-zA-Z0-9]/gu, "")}`;
  const preview = !!presentationConfig?.onLayout;
  const settled = styleConfig?.naturalWrap === true;
  const reduced = presentationConfig?.reducedMotion === true;
  const red = variant === "crimson-rise", prism = variant === "prism-relay";
  const compiled = useMemo(() => compileTypography(sourceConfig, variant), [sourceConfig, variant]);
  const design = useTypographyFonts(faces[variant], compiled.words.some(word => hindiText(word.text)));
  // The main line or key word, and the rest, each take the font picked for them.
  const { fonts, ready } = usePickedTypography(design.fonts, design.ready, presentationConfig?.parts, PICKS[variant]);
  const positionX = clamp(finite(styleConfig?.positionX, .5), .12, .88);
  const positionY = clamp(finite(styleConfig?.positionY, preview ? .5 : .7), .15, .88);
  const maxWidth = clamp(finite(styleConfig?.maxWidth, .74), .35, .92);
  const byLine = useContext(LineRevealContext);
  const sizes = useContext(PartSizesContext);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const geometry = { width, height, positionX, positionY, maxWidth, preview, sizes };
    const placed = evenTypeLayouts(compiled.cues.map(cue => layoutKinetic(cue, variant, fonts, geometry)), geometry);
    return byLine ? placed.map(cue => ({ ...cue, items: revealLines(cue.items, item => item.baseline) })) : placed;
  }, [ready, compiled, variant, fonts, width, height, positionX, positionY, maxWidth, preview, byLine, sizes]);
  const cue = settled ? layouts[0] : activeCue(layouts, now);
  useCueMotion(cue?.startMs, cue?.endMs);
  const chosen = useChosenEntrance();
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (onLayout && layouts.length) onLayout(Math.max(...layouts.map(layout => layout.height)) + 24); }, [onLayout, layouts]);
  const unit = preview ? width / 720 : Math.min(width, height) / 720;
  const background: CaptionSource["background"] = sourceConfig.background;
  const keyPaint = prism ? keyGradient(presentationConfig) : undefined;
  const accent = keyPaint ? leadColor(keyPaint) : presentationConfig?.highlights?.color ?? (prism ? "#75e6ee" : "#ff3045");
  const drift = cue && red ? captionDrift(now, cue.words, settled || reduced) * unit : 0;
  // Crimson's lines arrive whole: each slides up and settles from slightly large.
  const crimsonLines = new Map<string, { start: number; x: number; y: number }>();
  if (cue && red) for (const line of new Set(cue.items.map(item => item.line))) {
    const rows = cue.items.filter(item => item.line === line);
    crimsonLines.set(line, { start: Math.min(...rows.map(item => item.word.startMs)),
      x: (Math.min(...rows.map(item => item.x + item.ink.left)) + Math.max(...rows.map(item => item.x + item.ink.right))) / 2,
      y: rows[0].baseline + (rows[0].ink.top + rows[0].ink.bottom) / 2 });
  }
  // Pocket Flow builds like Fourfold: words close in from all four sides.
  const pocketRows = cue && variant === "pocket-flow"
    ? rowsByBaseline(cue.items, item => item.baseline, item => item.x, 6 * unit) : undefined;
  return <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", backgroundColor: presentationConfig?.backgroundColor ?? "#171717" }}>
    {background?.src ? <>
      {background.kind === "image" ? <Img src={captionAsset(background.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <SourceVideo src={captionAsset(background.src)} muted={background.muted ?? false} volume={clamp(finite(background.volume, 1), 0, 1)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      <AbsoluteFill style={{ background: `linear-gradient(transparent 45%, #000000${red ? "52" : "20"} 78%, #000000${red ? "b0" : "60"} 100%)` }} />
    </> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={cue.words.map(word => word.text).join(" ")}
      data-kinetic-style={variant} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id={`${uid}-red`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb3a5" /><stop offset=".32" stopColor="#ff5967" /><stop offset=".64" stopColor={accent} /><stop offset="1" stopColor="#b80b29" /></linearGradient>
        <linearGradient id={`${uid}-white`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#f6f6f2" /><stop offset="1" stopColor="#d6dcda" /></linearGradient>
        {keyPaint ? <SvgPaint id={`${uid}-prism`} paint={keyPaint} /> : <linearGradient id={`${uid}-prism`} x1="0" y1="0" x2="1" y2=".55"><stop offset="0" stopColor="#f3fffd" /><stop offset=".42" stopColor={accent} /><stop offset="1" stopColor="#a495ff" /></linearGradient>}
        <filter id={`${uid}-glow`} x="-60%" y="-160%" width="220%" height="420%"><feGaussianBlur stdDeviation={5 * unit} /></filter>
        <filter id={`${uid}-bloom`} x="-80%" y="-200%" width="260%" height="500%"><feGaussianBlur stdDeviation={11 * unit} /></filter>
        {prism ? cue.items.filter(item => item.role === "hero").flatMap((item, index) => [0, 1, 2].map(band =>
          <clipPath key={`${index}-${band}`} id={`${uid}-slice-${item.word.id.replace(/[^a-zA-Z0-9]/gu, "")}-${band}`}>
            <rect x={item.x + item.ink.left - 1} y={item.baseline + item.ink.top + item.ink.height * band / 3 - .2}
              width={item.ink.width + 2} height={item.ink.height / 3 + .5} />
          </clipPath>)) : null}
      </defs>
      <g transform={`translate(${cue.x} ${cue.y + drift}) scale(${cue.scale})`}>
        {cue.items.map(item => {
          const hero = item.role === "hero";
          const still = reduced || chosen(item.word.id, hero);
          const row = !still && !settled ? crimsonLines.get(item.line) : undefined;
          const progress = row ? (now < row.start ? 0 : out((now - row.start) / CRIMSON_MS)) : revealAt(now, item.word.startMs, item.word.endMs, still, settled);
          if (!progress) return null;
          const age = now - item.word.startMs;
          const props = { x: item.x, y: item.baseline, fontFamily: item.font.family, fontWeight: item.font.weight,
            fontStyle: item.font.style, fontSize: item.size,
            style: { fontKerning: "normal", fontSynthesis: "none", whiteSpace: "pre" } as React.CSSProperties };
          if (prism && hero) return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main><g data-kinetic-word={item.word.id}>
            <g filter={`url(#${uid}-glow)`} opacity={.24 * progress}><text {...props} fill={accent}>{item.text}</text></g>
            {[0, 1, 2].map(band => {
              const available = Math.max(1, cue.endMs - item.word.startMs);
              const delay = Math.min(28, available * .12);
              const duration = Math.min(220, Math.max(60, (item.word.endMs - item.word.startMs) * .75), Math.max(1, available - delay * 2 - 12));
              const p = settled || still ? 1 : out((age + 12 - band * delay) / duration);
              return <g key={band} clipPath={`url(#${uid}-slice-${item.word.id.replace(/[^a-zA-Z0-9]/gu, "")}-${band})`} opacity={p}>
                <text {...props} fill={`url(#${uid}-prism)`} transform={`translate(${(1 - p) * (band % 2 ? -14 : 14) * unit} 0)`}>{item.text}</text>
              </g>;
            })}
            {!settled && !still && age < 260 ? <text {...props} fill="none" stroke={accent} strokeWidth={.7 * unit}
              transform={`translate(${(1 - progress) * -9 * unit} 0)`} opacity={(1 - progress) * .45}>{item.text}</text> : null}
          </g></MotionWord>;
          const moving = !settled && !still;
          const zoom = row ? 1 + .16 * (1 - progress) : !red && moving ? 1 - .045 * (1 - progress) : 1;
          const centerX = row?.x ?? item.x + (item.ink.left + item.ink.right) / 2;
          const centerY = row?.y ?? item.baseline + (item.ink.top + item.ink.bottom) / 2;
          const localScale = `translate(${centerX} ${centerY}) scale(${zoom}) translate(${-centerX} ${-centerY})`;
          const [fromX, fromY] = pocketRows && moving ? fourSideFrom(item, pocketRows, hero).map(v => v * unit) : [0, (red ? 30 : 16) * unit];
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main={hero}><g data-kinetic-word={item.word.id} opacity={progress}
            transform={`translate(${(1 - progress) * fromX} ${(1 - progress) * fromY}) ${pocketRows ? "" : localScale}`}
            style={{ filter: progress < 1 ? `blur(${(1 - progress) * (red ? 7 : pocketRows ? 5 : 3.2) * unit}px)` : undefined }}>
            {red && hero ? <>
              <g opacity={.38} filter={`url(#${uid}-bloom)`}><text {...props} fill={accent}>{item.text}</text></g>
              <g opacity={.72} filter={`url(#${uid}-glow)`}><text {...props} fill={accent}>{item.text}</text></g>
            </> : null}
            <text {...props} fill={`url(#${uid}-${red && hero ? "red" : "white"})`}
              style={{ ...props.style, filter: red && hero
                ? `drop-shadow(0 0 ${2 * unit}px ${accent})` : `drop-shadow(0 ${1.5 * unit}px ${1.3 * unit}px #0009)` }}>{item.text}</text>
          </g></MotionWord>;
        })}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolveKineticMetadata = ({ props }: { props: Pick<KineticStyleProps, "sourceConfig"> & { styleId?: string } }) => ({
  fps: 30, durationInFrames: Math.max(1, Math.ceil(compileTypography(props.sourceConfig ?? editorialSelectSource,
    props.styleId === "pocket-flow" || props.styleId === "prism-relay" ? props.styleId : "crimson-rise").durationMs * 30 / 1000)),
});
