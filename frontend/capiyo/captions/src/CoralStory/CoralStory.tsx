import { MotionWord } from "../Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import React, { useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, cancelRender, Img, Sequence, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue } from "../LaunchCaptionPack/timeline";
import { clamp, finite } from "../LaunchCaptionPack/presets";
import { resolveCoralConfig } from "./config";
import { compileCoralStory, ease, easeOut, stampMotion, wiggleMotion, wordReveal, wordSeed } from "./engine";
import { loadCoralFonts } from "./fonts";
import { animateCoralLayout, layoutCoralStory } from "./layout";
import type { CoralSource, CoralStoryProps } from "./types";
import { SourceVideo } from "../SourceVideo";

const EMPTY: CoralSource = { transcript: [] };
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
const mixColor = (from: string, to: string, amount: number) => {
  const t = clamp(amount, 0, 1);
  const rgb = [1, 3, 5].map(i => Math.round(parseInt(from.slice(i, i + 2), 16) * (1 - t) + parseInt(to.slice(i, i + 2), 16) * t));
  return `rgb(${rgb.join(",")})`;
};

export const CoralStory: React.FC<CoralStoryProps> = ({ sourceConfig = EMPTY, styleConfig, presentationConfig }) => {
  const frame = useCurrentFrame();
  const clipId = `coral-${useId().replace(/:/g, "")}`;
  const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const onLayout = presentationConfig?.onLayout ?? (styleConfig as any)?.onLayout;
  // An explicit styleConfig value wins so the preview card can run the real
  // word animation while onLayout keeps reporting the settled height.
  const naturalWrap = (styleConfig as any)?.naturalWrap ?? !!presentationConfig?.onLayout;
  const config = useMemo(() => resolveCoralConfig(styleConfig), [styleConfig]);
  const compiled = useMemo(() => compileCoralStory(sourceConfig, config), [sourceConfig, config]);
  const [fontReady, setFontReady] = useState(false);
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false;
    const handle = delayRender("Loading local Roboto and Devanagari fonts");
    void loadCoralFonts().then(() => { if (!disposed) setFontReady(true); continueRender(handle); })
      .catch(error => { if (!disposed) cancelRender(error); continueRender(handle); });
    return () => { disposed = true; continueRender(handle); };
  }, [delayRender, continueRender]);
  const layouts = useMemo(() => {
    if (!fontReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("A 2D text-measurement canvas is required for CoralStory.");
    return layoutCoralStory(compiled.cues, config, width, height, ctx);
  }, [fontReady, compiled, config, width, height]);
  useLayoutEffect(() => {
    if (!fontReady || !onLayout || !layouts.length) return;
    const maxHeight = Math.max(...layouts.map(l => l.box.height));
    onLayout(maxHeight * width / 720);
  }, [fontReady, onLayout, layouts, width]);
  const settledCue = activeCue(layouts, now) ?? (naturalWrap ? layouts[0] : null);
  const cue = settledCue ? (naturalWrap ? settledCue : animateCoralLayout(settledCue, now, config.reducedMotion)) : null;
  useCueMotion(cue?.startMs, cue?.endMs);
  const chosen = useChosenEntrance();
  const unit = Math.min(width / 1920, height / 1080);
  const beatWord = cue?.words.find(w => w.id === cue.beat?.wordId);
  const beatElapsed = now - (beatWord?.startMs ?? Infinity);
  const beatVisible = beatWord && (naturalWrap || beatElapsed >= 0);
  const entry = cue ? 1 : 0;
  const nextCue = settledCue ? layouts[layouts.indexOf(settledCue) + 1] : undefined;
  // Fade into a real silence; adjacent spoken chunks stay continuous instead of blinking.
  const fadesIntoSilence = cue && (!nextCue || nextCue.startMs > cue.endMs + 30);
  const exit = cue && fadesIntoSilence && !config.reducedMotion ? ease((cue.endMs - now) / 100) : 1;
  const stamp = cue?.variant === "stamp";
  const stampState = cue ? (naturalWrap ? { scale: 1, angle: 0, opacity: 1, x: 0, y: 0 } : stampMotion(now - cue.startMs, config.reducedMotion, wordSeed(cue.id))) :
    { scale: 1, angle: 0, opacity: 0, x: 0, y: 0 };
  const centerX = cue ? cue.box.x + cue.box.width / 2 : 0;
  const centerY = cue ? cue.box.y + cue.box.height / 2 : 0;

  return <AbsoluteFill style={{ pointerEvents: "none", backgroundColor: presentationConfig?.backgroundColor ?? "#202624" }}>
    {sourceConfig.background?.src ? sourceConfig.background.kind === "image" ?
      <Img src={asset(sourceConfig.background.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(sourceConfig.background.src)} muted={sourceConfig.background.muted ?? false}
        volume={clamp(finite(sourceConfig.background.volume, 1), 0, 1)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {config.soundEnabled && !naturalWrap ? compiled.cues.filter(c => c.beat?.sound && c.beat && c.words.some(w => w.id === c.beat?.wordId)).map(c => {
      const word = c.words.find(w => w.id === c.beat!.wordId)!;
      const isStamp = c.beat!.kind === "stamp";
      return <Sequence key={`sound-${word.id}`} from={Math.ceil(word.startMs * fps / 1000)}
        durationInFrames={Math.max(1, Math.ceil((isStamp ? .1 : .05) * fps))} layout="none">
        <Audio src={staticFile(`coral-story/sounds/${isStamp ? "stamp" : "tick"}.wav`)}
          volume={config.soundVolume * (isStamp ? 1 : .5)} />
      </Sequence>;
    }) : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={cue.words.map(w => w.text).join(" ")} data-coral-variant={cue.variant} data-cue-id={cue.id}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs><clipPath id={clipId}><rect {...cue.box} /></clipPath></defs>
      <g opacity={exit * (stamp ? stampState.opacity : entry)}
        transform={stamp ? `translate(${centerX + stampState.x * cue.items[0].size} ${centerY + stampState.y * cue.items[0].size}) rotate(${stampState.angle}) scale(${stampState.scale}) translate(${-centerX} ${-centerY})` : undefined}>
        <g>
          <rect x={cue.box.x} y={cue.box.y} width={cue.box.width} height={cue.box.height} rx={0}
            fill={stamp ? config.coral : config.paper} />
          <g clipPath={stamp ? undefined : `url(#${clipId})`}>{cue.items.map(item => {
            const reveal = naturalWrap ? { opacity: 1, x: 0, y: 0 } : wordReveal(item.word, now, config.reducedMotion || chosen(item.word.id));
            const hasArrived = naturalWrap || now >= item.word.startMs;
            const accentIn = naturalWrap ? 1 : config.reducedMotion ? Number(hasArrived) : easeOut((now - item.word.startMs) / 95);
            const isAccent = item.word.emphasis || item.word.id === cue.accentWordId;
            const accentOut = naturalWrap || isAccent ? 1 : config.reducedMotion ? Number(now < item.word.endMs) : 1 - ease((now - item.word.endMs) / 100);
            const accentAmount = naturalWrap ? Number(Boolean(isAccent)) : accentIn * accentOut;
            const boxed = !stamp && !item.word.event && !!item.word.emphasis;
            const isBeat = item.word.id === cue.beat?.wordId && !item.word.event;
            const jiggle = naturalWrap ? { x: 0, y: 0, angle: 0 } : wiggleMotion(isBeat && cue.beat?.kind === "jiggle" && !stamp ? beatElapsed : -1,
              wordSeed(item.word.id), config.reducedMotion);
            const cx = item.x + item.width / 2; const cy = item.baseline - item.ascent * .45;
            const underline = isBeat && cue.beat?.kind === "underline" && beatVisible;
            const bracket = isBeat && cue.beat?.kind === "bracket" && beatVisible;
            const draw = config.reducedMotion ? 1 : ease(beatElapsed / Math.min(210, item.word.endMs - item.word.startMs));
            return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size}><g data-word-id={item.word.id} opacity={reveal.opacity}
              transform={`translate(${cx + (reveal.x + jiggle.x) * item.size} ${cy + (reveal.y + jiggle.y) * item.size}) rotate(${jiggle.angle}) translate(${-cx} ${-cy})`}>
              {/* A key word gets the same coral block as a stamp, pressed in behind it. */}
              {boxed ? <rect x={item.x - item.size * .12} y={item.baseline - item.ascent - item.size * .1}
                width={item.width + item.size * .24} height={item.ascent + item.descent + item.size * .2}
                fill={config.coral} opacity={accentAmount}
                transform={`translate(${cx} ${cy}) scale(${.9 + .1 * accentAmount}) rotate(${-1.2 * accentAmount}) translate(${-cx} ${-cy})`} /> : null}
              <text x={item.x + item.inkOffsetX} y={item.baseline} fontFamily={`"${item.family}"`} fontWeight={config.fontWeight}
                fontSize={item.size} letterSpacing={-item.size * .01}
                fill={stamp ? "#fff5e3" : item.word.event ? config.ink : boxed ? mixColor(config.ink, "#fff5e3", accentAmount) : mixColor(config.ink, config.coral, accentAmount)}
                style={{ whiteSpace: "pre", fontSynthesis: "none" }}>{item.text}</text>
              {underline ? <path d={`M ${item.x} ${item.baseline + item.descent + 3 * unit} Q ${item.x + item.width * .45} ${item.baseline + item.descent + 7 * unit} ${item.x + item.width} ${item.baseline + item.descent + 2 * unit}`}
                pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw}
                fill="none" stroke={config.coral} strokeWidth={4 * unit} strokeLinecap="round" /> : null}
              {bracket ? <path d={`M ${item.x + 6 * unit} ${item.baseline - item.ascent - 3 * unit} h ${-9 * unit} v ${item.ascent + item.descent + 9 * unit} h ${9 * unit}
                M ${item.x + item.width - 6 * unit} ${item.baseline - item.ascent - 3 * unit} h ${9 * unit} v ${item.ascent + item.descent + 9 * unit} h ${-9 * unit}`}
                fill="none" stroke={config.coral} opacity={draw} strokeWidth={3 * unit} strokeLinecap="square" /> : null}
            </g></MotionWord>;
          })}</g>
        </g>
        {cue.beat?.kind === "burst" && beatVisible && beatElapsed < 400 && !config.reducedMotion ?
          <g stroke={config.coral} strokeWidth={3.5 * unit} strokeLinecap="round" opacity={1 - ease(beatElapsed / 400)}>
            {[0, 1, 2].map(i => {
              const angle = (-65 + i * 45) * Math.PI / 180;
              const length = (9 + 8 * ease(beatElapsed / 150)) * unit;
              const x = cue.box.x + cue.box.width - 5 * unit; const y = cue.box.y + 3 * unit;
              return <line key={i} x1={x + Math.cos(angle) * 10 * unit} y1={y + Math.sin(angle) * 10 * unit}
                x2={x + Math.cos(angle) * (10 * unit + length)} y2={y + Math.sin(angle) * (10 * unit + length)} />;
            })}
          </g> : null}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolveCoralStoryMetadata = ({ props }: { props: CoralStoryProps }) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  const compiled = compileCoralStory(props.sourceConfig ?? EMPTY, resolveCoralConfig(props.styleConfig));
  return { fps, durationInFrames: Math.max(1, Math.ceil(compiled.durationMs * fps / 1000)) };
};
