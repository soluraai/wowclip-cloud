import { MotionWord } from "../Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue } from "../LaunchCaptionPack/timeline";
import { LineRevealContext, revealLines } from "../Standard/reveal";
import { PartSizesContext, usePartFonts } from "../Premium/parts";
import { clamp, finite } from "../LaunchCaptionPack/presets";
import type { CaptionSource } from "../LaunchCaptionPack/types";
import { resolveSaraConfig } from "./config";
import { compileSara, saraWordMotion } from "./engine";
import { loadSaraFonts } from "./fonts";
import { layoutSara } from "./layout";
import type { SaraProps } from "./types";
import { SourceVideo } from "../SourceVideo";

const EMPTY: CaptionSource = { transcript: [] };
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
export const Sara: React.FC<SaraProps> = ({ sourceConfig = EMPTY, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig(); const now = frame * 1000 / fps;
  const onLayout = presentationConfig?.onLayout ?? (styleConfig as any)?.onLayout;
  // An explicit styleConfig value wins so the preview card can run the real
  // word animation while onLayout keeps reporting the settled height.
  const naturalWrap = (styleConfig as any)?.naturalWrap ?? !!presentationConfig?.onLayout;
  const uid = `sara-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const config = useMemo(() => {
    const base = resolveSaraConfig(styleConfig);
    return { ...base, naturalWrap };
  }, [styleConfig, naturalWrap]);
  const compiled = useMemo(() => compileSara(sourceConfig, config), [sourceConfig, config]);
  const [fontReady, setFontReady] = useState(false);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    const handle = delayRender("Loading the supplied Archive Garamond Pro Italic font");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void loadSaraFonts().then(() => { if (!disposed) setFontReady(true); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [delayRender, continueRender, cancelRender]);
  const byLine = useContext(LineRevealContext);
  const sizes = useContext(PartSizesContext);
  const { faces: partFaces, ready: partsReady } = usePartFonts(presentationConfig?.parts);
  const picked = useMemo(() => ({ main: partFaces.main, rest: partFaces.helper }), [partFaces]);
  const layouts = useMemo(() => {
    if (!fontReady || !partsReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Sara requires a 2D text-measurement canvas.");
    const placed = layoutSara(compiled.cues, { ...config, sizes, picked }, width, height, ctx);
    return byLine ? placed.map(cue => ({ ...cue, items: revealLines(cue.items, item => item.line) })) : placed;
  }, [fontReady, partsReady, compiled, config, width, height, byLine, sizes, picked]);
  useLayoutEffect(() => {
    if (!fontReady || !onLayout || !layouts.length) return;
    const maxHeight = Math.max(...layouts.map(l => l.bounds.height));
    onLayout(maxHeight * width / 720);
  }, [fontReady, onLayout, layouts, width]);
  const cue = activeCue(layouts, now) ?? (naturalWrap ? layouts[0] : undefined);
  useCueMotion(cue?.startMs, cue?.endMs);
  const chosen = useChosenEntrance();
  const nextCue = cue ? layouts[layouts.indexOf(cue) + 1] : undefined;
  const fadesIntoSilence = cue && (!nextCue || nextCue.startMs > cue.endMs + 30);
  const exit = cue && fadesIntoSilence && !config.reducedMotion ? clamp((cue.endMs - now) / 110, 0, 1) : 1;
  const size = cue?.size ?? 1;
  return <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", backgroundColor: presentationConfig?.backgroundColor ?? "#202624" }}>
    {sourceConfig.background?.src ? sourceConfig.background.kind === "image" ?
      <Img src={asset(sourceConfig.background.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(sourceConfig.background.src)} muted={sourceConfig.background.muted ?? false}
        volume={clamp(finite(sourceConfig.background.volume, 1), 0, 1)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {sourceConfig.background?.src ? <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0, 0, 0, 0.56) 0%, rgba(0, 0, 0, 0.2) 37.4%, rgba(0, 0, 0, 0) 68%)" }} /> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={cue.words.map(w => w.text).join(" ")} data-sara-cue={cue.id} data-sara-variant={cue.variant}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        {[false, true].map(highlighted => <filter key={String(highlighted)} id={`${uid}-light${highlighted ? "-hook" : ""}`} x="-100%" y="-200%" width="300%" height="500%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation={size * (highlighted ? .13 : .095)} result="halo" />
          <feFlood floodColor={highlighted ? "#5aa9ff" : "#ffffff"} floodOpacity={clamp(config.glow * (highlighted ? 1 : .65), 0, 1)} /><feComposite in2="halo" operator="in" result="white" />
          <feGaussianBlur in="SourceAlpha" stdDeviation={size * .053} result="soft" />
          <feFlood floodColor={highlighted ? "#ffffff" : "#6a6a6a"} floodOpacity={clamp(config.glow * (highlighted ? .8 : .55), 0, 1)} /><feComposite in2="soft" operator="in" result="gray" />
          <feMerge><feMergeNode in="gray" /><feMergeNode in="white" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>)}
      </defs>
      <g opacity={exit}>
        {cue.items.map(item => {
          const motion = naturalWrap ? { opacity: 1, x: 0, hookScale: 1, blur: 0 } :
            saraWordMotion(item.word, now, cue.variant, config.reducedMotion || chosen(item.word.id, item.hook));
          // Layout already reserves the final hook size; animate from the base size
          // to that size without multiplying the emphasized font a second time.
          const hookRatio = item.size / size;
          const scale = (1 + (hookRatio - 1) * motion.hookScale) / hookRatio;
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main={item.hook}><g data-sara-word={item.word.id} opacity={motion.opacity}
            transform={`translate(${motion.x * size} 0) translate(${item.x + item.width / 2} ${item.baseline}) scale(${scale}) translate(${-item.x - item.width / 2} ${-item.baseline})`}
            style={{ filter: motion.blur > .001 ? `blur(${motion.blur * size}px)` : undefined }}>
            <text x={item.x + item.inkOffsetX} y={item.baseline} fill={config.color} fontFamily={`"${item.family}"`}
              fontWeight={item.weight ?? 400} fontStyle={item.italic ? "italic" : undefined} fontSize={item.size} letterSpacing={cue.tracking} filter={`url(#${uid}-light${item.hook ? "-hook" : ""})`}
              style={{ fontSynthesis: "none", whiteSpace: "pre", textRendering: "optimizeLegibility" }}>{item.word.text}</text>
          </g></MotionWord>;
        })}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};
export const resolveSaraMetadata = ({ props }: { props: SaraProps }) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  const compiled = compileSara(props.sourceConfig ?? EMPTY, resolveSaraConfig(props.styleConfig));
  return { fps, durationInFrames: Math.max(1, Math.ceil(compiled.durationMs * fps / 1000)) };
};
