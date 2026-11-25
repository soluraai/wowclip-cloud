import React, { useId, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { useCueMotion } from "../BasicCaption/cueMotion";
import { clamp, finite } from "../CaptionEngine/types";
import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import { gradientLine, usePartFonts } from "../Premium/parts";
import { MotionWord } from "../Standard/MotionWord";
import {
  compileReferenceStack,
  resolveStackConfig,
  type StackSource,
} from "./engine";
import {
  layoutReferenceStack,
  stackFontFamily,
  type StackFont,
  type StackPage,
  type StackToken,
} from "./layout";
import { getReferenceCamera, getReferenceEntry } from "./motion";
import { referenceStackSource } from "./source";
import { SourceVideo } from "../SourceVideo";

export type ReferenceStackProps = {
  sourceConfig?: StackSource;
  styleConfig?: unknown;
  fps?: number;
  presentationConfig?: BasicCaptionPresentation;
};

const asset = (src: string) =>
  /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

const pendingFonts = new Map<string, Promise<void>>();
const loadFont = (font: StackFont) => {
  const key = JSON.stringify(font);
  if (!pendingFonts.has(key)) {
    const promise = (async () => {
      if (!font.src) {
        await document.fonts.load(
          `${font.style} ${font.weight} 60px ${JSON.stringify(font.family)}`,
        );
        return;
      }
      const face = new FontFace(
        stackFontFamily(font),
        `url(${JSON.stringify(asset(font.src))})`,
        { weight: String(font.weight), style: font.style },
      );
      await face.load();
      document.fonts.add(face);
    })();
    pendingFonts.set(key, promise);
    void promise.catch(() => pendingFonts.delete(key));
  }
  return pendingFonts.get(key)!;
};

export const ReferenceStack: React.FC<ReferenceStackProps> = ({
  sourceConfig = referenceStackSource,
  styleConfig,
  presentationConfig,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = (frame * 1000) / fps;
  // Spacing picked in the editor goes on top of each line role's own tracking.
  const extraTracking = presentationConfig?.tracking ?? 0;
  // Fonts picked in the editor: the main one for the serif lines, the small-text one for the plain and italic lines.
  const { faces, ready: facesReady } = usePartFonts(presentationConfig?.parts);
  const settings = useMemo(() => {
    const base = resolveStackConfig(styleConfig);
    const face = (picked: typeof faces.main, italic: boolean) => picked &&
      { family: picked.family, weight: picked.weight, style: italic || picked.italic ? "italic" as const : "normal" as const };
    const resolved = faces.main || faces.helper ? { ...base, fonts: {
      sans: face(faces.helper, false) ?? base.fonts.sans,
      italic: face(faces.helper, true) ?? base.fonts.italic,
      serif: face(faces.main, false) ?? base.fonts.serif,
    } } : base;
    if (!extraTracking) return resolved;
    return { ...resolved, roles: Object.fromEntries(Object.entries(resolved.roles).map(([name, role]) =>
      [name, { ...role, tracking: (Number.isFinite(role.tracking) ? role.tracking : -0.035) + extraTracking }])) as typeof resolved.roles };
  }, [styleConfig, extraTracking, faces]);
  const compiled = useMemo(
    () => compileReferenceStack(sourceConfig, settings),
    [sourceConfig, settings],
  );
  const stackEntry = useMemo(() => ({ ...settings.motion, variation: 0,
    rise: Math.min(settings.motion.rise, 6), blur: Math.min(settings.motion.blur, 5), scaleFrom: 1,
  }), [settings.motion]);
  const key = useMemo(
    () => ({ compiled, settings, width, height }),
    [compiled, settings, width, height],
  );
  const [loaded, setLoaded] = useState<{
    key: typeof key;
    pages: StackPage[];
    fontFallback: boolean;
  } | null>(null);

  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    if (!facesReady) return;
    let cancelled = false;
    const handle = delayRender(
      "Loading and measuring reference stack typography",
    );
    void Promise.allSettled(Object.values(settings.fonts).map(loadFont))
      .then((results) => {
        if (!cancelled) {
          setLoaded({
            key,
            pages: layoutReferenceStack(compiled.cues, settings, width, height),
            fontFallback: results.some(
              (result) => result.status === "rejected",
            ),
          });
        }
      })
      .finally(() => continueRender(handle));
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [key, compiled, settings, width, height, delayRender, continueRender, facesReady]);

  const pages = loaded?.key === key ? loaded.pages : [];
  let low = 0,
    high = pages.length - 1,
    index = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (pages[mid].startMs <= now) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const page = index >= 0 && now < pages[index].endMs ? pages[index] : null;
  useCueMotion(page?.startMs, page?.endMs);
  const reduced = presentationConfig?.reducedMotion === true;  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (onLayout && pages.length) onLayout(Math.max(...pages.map(value => value.inkBottom - value.inkTop)) + 24 * width / 720);
  }, [pages, onLayout, width]);
  const unit = width / 720;
  // A color is painted here, never through the config, so picking one keeps the layout as it is.
  const main = presentationConfig?.parts?.main;
  const picked = main?.gradient?.stops[0]?.color ?? main?.color;
  const glowColor = picked ?? settings.glow.color;
  const id = useId().replace(/:/g, "");
  const inkId = `reference-ink-${id}`;
  const glowRadius = clamp(finite(settings.glow.radius, 6), 0, 18) * unit;
  const textGlows = Object.entries(settings.roles).map(([role, config]) => ({
    role,
    id: `reference-glow-${id}-${role}`,
    opacity: settings.glow.enabled ? clamp(finite(settings.glow.opacity, .32), 0, 1) *
      clamp(finite(settings.glow.roles?.[role as keyof typeof settings.roles],
        config.font === "serif" || config.font === "italic" ? 1 : 0), 0, 1) : 0,
  }));

  const lines = useMemo(() => {
    if (!page) return [];
    const map = new Map<number, StackToken[]>();
    for (const token of page.tokens) {
      const row = token.lineIndex ?? 0;
      const list = map.get(row) ?? [];
      list.push(token);
      map.set(row, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([lineIndex, tokens]) => ({ lineIndex, tokens }));
  }, [page]);

  const elapsed = page ? now - page.startMs : 0;
  const settle = clamp(
    elapsed / Math.max(1, finite(settings.motion.settleMs, 1100)),
    0,
    1,
  );
  const drift = reduced ? 0 : settle * settle * (3 - 2 * settle);
  const scale =
    1 +
    (clamp(finite(settings.motion.settleScale, 0.955), 0.85, 1) - 1) *
      (page?.depthEnabled ? 0 : drift);
  const lastStart = page
    ? Math.max(...page.words.map((word) => word.startMs))
    : 0;
  // Pages release with an eased dissolve plus a continued drift so cue
  // boundaries keep the flow going instead of blinking out.
  const exitMs = page
    ? Math.min(
        settings.motion.exitMs,
        Math.max(0, page.endMs - lastStart) * 0.35,
      )
    : 0;
  const exitRemaining =
    !reduced && page && exitMs > 0
      ? clamp((page.endMs - now) / exitMs, 0, 1)
      : 1;
  const exitRelease =
    1 - exitRemaining * exitRemaining * (3 - 2 * exitRemaining);
  const exitScale = 1 - 0.004 * exitRelease;
  const exitRise = 2.4 * unit * exitRelease;
  const camera = !reduced && page?.depthEnabled ? getReferenceCamera({
    now,
    lineStarts: lines.map(line => Math.min(...line.tokens.map(token => token.startMs))),
    pageEndMs: page.endMs,
    depth: settings.depth,
  }) : null;
  const cameraY = page ? (page.inkTop + page.inkBottom) / 2 : 0;
  const previewShift = onLayout && page ? height / 2 - cameraY : 0;
  // An exponential soft cap lets the camera lift decelerate toward the safe
  // area instead of stopping dead at a hard boundary.
  const softCap = (value: number, cap: number) =>
    cap <= 0
      ? 0
      : cap * (1 - Math.exp(-Math.max(0, value) / cap));
  const cameraLift = page && camera
    ? softCap(
        camera.lift * unit,
        Math.max(0, page.inkTop - height * settings.layout.safeMargin - 2 * unit),
      )
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "#000000" }}>
      {sourceConfig.background?.src ? (
        <SourceVideo
          src={asset(sourceConfig.background.src)}
          muted={sourceConfig.background.muted ?? false}
          volume={sourceConfig.background.volume ?? 1}
          style={{
            width: "100%",
            height: "100%",
            objectFit:
              settings.background.objectFit === "contain" ? "contain" : "cover",
          }}
        />
      ) : null}

      <svg width={0} height={0} aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          {textGlows.filter(glow => glow.opacity > 0 && glowRadius > 0).map(glow => (
            <filter key={glow.id} id={glow.id} x="-60%" y="-150%" width="220%" height="400%" colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceAlpha" stdDeviation={glowRadius} result="soft" />
              <feFlood floodColor={glowColor} floodOpacity={glow.opacity} />
              <feComposite in2="soft" operator="in" result="halo" />
              <feGaussianBlur in="SourceAlpha" stdDeviation={glowRadius * .3} result="tight" />
              <feFlood floodColor={glowColor} floodOpacity={glow.opacity * .65} />
              <feComposite in2="tight" operator="in" result="innerHalo" />
              <feMerge><feMergeNode in="halo" /><feMergeNode in="innerHalo" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
          <linearGradient id={inkId} {...(main?.gradient ? gradientLine(main.gradient.angle) : { x1: 0, y1: 0, x2: 0, y2: 1 })}>
            {main?.gradient ? main.gradient.stops.map((stop, at) => <stop key={at} offset={stop.position / 100} stopColor={stop.color} />) : <>
              <stop offset="0%" stopColor={picked ?? settings.ink.top} />
              <stop offset="43%" stopColor={picked ?? settings.ink.middle} />
              <stop offset="100%" stopColor={picked ?? settings.ink.bottom} />
            </>}
          </linearGradient>
        </defs>
      </svg>

      <div
        style={{ position: "absolute", inset: 0, opacity: 1 - exitRelease, transformOrigin: `${page?.centerX ?? 0}px ${page?.baseline ?? 0}px`,
          transform: page ? `translateY(${previewShift - settings.motion.settleLift * unit * (page.depthEnabled ? 0 : drift) - exitRise}px) scale(${scale * exitScale})` : undefined }}
        aria-label={page?.words.map((word) => word.text).join(" ")}
        data-font-fallback={loaded?.fontFallback || undefined}
        data-readability-limited={page?.readabilityLimited || undefined}
      >
        {page ? (
            <div data-reference-camera="" style={{ position: "absolute", inset: 0, transform: `translateY(${-cameraLift}px)` }}>
            {lines.map(({ lineIndex, tokens }, lineNumber) => {
              const nextLine = lines[lineNumber + 1];
              const nextStart = nextLine
                ? Math.min(...nextLine.tokens.map((token) => token.startMs))
                : Infinity;
              // Whole-line arrival choreography; flat cues stay word-driven.
              const arrival = camera?.lines[lineNumber] ?? null;
              const lineLift = (arrival?.lift ?? 0) * unit;
              const arrivalRise = (arrival?.rise ?? 0) * unit;
              const arrivalOpacity = arrival?.opacity ?? 1;
              const arrivalBlur = arrival?.blur ?? 0;
              const lineY = tokens[0]?.y ?? page.baseline;
              // The line's layer spans only its own band, with room for rise, glow and shadow, so its
              // filters run over that band instead of the whole frame. Same picture, far less to paint.
              const bandPad = 48 * unit;
              const bandTop = Math.floor(Math.min(...tokens.map((token) => token.y - token.size * 1.6)) - bandPad);
              const bandHeight = Math.ceil(Math.max(...tokens.map((token) => token.y + token.size * 0.9)) + bandPad) - bandTop;
              const focusProgress = settings.focus.enabled
                ? clamp(
                    (now -
                      nextStart -
                      clamp(
                        finite(settings.focus.handoffDelayMs, 80),
                        0,
                        250,
                      )) /
                      Math.max(1, finite(settings.focus.transitionMs, 500)),
                    0,
                    1,
                  )
                : 0;
              const focusEase =
                focusProgress *
                focusProgress *
                focusProgress *
                (focusProgress * (focusProgress * 6 - 15) + 10);
              const lineOpacity =
                1 -
                (1 -
                  clamp(
                    finite(settings.focus.previousLineOpacity, 0.72),
                    0.55,
                    1,
                  )) *
                  focusEase;
              const firstStart = Math.min(
                ...tokens.map((token) => token.startMs),
              );
              const glowProgress = clamp(
                (now - firstStart) /
                  Math.max(1, finite(settings.focus.arrivalGlowMs, 800)),
                0,
                1,
              );
              const glowPulse = settings.focus.enabled
                ? Math.sin(Math.PI * glowProgress) * (1 - focusEase)
                : 0;
              const shadowEase = arrival
                ? arrival.arrival
                : settings.depth.enabled
                  ? clamp((now - firstStart + 1000 / fps) / 240, 0, 1)
                  : 0;
              const shadowAlpha =
                clamp(finite(settings.depth.shadowOpacity, 0.82), 0, 0.95) *
                shadowEase * (page.depthEnabled && lineNumber > 0 ? 1 : 0.35);
              const perspective = clamp(finite(settings.depth.perspective, 1100), 500, 2000) * unit;
              const lightAlpha =
                clamp(
                  finite(settings.depth.shadowLightOpacity, 0.07),
                  0,
                  0.25,
                ) *
                  shadowEase +
                clamp(
                  finite(settings.focus.arrivalGlowOpacity, 0.1),
                  0,
                  0.25,
                ) *
                  glowPulse;
              const shadow =
                [
                  shadowAlpha > 0
                    ? `drop-shadow(0px ${-clamp(finite(settings.depth.shadowRisePx, 5), 0, 10) * unit}px ${clamp(finite(settings.depth.shadowBlurPx, 6), 0, 12) * unit}px rgba(0, 0, 0, ${(shadowAlpha * 0.85).toFixed(3)}))`
                    : "",
                  shadowAlpha > 0
                    ? `drop-shadow(0px ${-1.8 * unit}px ${1.1 * unit}px rgba(0, 0, 0, ${shadowAlpha.toFixed(3)}))`
                    : "",
                  lightAlpha > 0
                    ? `drop-shadow(0px ${0.8 * unit}px ${2.8 * unit}px rgba(255, 255, 255, ${lightAlpha.toFixed(3)}))`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined;
              const lineFilter =
                [
                  shadow ?? "",
                  arrivalBlur > 0.06 ? `blur(${arrivalBlur.toFixed(2)}px)` : "",
                ]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || undefined;
              return (
                <div
                  key={lineIndex}
                  data-line-index={lineIndex}
                  // A real 3D layer around its own baseline, so depth never changes how lines overlap.
                  style={{ position: "absolute", left: 0, width, top: bandTop, height: bandHeight, opacity: lineOpacity * arrivalOpacity,
                    willChange: arrival ? "transform, opacity" : undefined, transformOrigin: `${page.centerX}px ${lineY - bandTop}px`,
                    transform: arrival ? `perspective(${perspective}px) translate3d(0, ${arrivalRise - lineLift}px, ${arrival.z * unit}px) rotateX(${arrival.tilt}deg)` : undefined }}
                >
                  {/* Shadows and blur go on the flat SVG inside the 3D layer, not on the layer itself: same picture,
                      but Chrome no longer re-filters the transformed layer every frame (about 7x faster on swiftshader). */}
                  <svg width={width} height={bandHeight} viewBox={`0 ${bandTop} ${width} ${bandHeight}`}
                    style={{ position: "absolute", inset: 0, overflow: "visible", textRendering: "geometricPrecision", filter: lineFilter }}>
                  {tokens.map((token, tokenIndex) => (
                    <MotionWord key={token.wordId} id={token.wordId} startMs={token.startMs} size={token.size}>
                    <g data-word-id={token.wordId}>
                      {token.glyphs.map((glyph, i) => {
                        const entry = reduced ? now < token.startMs ? null : { opacity: 1, x: 0, y: 0, blur: 0, scale: 1 } : getReferenceEntry({
                          now,
                          startMs: token.startMs,
                          endMs: token.endMs,
                          pageEndMs: page.endMs,
                          glyphOffset: glyph.offset,
                          fps,
                          size: token.size,
                          unit,
                          role: token.role,
                          seed: `${sourceConfig.designSeed ?? "reference-stack"}:${page.startMs}:${token.wordId}`,
                          lineSeed: `${sourceConfig.designSeed ?? "reference-stack"}:${page.startMs}:${token.lineIndex}`,
                          motion: page.depthEnabled ? stackEntry : settings.motion,
                          lineReveal: page.depthEnabled === true,
                          characterReveal: token.character,
                        });
                        if (!entry) return null;
                        const x = token.x + glyph.x;
                        const y = token.y;
                        const glyphId = `${id}-glyph-${lineIndex}-${tokenIndex}-${i}`;
                        const blurAmount =
                          entry.blur > 0.06 ? entry.blur.toFixed(2) : null;
                        const filterStyle = blurAmount
                          ? `blur(${blurAmount}px)`
                          : undefined;
                        const glow = textGlows.find(value => value.role === token.role);

                        return (
                          <g
                            key={i}
                            opacity={entry.opacity}
                            transform={`translate(${x + entry.x} ${y + entry.y}) scale(${entry.scale * token.scaleX} ${entry.scale * token.scaleY}) translate(${-x} ${-y})`}
                            style={{
                              filter: filterStyle,
                            }}
                          >
                            <text
                              id={glyphId}
                              x={x}
                              y={y}
                              fill={`url(#${inkId})`}
                              stroke="none"
                              filter={glow && glow.opacity > 0 && glowRadius > 0 ? `url(#${glow.id})` : undefined}
                              fontFamily={`${JSON.stringify(stackFontFamily(token.font))}, "${token.font.family}", Arial, sans-serif`}
                              fontWeight={token.font.weight}
                              fontStyle={token.font.style}
                              fontSize={token.size}
                              letterSpacing={
                                token.character ? 0 : `${token.tracking}em`
                              }
                              style={{
                                whiteSpace: "pre",
                                fontSynthesis: "none",
                              }}
                            >
                              {glyph.text}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                    </MotionWord>
                  ))}
                  </svg>
                </div>
              );
            })}
            </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const resolveReferenceStackMetadata = ({
  props,
}: {
  props: ReferenceStackProps;
}) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  const compiled = compileReferenceStack(
    props.sourceConfig ?? referenceStackSource,
    resolveStackConfig(props.styleConfig),
  );
  return {
    fps,
    durationInFrames: Math.max(
      1,
      Math.ceil((compiled.durationMs * fps) / 1000),
    ),
  };
};
