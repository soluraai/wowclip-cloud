import { useCueMotion } from "../BasicCaption/cueMotion";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue, normalizeWords } from "../LaunchCaptionPack/timeline";
import { LineRevealContext, revealLines } from "../Standard/reveal";
import { PartSizesContext, usePartFonts } from "../Premium/parts";
import type { CaptionSource } from "../LaunchCaptionPack/types";
import transcript from "../StyleTwo/demo.transcript.json";
import { Cards } from "./Cards";
import { Expressive } from "./Expressive";
import { compileClucap, layoutClucap, loadStyleFonts } from "./engine";
import type { ClucapConfig } from "./engine";
import { clamp, ease } from "./types";
import type { ClucapStyleId } from "./types";
import { SourceVideo } from "../SourceVideo";

const SOURCE: CaptionSource = { transcript, durationMs: 44044, background: { src: "why_not_you_hq.mp4" } };
export type ClucapCaptionProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: ClucapConfig & {
    naturalWrap?: boolean;
    onLayout?: (height: number) => void;
  };
  presentationConfig?: {
    onLayout?: (height: number) => void;
    backgroundColor?: string;
    reducedMotion?: boolean;
    spokenMs?: Record<string, number>;
    paints?: import("../BasicCaption/cueMotion").RolePaints;
    parts?: import("../Premium/parts").PremiumParts;
  };
  reducedMotion?: boolean;
};
const EMPTY_CONFIG: NonNullable<ClucapCaptionProps["styleConfig"]> = {};
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
const ClucapCaption: React.FC<ClucapCaptionProps & { styleId: ClucapStyleId }> = ({
  sourceConfig = SOURCE, styleConfig = EMPTY_CONFIG, presentationConfig, reducedMotion = false, styleId,
}) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps; const canvasHeight = height * 720 / width;
  const onLayout = presentationConfig?.onLayout ?? styleConfig.onLayout;
  // An explicit styleConfig value wins so the preview card can run the real
  // word animation while onLayout keeps reporting the settled height.
  const naturalWrap = styleConfig.naturalWrap ?? !!presentationConfig?.onLayout;
  const uid = `clucap-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [loadedStyle, setLoadedStyle] = useState<ClucapStyleId | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    const handle = delayRender(`Loading ${styleId} caption fonts`);
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void loadStyleFonts(styleId).then(() => { if (!disposed) setLoadedStyle(styleId); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [styleId, delayRender, continueRender, cancelRender]);
  const compiled = useMemo(() => compileClucap(sourceConfig, styleId), [sourceConfig, styleId]);
  const byLine = useContext(LineRevealContext);
  const sizes = useContext(PartSizesContext);
  const { faces: partFaces, ready: partsReady } = usePartFonts(presentationConfig?.parts);
  const picked = useMemo(() => ({ main: partFaces.main, rest: partFaces.helper }), [partFaces]);
  const layouts = useMemo(() => {
    if (loadedStyle !== styleId || !partsReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Caption fitting requires a 2D text-measurement canvas.");
    const placed = layoutClucap(compiled, styleId, { ...styleConfig, naturalWrap, sizes, picked }, canvasHeight, ctx);
    return byLine ? placed.map(cue => ({ ...cue, items: revealLines(cue.items, item => item.line) })) : placed;
  }, [loadedStyle, partsReady, compiled, styleId, styleConfig, naturalWrap, canvasHeight, byLine, sizes, picked]);
  useLayoutEffect(() => {
    if (loadedStyle !== styleId || !onLayout || !layouts.length) return;
    const maxHeight = Math.max(...layouts.map(l => l.box ? l.box.height : 90));
    onLayout(maxHeight * width / 720);
  }, [loadedStyle, styleId, onLayout, layouts, width]);
  const cue = activeCue(layouts, now) ?? (naturalWrap ? layouts[0] : undefined); const next = cue ? layouts[layouts.indexOf(cue) + 1] : undefined;
  useCueMotion(cue?.startMs, cue?.endMs);
  const previous = cue ? layouts[layouts.indexOf(cue) - 1] : undefined;
  const continuousEntry = !!cue && !!previous && previous.endMs >= cue.startMs - 1;
  const continuousExit = !!cue && !!next && next.startMs <= cue.endMs + 1;
  const motionReduced = reducedMotion || presentationConfig?.reducedMotion === true;
  const exit = !naturalWrap && styleId !== "golden-aura" && cue && (!next || next.startMs > cue.endMs + 30) && !motionReduced ?
    ease((cue.endMs - now) / 110) : 1;
  const background = sourceConfig.background;
  const cards = styleId === "redline-word-box" || styleId === "purple-voice-blink" || styleId === "filler";
  return <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", backgroundColor: presentationConfig?.backgroundColor ?? "#202624" }}>
    {background?.src ? background.kind === "image" ? <Img src={asset(background.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(background.src)} muted={background.muted ?? false}
        volume={typeof background.volume === "number" && Number.isFinite(background.volume) ? clamp(background.volume) : 1}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {background?.src ? <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,.3) 0%, rgba(0,0,0,.1) 34%, transparent 65%)" }} /> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`} role="img"
      aria-label={cue.words.map(word => word.text).join(" ")} data-clucap-cue={cue.id}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <g opacity={exit}>
        {cards ? <Cards uid={uid} styleId={styleId} now={now} reducedMotion={motionReduced} cue={cue} settled={naturalWrap}
          spokenMs={presentationConfig?.spokenMs}
          continuousEntry={continuousEntry} continuousExit={continuousExit} /> :
          <Expressive uid={uid} styleId={styleId} now={now} reducedMotion={motionReduced} cue={cue} settled={naturalWrap} paint={presentationConfig?.paints?.rest}
            continuousEntry={continuousEntry} continuousExit={continuousExit} />}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const RedlineWordBox: React.FC<ClucapCaptionProps> = props => <ClucapCaption {...props} styleId="redline-word-box" />;
export const PurpleVoiceBlink: React.FC<ClucapCaptionProps> = props => <ClucapCaption {...props} styleId="purple-voice-blink" />;
export const Scribble: React.FC<ClucapCaptionProps> = props => <ClucapCaption {...props} styleId="scribble" />;
export const GoldenAura: React.FC<ClucapCaptionProps> = props => <ClucapCaption {...props} styleId="golden-aura" />;
export const Filler: React.FC<ClucapCaptionProps> = props => <ClucapCaption {...props} styleId="filler" />;
export const SundayScript: React.FC<ClucapCaptionProps> = props => <ClucapCaption {...props} styleId="sunday-script" />;
export const resolveClucapMetadata = ({ props }: { props: ClucapCaptionProps }) => {
  const source = props.sourceConfig ?? SOURCE; const { words } = normalizeWords(source);
  const base = typeof source.durationMs === "number" && Number.isFinite(source.durationMs) ? source.durationMs : 1000;
  const duration = words.reduce((end, word) => Math.max(end, word.endMs + 240), Math.max(1000, base));
  return { fps: 30, durationInFrames: Math.max(1, Math.ceil(duration * 30 / 1000)) };
};
