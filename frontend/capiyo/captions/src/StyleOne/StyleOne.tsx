import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame,
  useDelayRender, useVideoConfig,
} from "remotion";
import { compileCaptionPlan, getActiveCueIndex } from "../CaptionEngine/compilePlan";
import { clamp, finite, type CaptionCue } from "../CaptionEngine/types";
import { resolveStyleOneConfig, type StyleOneConfig } from "./config";
import { assetSource, ensureStyleOneFonts, fontFamily } from "./fonts";
import { layoutStyleOneCue, styleOneHeroFit, type PlacedFragment } from "./layout";
import { getHeroShine, getStyleOneExit } from "./motion";
import { prepareStyleOneEntries } from "./entries";
import { KineticText } from "../CaptionMotion/KineticText";
import { CueMotionContext, useCueMotion } from "../BasicCaption/cueMotion";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { chosenEntrance, gradientLine, usePartSizes } from "../Premium/parts";
import { sizeOf, type PartSizes } from "../Premium/sizes";
import { MotionWord } from "../Standard/MotionWord";

type Side = "left" | "right" | "top" | "bottom";
/**
 * Words close in from the side they sit on, so the lockup builds from all around: the top row drops in,
 * the bottom row rises, a row's first word slides in from the left and its last from the right. Text
 * tucked into a pocket of the main word comes from that pocket's open edge.
 */
const entrySides = (fragments: PlacedFragment[]) => {
  const rows = [...new Set(fragments.map(fragment => Math.round(fragment.baseline)))].sort((a, b) => a - b);
  const sides = new Map<string, Side>();
  for (const fragment of fragments) {
    const row = rows.indexOf(Math.round(fragment.baseline));
    const line = fragments.filter(other => Math.round(other.baseline) === rows[row])
      .flatMap(other => other.tokens).sort((a, b) => a.x - b.x);
    for (const token of fragment.tokens) {
      const first = line[0] === token, last = line.length > 1 && line[line.length - 1] === token;
      const edge = fragment.pocketEdge;
      sides.set(token.key, edge === "left" ? "left" : edge === "right" ? "right" : edge === "above" ? "top" : edge === "below" ? "bottom"
        : row === 0 && rows.length > 1 ? "top" : row === rows.length - 1 && rows.length > 1 ? "bottom"
        : first && line.length > 1 ? "left" : last ? "right" : "bottom");
    }
  }
  return sides;
};
/** A long, soft settle with no bounce: fast at first, then easing into place. */
const glide = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 4);
const HERO_MS = 640, HELPER_MS = 520;
/** The soft light around the words when no Design is picked; it takes the main word's color. */
const SOFT_GLOW = { radius: 9, alpha: .34 };
import demo from "./style-one.config.json";

export type StyleOneProps = { config?: unknown; fps?: number; presentationConfig?: BasicCaptionPresentation };

/** Exposed for the app/backend: inspect diagnostics before accepting a model plan. */
export const compileStyleOne = (input: unknown = demo, fps = 30) => {
  const config = resolveStyleOneConfig(input);
  const rate = clamp(finite(fps, 30), 1, 120);
  const captions = compileCaptionPlan(config.transcript, config.plan, rate, config.engine);
  return { config, captions };
};

export const getStyleOneDuration = (input: unknown = demo, fps = 30): number => {
  const rate = clamp(finite(fps, 30), 1, 120);
  const { config, captions } = compileStyleOne(input, rate);
  return Math.max(captions.durationInFrames, Math.ceil(config.durationMs * rate / 1000));
};

const useLayouts = (config: StyleOneConfig, cues: CaptionCue[], width: number, height: number, fps: number, sizes: PartSizes) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const token = useMemo(() => ({ config, cues, width, height, fps, sizes }), [config, cues, width, height, fps, sizes]);
  const [ready, setReady] = useState<{ token: typeof token; heroCap: number; placed: Map<number, PlacedFragment[]> } | null>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    // Block before paint, so a captured frame cannot race the initial measurement.
    const handle = delayRender("Loading Style One fonts and fitting caption contours");
    void ensureStyleOneFonts(config).then(() => {
      if (cancelled) return;
      // Headlines hold one size across the video, so a long word doesn't leave the next one huge.
      const heroCap = evenSizeCap(cues.map(cue => styleOneHeroFit(cue, config)));
      setReady({ token, heroCap, placed: new Map() });
      continueRender(handle);
    }).catch((error: unknown) => {
      if (!cancelled) cancelRender(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      cancelled = true;
      // Release each effect's own handle, including Strict Mode and interrupted prop edits.
      continueRender(handle);
    };
  }, [config, cues, width, height, fps, token, delayRender, continueRender, cancelRender]);
  // A cue is fitted when it is first shown, so dragging the width redoes one cue instead of the video.
  // The last layout stays up until the next is ready, so the words never blink out during a drag.
  const count = cues.length;
  return useMemo(() => {
    if (!ready || ready.token.cues.length !== count) return null;
    const { token: { config, cues, width, height, fps, sizes }, heroCap, placed } = ready;
    return (index: number) => {
      let fragments = placed.get(index);
      if (!fragments) {
        fragments = prepareStyleOneEntries(layoutStyleOneCue(cues[index], config, width, height, fps, heroCap, sizeOf(sizes, "main", cues[index].heroWords[0]?.id)),
          cues[index], config, width, height);
        placed.set(index, fragments);
      }
      return fragments;
    };
  }, [ready, count]);
};

export const StyleOne: React.FC<StyleOneProps> = ({ config: input = demo, presentationConfig }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const compiled = useMemo(() => compileStyleOne(input, fps), [input, fps]);
  const { config, captions } = compiled;
  const sizes = usePartSizes(presentationConfig);
  const layoutOf = useLayouts(config, captions.cues, width, height, fps, sizes);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (layoutOf && onLayout && captions.cues.length) onLayout(Math.max(...captions.cues.map((_, index) => layoutOf(index)).map(rows => rows.length
      ? Math.max(...rows.map(r => r.top + r.height)) - Math.min(...rows.map(r => r.top)) : 0)) + 32 * width / 720);
  }, [layoutOf, onLayout, width, captions.cues]);
  const activeIndex = getActiveCueIndex(captions.cues, frame);
  const cue = activeIndex >= 0 ? captions.cues[activeIndex] : null;
  const fragments = activeIndex >= 0 && layoutOf ? layoutOf(activeIndex) : [];
  useCueMotion(cue ? cue.startFrame * 1000 / fps : undefined, cue ? cue.endFrame * 1000 / fps : undefined);
  const motion = useContext(CueMotionContext)?.animation;
  // Colors stay out of the config, so dragging one never redoes the layout.
  const parts = presentationConfig?.parts;
  const heroGradient = parts?.main?.gradient;
  const heroColor = parts?.main?.color ?? config.theme.heroColor;
  const prefix = useId().replace(/:/g, "");
  // Helper text is brushed silver until a color is chosen for it.
  const textColor = parts?.helper?.color ?? `url(#${prefix}-silver)`;
  const { timing, theme, background, glow, shine, shadow } = config;
  const glowEnabled = glow.enabled && glow.radius > 0 && glow.opacity > 0;
  const glowRadius = glow.radius * width / 1080;
  const shadowEnabled = shadow.enabled && shadow.blur > 0 && shadow.opacity > 0;
  const shadowBlur = shadow.blur * width / 1080;
  const canvasScale = width / 1080;
  // Allow both the halo, shadow spread, and entry movement to extend past the final ink bounds.
  const largestHalo = Math.max(glowEnabled ? glow.radius : 0,
    shadowEnabled ? shadow.blur + shadow.spread : 0,
    config.inlineAccent.enabled && config.inlineAccent.glowOpacity > 0 ? config.inlineAccent.glowRadius : 0,
    shine.enabled && shine.glowOpacity > 0 ? 2.5 : 0);
  const glowPadding = Math.max(largestHalo, timing.blur) * canvasScale * 3 + 28 * canvasScale + 2;
  const sides = useMemo(() => entrySides(fragments), [fragments]);
  const reduced = presentationConfig?.reducedMotion === true;
  const now = frame * 1000 / fps;
  const glowTint = /^#[0-9a-f]{6}$/i.test(heroColor) ? heroColor : "#ffffff";
  const softGlow = `drop-shadow(0 0 ${SOFT_GLOW.radius * canvasScale}px ${glowTint}${Math.round(SOFT_GLOW.alpha * 255).toString(16).padStart(2, "0")})`;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.backgroundColor, overflow: "hidden" }}>
      {background.src ? (
        <Sequence name="Background video" premountFor={fps}>
          <OffthreadVideo
            src={assetSource(background.src)}
            muted={background.muted}
            volume={background.volume}
            trimBefore={Math.round(background.trimBeforeMs * fps / 1000)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Sequence>
      ) : null}
      <svg
        width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", filter: softGlow }}
        aria-label={cue ? cue.words.map((word) => word.text).join(" ") : undefined}
        data-readability-limited={fragments.some((fragment) => fragment.readabilityLimited) || undefined}
      >
        <defs>
          <linearGradient id={`${prefix}-silver`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".52" stopColor="#c6ccd5" />
            <stop offset="1" stopColor="#eef0f4" />
          </linearGradient>
          {heroGradient ? <linearGradient id={`${prefix}-hero-ink`} {...gradientLine(heroGradient.angle)}>
            {heroGradient.stops.map((stop, index) => <stop key={index} offset={stop.position / 100} stopColor={stop.color} />)}
          </linearGradient> : null}
          {fragments.map((fragment, index) => (
            <React.Fragment key={index}>
              {glowEnabled && fragment.role !== "hero" ? (
                <filter id={`${prefix}-glow-${activeIndex}-${index}`} filterUnits="userSpaceOnUse"
                  x={fragment.left - glowPadding} y={fragment.top - glowPadding}
                  width={fragment.width + glowPadding * 2} height={fragment.height + glowPadding * 2}
                  colorInterpolationFilters="sRGB">
                  <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius} result="bloom" />
                  <feComponentTransfer in="bloom" result="soft-bloom">
                    <feFuncA type="linear" slope={glow.opacity} />
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode in="soft-bloom" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ) : null}
              {shine.enabled && fragment.role === "hero" && shine.glowOpacity > 0 ? (
                <filter id={`${prefix}-hero-glow-${index}`} filterUnits="userSpaceOnUse"
                  x={fragment.left - glowPadding} y={fragment.top - glowPadding}
                  width={fragment.width + glowPadding * 2} height={fragment.height + glowPadding * 2}
                  colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation={2.5 * canvasScale} />
                </filter>
              ) : null}
              {fragment.role === "plain" && fragment.tokens.some((token) => token.accented) &&
              config.inlineAccent.glowOpacity > 0 ? (
                <filter id={`${prefix}-accent-glow-${index}`} filterUnits="userSpaceOnUse"
                  x={fragment.left - glowPadding} y={fragment.top - glowPadding}
                  width={fragment.width + glowPadding * 2} height={fragment.height + glowPadding * 2}
                  colorInterpolationFilters="sRGB">
                  <feGaussianBlur stdDeviation={config.inlineAccent.glowRadius * canvasScale} />
                  <feComponentTransfer>
                    <feFuncA type="linear" slope={config.inlineAccent.glowOpacity} />
                  </feComponentTransfer>
                </filter>
              ) : null}
            </React.Fragment>
          ))}
          {/* Shared shadow filter for the dark depth spread behind all text */}
          {shadowEnabled ? (
            <filter id={`${prefix}-shadow`} filterUnits="userSpaceOnUse"
              x="-50%" y="-50%" width="200%" height="200%"
              colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceAlpha" stdDeviation={shadowBlur} result="shadow-blur" />
              {shadow.spread > 0 ? (
                <>
                  <feComponentTransfer in="shadow-blur" result="shadow-spread">
                    <feFuncA type="linear" slope={1 + shadow.spread} />
                  </feComponentTransfer>
                  <feOffset in="shadow-spread" dx={shadow.offsetX * canvasScale} dy={shadow.offsetY * canvasScale} result="shadow-offset" />
                </>
              ) : (
                <feOffset in="shadow-blur" dx={shadow.offsetX * canvasScale} dy={shadow.offsetY * canvasScale} result="shadow-offset" />
              )}
              <feFlood floodColor={shadow.color} floodOpacity={shadow.opacity} result="shadow-color" />
              <feComposite in="shadow-color" in2="shadow-offset" operator="in" result="shadow-final" />
              <feMerge>
                <feMergeNode in="shadow-final" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ) : null}
        </defs>
        <g>
          {fragments.map((fragment, index) => {
            if (!cue || frame < fragment.startFrame || frame >= fragment.endFrame) return null;
            const lastStartFrame = fragment.role === "plain"
              ? fragment.tokens[fragment.tokens.length - 1].startFrame
              : Math.max(...cue.words.map((word) => word.startMs * fps / 1000));
            const exit = getStyleOneExit({ frame, endFrame: fragment.endFrame,
              lastStartFrame, fps, timing });
            const glowFilter = glowEnabled && fragment.role !== "hero"
              ? `url(#${prefix}-glow-${activeIndex}-${index})` : undefined;
            const shadowFilter = shadowEnabled
              ? `url(#${prefix}-shadow)` : undefined;
            return (
              <g key={index} opacity={1 - exit}
                transform={`translate(0 ${-exit * 3 * canvasScale})`}
                filter={shadowFilter}>
              <g filter={glowFilter}>
                  {fragment.tokens.map((token, tokenIndex) => {
                    if (frame < token.startFrame || !token.entry) return null;
                    const sheen = fragment.role === "hero" ? getHeroShine(frame, token.startFrame,
                      fragment.endFrame, fps, timing, shine) : null;
                    const shineId = `${prefix}-shine-${activeIndex}-${index}-${tokenIndex}`;
                    const band = Math.max(token.size * 0.3, token.width * 0.18);
                    const sweepX = token.x - band + (token.width + band * 2) * (sheen?.progress ?? 0);
                    const textProps: React.SVGProps<SVGTextElement> = {
                      x: token.x, y: fragment.baseline,
                      fontFamily: fontFamily(fragment.font), fontWeight: fragment.font.weight,
                      fontSize: token.size, letterSpacing: fragment.tracking * token.size,
                      dominantBaseline: "alphabetic", textAnchor: "start",
                      stroke: "none", strokeWidth: 0,
                      style: {
                        fontKerning: "normal", fontStyle: fragment.font.style ?? "normal",
                        fontVariantLigatures: "normal", fontSynthesis: "none",
                        whiteSpace: "pre", direction: "ltr",
                        textShadow: "none", stroke: "none", strokeWidth: 0,
                      },
                    };
                    const hero = fragment.role === "hero";
                    const startMs = token.startFrame * 1000 / fps;
                    // A chosen entrance replaces this slide, so the word stands ready for it.
                    const held = reduced || chosenEntrance(motion, hero, token.key);
                    const progress = held ? 1 : glide((now - startMs) / (hero ? HERO_MS : HELPER_MS));
                    // The main word glides in sideways, from the left on one caption and the right on the next,
                    // its letters drawing together as it lands. The small text closes in from its own side.
                    const side = hero ? (activeIndex % 2 ? "right" : "left") : sides.get(token.key) ?? "bottom";
                    const reach = (hero ? 70 : side === "left" || side === "right" ? 34 : 22) * canvasScale;
                    const [fromX, fromY] = side === "left" ? [-reach, 0] : side === "right" ? [reach, 0] : side === "top" ? [0, -reach] : [0, reach];
                    const spread = hero ? (1 - progress) * .09 * token.size : 0;
                    if (spread) {
                      textProps.letterSpacing = fragment.tracking * token.size + spread;
                      textProps.x = token.x - spread * (token.text.length - 1) / 2;
                    }
                    const revealProps = { text: token.text, x: Number(textProps.x), baseline: fragment.baseline, size: token.size,
                      elapsed: Infinity, available: 1, duration: 1, fps, entry: token.entry, slices: token.slices };
                    return (
                      <MotionWord key={token.key} id={token.key} startMs={startMs} size={token.size} main={hero}><g opacity={progress}
                        transform={progress < 1 ? `translate(${(1 - progress) * fromX} ${(1 - progress) * fromY})` : undefined}
                        style={{ filter: progress < 1 ? `blur(${(1 - progress) * (hero ? 7 : 5) * canvasScale}px)` : undefined }}>
                        {token.accented && config.inlineAccent.glowOpacity > 0 ? (
                          <text {...textProps} fill={heroColor} opacity={1}
                            filter={`url(#${prefix}-accent-glow-${index})`} aria-hidden="true">
                            {token.text}
                          </text>
                        ) : null}
                        {sheen && sheen.glow > 0 ? (
                          <text {...textProps} fill={heroColor} opacity={sheen.glow}
                            filter={`url(#${prefix}-hero-glow-${index})`} aria-hidden="true">{token.text}</text>
                        ) : null}
                        <KineticText {...revealProps} textProps={{ ...textProps,
                          fill: hero && heroGradient ? `url(#${prefix}-hero-ink)` : hero || token.accented ? heroColor : textColor }} />
                        {sheen && sheen.opacity > 0 ? (
                          <>
                            <defs>
                              <linearGradient id={shineId} gradientUnits="userSpaceOnUse"
                                x1={sweepX - band / 2} x2={sweepX + band / 2}
                                y1={fragment.baseline - token.size / 2}
                                y2={fragment.baseline - token.size / 2 + band * 0.35}>
                                <stop offset="0" stopColor={theme.shineColor} stopOpacity="0" />
                                <stop offset="0.5" stopColor={theme.shineColor} stopOpacity="1" />
                                <stop offset="1" stopColor={theme.shineColor} stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <KineticText {...revealProps} textProps={{ ...textProps,
                              fill: `url(#${shineId})`, opacity: sheen.opacity, "aria-hidden": true }} />
                          </>
                        ) : null}
                      </g></MotionWord>
                    );
                  })}
              </g>
              </g>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

/** Metadata and the component use the same FPS and seconds-based transcript. */
export const resolveStyleOneMetadata = ({ props }: { props: StyleOneProps }) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  return { fps, durationInFrames: getStyleOneDuration(props.config ?? demo, fps) };
};
