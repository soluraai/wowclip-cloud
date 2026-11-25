import { MotionWord } from "../Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import { keyGradient, leadColor, SvgPaint } from "../Standard/paint";
import React, { useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import type { CaptionSource } from "../LaunchCaptionPack/types";
import { clamp, finite } from "../CaptionEngine/types";
import { editorialSelectSource } from "../EditorialSelect/source";
import { neonCurrent } from "../NeonOverlap/motion";
import { captionAsset, hindiText, usePickedTypography, useTypographyFonts, type Face } from "../Standard/kinetic/fonts";
import { revealAt } from "../Standard/kinetic/motion";
import { activeCue, compileFourfold, layoutFourfold } from "./engine";
import { evenTypeLayouts } from "../Standard/kinetic/layout";
import { SourceVideo } from "../SourceVideo";

export type FourfoldProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: { lines?: number; minFontSize?: number; maxFontSize?: number; maxWidth?: number;
    positionX?: number; positionY?: number; naturalWrap?: boolean };
  presentationConfig?: BasicCaptionPresentation;
};
const faces: readonly Face[] = ["capital", "light", "mono"];

export const Fourfold: React.FC<FourfoldProps> = ({ sourceConfig = editorialSelectSource, styleConfig, presentationConfig }) => {
  const { width, height, fps } = useVideoConfig();
  const now = useCurrentFrame() * 1000 / fps;
  const uid = `fourfold-${useId().replace(/[^a-zA-Z0-9]/gu, "")}`;
  const preview = !!presentationConfig?.onLayout;
  const settled = styleConfig?.naturalWrap === true;
  const reduced = presentationConfig?.reducedMotion === true;
  const compiled = useMemo(() => compileFourfold(sourceConfig), [sourceConfig]);
  const design = useTypographyFonts(faces, compiled.words.some(word => hindiText(word.text)));
  // Key rows take the key word font, the other rows the font picked for the rest.
  const { ready, fonts } = usePickedTypography(design.fonts, design.ready, presentationConfig?.parts, { capital: "main", light: "helper", mono: "helper" });
  const x = clamp(finite(styleConfig?.positionX, .5), .12, .88);
  const y = clamp(finite(styleConfig?.positionY, .8), .15, .88);
  const maxWidth = clamp(finite(styleConfig?.maxWidth, .6), .35, .9);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const geometry = { width, height, positionX: x, positionY: y, maxWidth, preview };
    return evenTypeLayouts(compiled.cues.map(cue => layoutFourfold(cue, fonts, geometry)), geometry);
  }, [ready, compiled, fonts, width, height, x, y, maxWidth, preview]);
  const cue = settled ? layouts[0] : activeCue(layouts, now);
  useCueMotion(cue?.startMs, cue?.endMs);
  const chosen = useChosenEntrance();
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (onLayout && layouts.length) onLayout(Math.max(...layouts.map(layout => layout.height)) + 20); }, [layouts, onLayout]);
  const unit = Math.min(width, height) / 720;
  const keyPaint = keyGradient(presentationConfig);
  const accent = keyPaint ? leadColor(keyPaint) : presentationConfig?.highlights?.color ?? "#ff5367";
  const background: CaptionSource["background"] = sourceConfig.background;
  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "#171717", overflow: "hidden", pointerEvents: "none" }}>
    {background?.src ? background.kind === "image"
      ? <Img src={captionAsset(background.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <SourceVideo src={captionAsset(background.src)} muted={background.muted ?? false} volume={clamp(finite(background.volume, 1), 0, 1)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={cue.words.map(word => word.text).join(" ")} data-fourfold-lines={cue.rows} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        {keyPaint ? <SvgPaint id={`${uid}-neon`} paint={keyPaint} /> : <linearGradient id={`${uid}-neon`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe2d7" /><stop offset=".48" stopColor={accent} /><stop offset="1" stopColor={accent} />
        </linearGradient>}
        <filter id={`${uid}-near`} x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation={2.2 * unit} /></filter>
        <filter id={`${uid}-far`} x="-80%" y="-180%" width="260%" height="460%"><feGaussianBlur stdDeviation={7 * unit} /></filter>
      </defs>
      <g transform={`translate(${cue.x} ${cue.y}) scale(${cue.scale})`}>
        {cue.items.map(item => {
          // Words close in from all four sides to build the block: the top row drops in, the bottom
          // row rises, a row's first word slides in from the left and its last from the right.
          const rowWords = cue.items.filter(other => other.line === item.line);
          const rowIndex = Number(String(item.line).split("-").pop() ?? 0), rowCount = cue.rows;
          const first = rowWords[0] === item, last = rowWords[rowWords.length - 1] === item && rowWords.length > 1;
          const keyWord = cue.emphasisIds.includes(item.word.id);
          const side = keyWord && (first || last) ? (first ? "left" : "right") :
            rowIndex === 0 && rowCount > 1 ? "top" : rowIndex === rowCount - 1 ? "bottom" : first ? "left" : last ? "right" : "bottom";
          const reach = (side === "left" || side === "right" ? 34 : 22) * unit;
          const [fromX, fromY] = side === "left" ? [-reach, 0] : side === "right" ? [reach, 0] : side === "top" ? [0, -reach] : [0, reach];
          const progress = revealAt(now, item.word.startMs, item.word.endMs, reduced || chosen(item.word.id), settled);
          if (!progress) return null;
          const focus = cue.emphasisIds.includes(item.word.id) && presentationConfig?.highlights?.enabled !== false;
          const elapsed = now - item.word.startMs;
          const current = focus && !settled && !reduced ? neonCurrent(elapsed, cue.seed, .42) : 1;
          const textProps = { x: item.x, y: item.baseline, fontFamily: item.font.family,
            fontSize: item.size, fontWeight: item.font.weight, fontStyle: item.font.style,
            style: { fontSynthesis: "none", fontKerning: "normal", whiteSpace: "pre" } as React.CSSProperties };
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size}><g data-fourfold-word={item.word.id} opacity={progress}
            transform={`translate(${(1 - progress) * fromX} ${(1 - progress) * fromY})`} style={{ filter: progress < 1 ? `blur(${(1 - progress) * 5 * unit}px)` : undefined }}>
            {focus ? <>
              <g opacity={.4 * current} filter={`url(#${uid}-far)`}><text {...textProps} fill="none" stroke={keyPaint ? `url(#${uid}-neon)` : accent} strokeWidth={3.5 * unit}>{item.text}</text></g>
              <g opacity={.72 * current} filter={`url(#${uid}-near)`}><text {...textProps} fill="none" stroke={keyPaint ? `url(#${uid}-neon)` : accent} strokeWidth={2.4 * unit}>{item.text}</text></g>
              <text {...textProps} fill="none" stroke={`url(#${uid}-neon)`} strokeWidth={1.25 * unit} opacity={current}>{item.text}</text>
              <text {...textProps} fill="none" stroke="#fff3e8" strokeWidth={1.45 * unit} strokeDasharray={`${8 * unit} ${32 * unit}`}
                strokeDashoffset={settled || reduced ? 0 : -elapsed * .025 * unit} opacity={.65 * current}>{item.text}</text>
            </> : <text {...textProps} fill="#ffffff" style={{ ...textProps.style, filter: "drop-shadow(0 1px 1px #0009)" }}>{item.text}</text>}
          </g></MotionWord>;
        })}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolveFourfoldMetadata = ({ props }: { props: FourfoldProps }) => ({
  fps: 30, durationInFrames: Math.max(1, Math.ceil(compileFourfold(props.sourceConfig ?? editorialSelectSource).durationMs * 30 / 1000)),
});
