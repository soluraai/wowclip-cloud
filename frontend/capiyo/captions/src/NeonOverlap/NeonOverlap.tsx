import { useSpacing } from "../Premium/sizes";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill, staticFile, useCurrentFrame, useDelayRender, useVideoConfig,
} from "remotion";
import { clamp, finite } from "../CaptionEngine/types";
import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import { activeNeonCues, compileNeonOverlap, resolveNeonStyle } from "./engine";
import { ensureNeonFonts } from "./fonts";
import { layoutNeonCue, placeNeonCue, type NeonLayout, type NeonTextGroup } from "./layout";
import { countProgress, heroSlideOffset, mix, neonCurrent, out, smooth, wordReveal } from "./motion";
import { CueMotionContext, useCueMotion } from "../BasicCaption/cueMotion";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { chosenEntrance, darken, gradientLine, lighten, usePartFonts, usePartSizes, type PartGradient, type PremiumParts } from "../Premium/parts";
import { MotionWord } from "../Standard/MotionWord";
import { formatNeonNumber } from "./numbers";
import { neonOverlapSource } from "./source";
import type { NeonCue, NeonSettings, NeonSource, NeonStyle } from "./types";
import { neonTheme } from "./theme";
import { SourceVideo } from "../SourceVideo";

export type NeonOverlapProps = { sourceConfig?: NeonSource; styleConfig?: NeonStyle; fps?: number;
  presentationConfig?: BasicCaptionPresentation };
const asset = (src: string) => /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

const TextGroup: React.FC<{
  group: NeonTextGroup; cue: NeonCue; now: number; heroStart: number; plain?: boolean; unit: number; reduced: boolean; textColor: string; accentColor: string;
}> = ({ group, cue, now, heroStart, plain = false, unit, reduced, textColor, accentColor }) => {
  const animation = useContext(CueMotionContext)?.animation;
  const entries = group.words.map((item) => {
    const { word } = item;
    const start = plain || word.startMs < heroStart ? word.startMs : Math.max(word.startMs, heroStart + 145);
    const reveal = reduced || chosenEntrance(animation, false, word.id) ? Number(now >= start) : wordReveal(now, start, Math.max(word.endMs, start + 70), 240);
    const index = cue.words.findIndex((entry) => entry.id === word.id);

    const accent = plain && index === cue.heroIndex;
    return { ...item, reveal, accent, start };
  });
  return <svg data-neon-support="" width={group.width} height={group.height}
    style={{ position: "absolute", left: group.left, top: group.top,
    width: group.width, height: group.height, fontFamily: group.family, zIndex: 2,
    fontStyle: group.italic ? "italic" : "normal", fontWeight: group.weight,
    fontSize: group.size, whiteSpace: "nowrap", fontSynthesis: "none", overflow: "visible" }}>
    {entries.map(({ word, x, y, size, reveal, accent, start }) => (
      <MotionWord key={word.id} id={word.id} startMs={start} size={group.size}>
        <g data-neon-word={word.id} opacity={reveal}
          transform={`translate(${x} ${y + (1 - reveal) * (plain ? 22 : 6) * unit})`}
          // No filter once shown: an SVG filter clips to the text box, which cut Hindi vowel signs.
          style={{ filter: reveal < 1 ? `blur(${((1 - reveal) * (plain ? 2.5 : 1.2) * unit).toFixed(3)}px)` : undefined }}>
          <text x={0} y={group.ascent} fontSize={size} letterSpacing={size * (group.tracking ?? 0)} fill={accent ? accentColor : textColor}
            style={{ textShadow: `0 ${unit}px ${2 * unit}px #080a0e, 0 0 ${2 * unit}px ${accent ? accentColor : textColor}88, 0 0 ${(plain ? 7 : 5) * unit}px ${accent ? accentColor : textColor}55` }}
          >{word.text}</text>
        </g>
      </MotionWord>
    ))}
  </svg>;
};

const HeroInk: React.FC<{
  cue: NeonCue; layout: NeonLayout; now: number; settings: NeonSettings; unit: number; reduced: boolean;
  colors: { accent: string; highlight: string; shadow: string }; gradient?: PartGradient;
}> = ({ cue, layout, now, settings, unit, reduced, colors, gradient }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const animation = useContext(CueMotionContext)?.animation;
  const { hero } = layout;
  const heroWord = cue.words[cue.heroIndex];
  const chosen = chosenEntrance(animation, true, heroWord.id);
  const elapsed = now - heroWord.startMs;
  if (elapsed < 0) return null;
  // The hollow word lights up in place; the solid ones still fade and slide in.
  const intro = reduced || chosen || cue.variant === "outline" ? 1 : out((elapsed + 1000 / 60) / 240);
  const outline = cue.variant === "outline";
  const shine = cue.variant === "shine";
  const { accent, highlight, shadow } = colors;
  const fillInk = `url(#${uid}-fill)`;
  // Its own motion: a hollow word strikes on like a gas-station sign (relay outages, double strikes),
  // then flickers now and then. A chosen entrance, or reduced motion, keeps it steady.
  const current = reduced || chosen || !outline ? 1 : neonCurrent(elapsed, cue.seed, settings.flicker);
  const glow = settings.glow * (outline ? 1 : 0.8);
  const numberProgress = reduced ? 1 : countProgress(now, heroWord.startMs, cue.retireMs - 80);
  const text = cue.variant === "metric" && cue.number && numberProgress < 1
    ? formatNeonNumber(cue.number, numberProgress) : hero.text;
  // Sweep is a diagonal specular band, clipped to the glyphs; it never washes the frame.
  const sweep = mix(-0.45, 1.4, smooth((elapsed - 180) / 900));
  const stroke = outline ? 1.55 * unit : 0;
  const inkStyle: React.CSSProperties = {
    fontFamily: hero.family, fontWeight: hero.weight, fontStyle: hero.italic ? "italic" : "normal", fontSize: hero.size,
    letterSpacing: hero.tracking, fontVariantNumeric: "tabular-nums", fontSynthesis: "none",
  };
  const ink = (fill: string, strokeColor = "none", strokeWidth = 0) => (
    <text x={hero.width / 2} y={hero.ascent} textAnchor="middle" style={inkStyle}
      fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} paintOrder="stroke fill">{text}</text>
  );
  const slideMode = settings.heroSlide === "alternate"
    ? (cue.heroSlide ?? "left")
    : settings.heroSlide;
  const slideX = reduced || chosen ? 0 : heroSlideOffset(intro, settings.heroSlideDistance * unit, slideMode);

  return <div data-neon-hero="" style={{ position: "absolute", left: hero.left, top: hero.top,
    width: hero.width, height: hero.height, opacity: intro,
    transform: `translateX(${slideX.toFixed(3)}px)` }}>
    <svg width={hero.width} height={hero.height} style={{ overflow: "visible", display: "block" }}>
      <defs>
        {gradient ? <linearGradient id={`${uid}-fill`} {...gradientLine(gradient.angle)}>
          {gradient.stops.map((stop, index) => <stop key={index} offset={stop.position / 100} stopColor={stop.color} />)}
        </linearGradient> : <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={highlight} />
          <stop offset="0.47" stopColor={accent} />
          <stop offset="1" stopColor={shadow} />
        </linearGradient>}
        <linearGradient id={`${uid}-shine`} x1={sweep - 0.15} y1="0" x2={sweep + 0.15} y2="0.35" spreadMethod="pad">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.43" stopColor="white" stopOpacity="0.16" />
          <stop offset="0.51" stopColor="#fff9ef" stopOpacity="0.94" />
          <stop offset="0.6" stopColor="white" stopOpacity="0.24" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-halo`} x="-50%" y="-150%" width="200%" height="400%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={3 * unit} />
        </filter>
        <filter id={`${uid}-bloom`} x="-100%" y="-200%" width="300%" height="500%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={11 * unit} />
        </filter>
      </defs>
      <g>
        {glow > 0 && <g opacity={glow * current * 0.48} filter={`url(#${uid}-bloom)`}>
          {ink(outline ? "none" : accent, accent, outline ? 5 * unit : 0)}
        </g>}
        {glow > 0 && <g opacity={glow * current * 0.65} filter={`url(#${uid}-halo)`}>
          {ink(outline ? "none" : accent, accent, outline ? 3.2 * unit : 0)}
        </g>}
        <g opacity={current}>
          {ink(outline ? "none" : fillInk, outline ? gradient ? fillInk : accent : "none", stroke)}
        </g>
        {shine && !reduced && elapsed < 1200 && ink(`url(#${uid}-shine)`)}
      </g>
    </svg>
  </div>;
};

const CueLayer: React.FC<{
  cue: NeonCue; layout: NeonLayout; now: number; settings: NeonSettings; unit: number; reduced: boolean; parts?: PremiumParts;
}> = ({ cue, layout, now, settings, unit, reduced, parts }) => {
  const main = parts?.main;
  const picked = main?.gradient?.stops[0]?.color ?? main?.color;
  const colors = picked ? { accent: picked, highlight: lighten(picked, .3), shadow: darken(picked, .22) } : neonTheme;
  const textColor = parts?.helper?.color ?? neonTheme.text;
  const fade = reduced ? 1 : 1 - smooth((now - cue.retireMs) / Math.max(1, cue.endMs - cue.retireMs));
  const heroStart = cue.words[cue.heroIndex].startMs;
  const heroVisible = cue.variant !== "plain" && now >= heroStart;
  // Lead-ins keep their final helper position as the hero arrives behind them.
  const groups = cue.variant === "plain" ? [layout.plain] : layout.groups;
  return <div data-neon-cue={cue.id} data-neon-variant={cue.variant} style={{ position: "absolute", inset: 0,
    opacity: fade, transform: `translateY(${(-(1 - fade) * 5 * unit).toFixed(3)}px)`,
    transformOrigin: "50% 0", filter: `blur(${((1 - fade) * 2 * unit).toFixed(3)}px)` }}>
    {heroVisible && <MotionWord id={cue.words[cue.heroIndex].id} startMs={heroStart} size={layout.hero.size} html main>
      <HeroInk cue={cue} layout={layout} now={now} settings={settings} unit={unit} reduced={reduced} colors={colors} gradient={main?.gradient} />
    </MotionWord>}
    {groups.map((group, index) => <TextGroup key={index} group={group} cue={cue} now={now}
      heroStart={heroStart} plain={cue.variant === "plain"} unit={unit} reduced={reduced} textColor={textColor} accentColor={colors.accent} />)}
  </div>;
};

export const NeonOverlap: React.FC<NeonOverlapProps> = ({ sourceConfig = neonOverlapSource, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const now = frame * 1000 / fps;
  const unit = width / 720;
  const compiled = useMemo(() => compileNeonOverlap(sourceConfig), [sourceConfig]);
  const settings = useMemo(() => resolveNeonStyle(styleConfig), [styleConfig]);
  const parts = presentationConfig?.parts;
  const { faces, ready: facesReady } = usePartFonts(parts);
  const sizes = usePartSizes(presentationConfig);
  const tracking = useSpacing(presentationConfig);
  const layoutKey = useMemo(() => ({ compiled, settings, width, faces, sizes, tracking }), [compiled, settings, width, faces, sizes, tracking]);
  const [loaded, setLoaded] = useState<{ key: typeof layoutKey; layouts: Map<string, NeonLayout> } | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let cancelled = false;
    let released = false;
    const handle = delayRender("Loading and measuring NeonOverlap typography");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void ensureNeonFonts().then(() => {
      if (cancelled || !facesReady) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("NeonOverlap needs a 2D context to measure typography.");
      // A long headline never sits beside one twice its size: sizes hold together across the video.
      const cap = evenSizeCap(compiled.cues.map((cue) => layoutNeonCue(cue, context, width, settings, faces, 1, undefined, tracking).fit));
      const layouts = new Map(compiled.cues.map((cue) => [cue.id, layoutNeonCue(cue, context, width, settings, faces, cap, sizes, tracking)]));
      setLoaded({ key: layoutKey, layouts });
    }).catch((error: unknown) => { if (!cancelled) cancelRender(error); }).finally(release);
    return () => { cancelled = true; release(); };
  }, [layoutKey, compiled, settings, width, faces, sizes, tracking, facesReady, delayRender, continueRender, cancelRender]);
  const visible = activeNeonCues(compiled.cues, now);
  const latest = visible[visible.length - 1];
  useCueMotion(latest?.startMs, latest?.endMs);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (loaded?.key !== layoutKey || !onLayout) return;
    onLayout(Math.max(0, ...[...loaded.layouts.values()].map(layout => {
      const cue = compiled.cues.find(cue => loaded.layouts.get(cue.id) === layout);
      const boxes = cue?.variant === "plain" ? [layout.plain] : [layout.hero, ...layout.groups];
      return Math.max(...boxes.map(box => box.top + box.height)) - Math.min(...boxes.map(box => box.top));
    })) + 48 * unit);
  }, [loaded, layoutKey, onLayout, unit, compiled]);

  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none",
    backgroundColor: settings.transparent ? "transparent" : presentationConfig?.backgroundColor ?? settings.backgroundColor }}>
    {!settings.transparent && sourceConfig.background?.src && <SourceVideo src={asset(sourceConfig.background.src)}
      muted={sourceConfig.background.muted ?? false} volume={sourceConfig.background.volume ?? 1}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    {loaded?.key === layoutKey && visible.map(cue => {
      const layout = loaded.layouts.get(cue.id)!;
      const { x, y, scale } = placeNeonCue(cue, layout, width, height, settings);
      return <div key={cue.id} style={{ position: "absolute", left: x, width, top: y, height: 0,
        transform: `scale(${scale})`, transformOrigin: "50% 0" }}>
        <CueLayer cue={cue} layout={layout} now={now} settings={settings} unit={unit}
          reduced={presentationConfig?.reducedMotion === true} parts={parts} />
      </div>;
    })}
  </AbsoluteFill>;
};

export const resolveNeonOverlapMetadata = ({ props }: { props: NeonOverlapProps }) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  return { fps, durationInFrames: Math.max(1, Math.ceil(compileNeonOverlap(props.sourceConfig ?? neonOverlapSource).durationMs * fps / 1000)) };
};
