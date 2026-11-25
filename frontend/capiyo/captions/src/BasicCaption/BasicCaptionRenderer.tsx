/// <reference lib="es2022.intl" />
import React, { Fragment, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { letterPieces } from "../Script/scripts";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
  interpolate,
} from "remotion";
import { getActiveCueIndex } from "../CaptionEngine/compilePlan";
import { clamp } from "../CaptionEngine/types";
import { compileBasicCaption } from "./engine";
import defaults from "./basic-caption.config.json";
import type { BasicCaptionSource } from "./source";
import { resolveBasicCaptionConfig } from "./config";
import { captionFontFamily, loadCaptionFont } from "./fonts";
import type { BasicEffect, BasicReveal } from "../Basic/catalog";
import { captionFrame, poseOf, type CaptionAnimation } from "./motion";
import { SettledMotionContext } from "./cueMotion";
import {
  resolveWordPresentation,
  textEffectFilter,
  type Gradient,
  type Highlight,
  type BasicWordPresentation,
} from "./wordPresentation";
import { SourceVideo } from "../SourceVideo";

export type { BasicWordPresentation } from "./wordPresentation";
/** Whole-caption text effects in the renderer's 1080px typography units; colors are CSS colors (alpha allowed). */
export type BasicTextEffects = {
  opacity?: number;
  blend?: string;
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; x: number; y: number };
  glow?: { color: string; blur: number };
  /** Solid extrusion; angle 0° = right, 90° = down. */
  depth?: { color: string; length: number; angle: number };
};
export type BasicCaptionPresentation = {
  textEffects?: BasicTextEffects;
  /** Key-word look for styles built around one word (Script Accent, Creator Emoji). */
  emphasis?: { enabled: boolean; color: string; scale: number; font?: string; mode?: string;
    colorMode?: "solid" | "gradient"; gradientStops?: { color: string; position: number }[]; gradientAngle?: number;
    /** The drawn shape's (marker, ring) own gradient, in place of its one color. */
    shapeColorMode?: "solid" | "gradient"; shapeGradientStops?: { color: string; position: number }[]; shapeGradientAngle?: number };
  /** Chosen motion; undefined keeps the style's own. */
  animation?: CaptionAnimation;
  /** Fonts and colors picked for a Premium style's text parts. */
  parts?: import("../Premium/parts").PremiumParts;
  /** Design picked for one kind of text: key words or main line, the rest, and plain lines. */
  roleEffects?: { main?: BasicTextEffects; rest?: BasicTextEffects; plain?: BasicTextEffects };
  /** Design for every word that isn't a key word. */
  restEffects?: BasicTextEffects;
  /** Focus Frame's box: its fill, frame, corners, handles and how fast it draws on. */
  box?: {
    color?: string; gradient?: { stops: { color: string; position: number }[]; angle: number };
    opacity?: number; frameWidth?: number; radius?: number; padding?: number; handles?: boolean; glow?: number; drawMs?: number;
  };
  /** Colors picked for key words (main) and the rest, painted on any word the style draws itself. */
  paints?: import("./cueMotion").RolePaints;
  /** The kinds of text the shared layer paints, for a style that doesn't read paints itself. */
  paintWords?: ("main" | "rest")[];
  /** Style-specific on/off options, such as Creator Emoji's stickers. */
  features?: Record<string, boolean>;
  /** AI-picked emoji per word id (Creator Emoji). */
  emojis?: Record<string, string>;
  shadow?: number;
  motion?: "none" | "fade" | "pop";
  motionDurationMs?: number;
  wordColors?: Record<string, string>;
  centerAnchor?: boolean;
  activeWord?: boolean;
  underlineActive?: boolean;
  stacked?: boolean;
  basicEffect?: BasicEffect;
  reveal?: BasicReveal;
  /** Bigger key words push the rest of the line aside (on), or grow over their neighbours (off). */
  autoFit?: boolean;
  stroke?: number;
  strokeColor?: string;
  plate?: boolean;
  plateColor?: string;
  backgroundColor?: string;
  /** Preview-only cap height, in 1080px typography units; preserves font-specific proportions. */
  opticalHeight?: number;
  onLayout?: (height: number) => void;
  /** Premium: extra space between letters, as a share of each word's own size (Spacing in the editor). */
  tracking?: number;
  reducedMotion?: boolean;
  /** When words really start, for a caption that shows all of them at once. */
  spokenMs?: Record<string, number>;
  highlights?: Highlight & { enabled: boolean };
  wordStyles?: Record<string, BasicWordPresentation>;
  gradient?: Gradient;
  fallbackFonts?: {
    src: string;
    family: string;
    weight: number;
    italic: boolean;
  }[];
};

export type BasicCaptionRendererProps = {
  sourceConfig: BasicCaptionSource;
  styleConfig?: unknown;
  presentationConfig?: BasicCaptionPresentation;
};

const asset = (src: string) =>
  /^(https?:|data:|blob:)/i.test(src) || src.startsWith("/")
    ? src
    : staticFile(src);

export const BasicCaptionRenderer: React.FC<BasicCaptionRendererProps> = ({
  sourceConfig,
  styleConfig = defaults,
  presentationConfig,
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const blockRef = useRef<HTMLDivElement>(null);
  const [loadedFont, setLoadedFont] = useState("");
  const [geometry, setGeometry] = useState<{ cueId: string; words: { x: number; y: number; width: number; height: number }[] } | null>(null);
  const settings = useMemo(
    () => resolveBasicCaptionConfig(styleConfig),
    [styleConfig],
  );
  // Typography changes must not recompile the transcript or its cue timings.
  const planKey = useMemo(
    () =>
      JSON.stringify({
        phrasing: settings.phrasing,
        content: settings.content,
      }),
    [settings],
  );
  const compiled = useMemo(
    () => compileBasicCaption(sourceConfig, fps, JSON.parse(planKey)),
    [sourceConfig, fps, planKey],
  );
  const { font, layout, content } = settings;
  const family = captionFontFamily(
    font.src ? asset(font.src) : "",
    font.family,
    font.weight,
    font.italic,
  );
  const fallbackKey = JSON.stringify(presentationConfig?.fallbackFonts ?? []);
  const fallbackFonts = useMemo(
    () =>
      JSON.parse(fallbackKey) as NonNullable<
        BasicCaptionPresentation["fallbackFonts"]
      >,
    [fallbackKey],
  );
  const { delayRender, continueRender } = useDelayRender();
  const extraFontKey = useMemo(
    () =>
      JSON.stringify(
        [
          ...new Map(
            Object.values(presentationConfig?.wordStyles ?? {}).flatMap(
              (word) =>
                word.font?.src
                  ? [
                      [
                        JSON.stringify([
                          word.font.src,
                          word.font.family,
                          word.font.weight,
                          word.font.italic,
                        ]),
                        word.font,
                      ] as const,
                    ]
                  : [],
            ),
          ).values(),
        ].map((face) => ({
          src: face.src,
          family: face.family,
          weight: face.weight,
          italic: face.italic,
        })),
      ),
    [presentationConfig?.wordStyles],
  );
  const extraFonts = useMemo(
    () =>
      JSON.parse(extraFontKey) as {
        src: string;
        family: string;
        weight: number;
        italic: boolean;
      }[],
    [extraFontKey],
  );
  useLayoutEffect(() => {
    if (!font.src && !fallbackFonts.length && !extraFonts.length) return;
    const handle = delayRender("Loading the basic caption font");
    let cancelled = false;
    void Promise.all([
      loadCaptionFont(
        font.src ? asset(font.src) : "",
        font.family,
        font.weight,
        font.italic,
      ),
      ...fallbackFonts.map((face) =>
        loadCaptionFont(asset(face.src), face.family, face.weight, face.italic),
      ),
      ...extraFonts.map((face) =>
        loadCaptionFont(asset(face.src), face.family, face.weight, face.italic),
      ),
    ])
      .catch(() => {
        console.warn(
          "Basic caption font unavailable; using the system fallback.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadedFont(family);
        continueRender(handle);
      });
    return () => { cancelled = true; continueRender(handle); };
  }, [
    family,
    font.src,
    font.weight,
    font.italic,
    font.family,
    fallbackFonts,
    extraFonts,
    delayRender,
    continueRender,
  ]);

  const index = getActiveCueIndex(compiled.captions.cues, frame);
  const cue = index >= 0 ? compiled.captions.cues[index] : null;
  const lineBreaks = useMemo(
    () => new Set(content.lineBreakAfterWordIds),
    [content.lineBreakAfterWordIds],
  );
  const progress = interpolate(
    frame - (cue?.startFrame ?? frame),
    [
      0,
      Math.max(1, ((presentationConfig?.motionDurationMs ?? 160) * fps) / 1000),
    ],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const settled = useContext(SettledMotionContext);
  const chosenMotion = presentationConfig?.reducedMotion ? undefined : presentationConfig?.animation;
  const animation = settled ? undefined : chosenMotion;
  // A chosen entrance replaces the style's own fade or pop.
  const motion = animation?.in || settled ? "none" : (presentationConfig?.motion ?? "none");
  const shadow = clamp(presentationConfig?.shadow ?? 0, 0, 100);
  const centerAnchor = presentationConfig?.centerAnchor === true;
  const unit = width / 1080;
  const fx = presentationConfig?.textEffects;
  const fxFilter = textEffectFilter(fx, unit);
  // One word's effects can't sit under the block's, so such a caption paints them word by word.
  const wordFx = cue?.words.some((word) => presentationConfig?.wordStyles?.[word.id]?.effects);
  const opticalHeight = presentationConfig?.opticalHeight;
  const fontSize = useMemo(() => {
    if (!opticalHeight || typeof document === "undefined" || (font.src && loadedFont !== family)) return font.size * unit;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return font.size * unit;
    context.font = `${font.italic ? "italic " : ""}${font.weight} 100px ${JSON.stringify(family)}, sans-serif`;
    const cap = context.measureText("H").actualBoundingBoxAscent || 72;
    return opticalHeight * unit * 100 / Math.max(40, cap);
  }, [opticalHeight, unit, font.size, font.src, font.italic, font.weight, family, loadedFont]);
  const effect = presentationConfig?.basicEffect ?? "plain";
  const reducedMotion = presentationConfig?.reducedMotion === true;
  const now = frame * 1000 / fps;
  const blockMotion = animation && cue
    ? captionFrame(animation, now, cue.startFrame * 1000 / fps, cue.endFrame * 1000 / fps)
    : undefined;
  const marginX = width * layout.safeMargin;
  const marginY = height * layout.safeMargin;
  // Centered captions may reach the frame edge; only edge-anchored ones keep the margin.
  const blockWidth = centerAnchor ? width * layout.maxWidth : Math.min(width * layout.maxWidth, width - marginX * 2);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    const block = blockRef.current;
    if (!block || !cue) return;
    const measure = () => {
      const words = Array.from(block.querySelectorAll<HTMLElement>("[data-word-id]")).map((node) => ({
        x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight,
      }));
      const next = { cueId: cue.id, words };
      setGeometry((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      if (!font.src || loadedFont === family)
        onLayout?.(block.offsetHeight + fontSize * (presentationConfig?.plate ? 0.4 : effect === "pop" || effect === "underline" ? 0.3 : 0.18));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(block);
    return () => observer.disconnect();
  }, [cue, blockWidth, family, loadedFont, fontSize, font, effect, onLayout, presentationConfig?.wordStyles, presentationConfig?.plate]);

  let activeIndex = 0;
  if (cue) for (let i = cue.words.length - 1; i >= 0; i--) {
    if (now >= cue.words[i].startMs) { activeIndex = i; break; }
  }
  const targetRect = geometry?.cueId === cue?.id ? geometry?.words[activeIndex] : undefined;
  const previousRect = targetRect && activeIndex > 0 ? geometry?.words[activeIndex - 1] : undefined;
  const pillProgress = reducedMotion ? 1 : clamp((now - (cue?.words[activeIndex]?.startMs ?? now)) / 170, 0, 1);
  const easedPill = 1 - (1 - pillProgress) ** 3;
  const motionOf = (word: NonNullable<typeof cue>["words"][number]) => {
    if (!chosenMotion || !cue) return undefined;
    const rows = geometry?.cueId === cue.id ? geometry.words : [];
    return poseOf(chosenMotion, now, cue.words, cue.words.indexOf(word), settled, (index) => rows[index], presentationConfig?.wordStyles?.[word.id]?.emphasized, cue.endFrame * 1000 / fps);
  };
  // The box glides over from the last word on the same line; on a phrase's first word or a new line it grows
  // out of the word's left edge instead of popping in.
  const sameLine = previousRect && targetRect && Math.abs(previousRect.y - targetRect.y) < 2;
  const pillStart = sameLine ? previousRect : targetRect && { ...targetRect, width: Math.min(targetRect.width, targetRect.height * 0.5) };
  const pillOpacity = sameLine ? 1 : clamp(pillProgress * 2.5, 0, 1);
  const pillWord = cue?.words[activeIndex];
  const pillEdit = pillWord ? presentationConfig?.wordStyles?.[pillWord.id] : undefined;
  const showPill = effect === "pill" && targetRect && pillStart && presentationConfig?.highlights?.enabled !== false && pillEdit?.highlighted !== false;
  const background = sourceConfig.background;
  const makeGradientStyle = (
    gradient: Gradient | null | undefined,
  ): React.CSSProperties | undefined =>
    gradient
      ? {
          backgroundImage: `linear-gradient(${gradient.angle}deg, ${[
            ...gradient.stops,
          ]
            .sort((a, b) => a.position - b.position)
            .map((stop) => `${stop.color} ${stop.position}%`)
            .join(", ")})`,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
          display: "inline-block",
        }
      : undefined;

  const paintWord = (word: NonNullable<typeof cue>["words"][number]) => {
    const edit = presentationConfig?.wordStyles?.[word.id];
    const wordFont = edit?.font;
    const { highlighted, appearance, gradient, color } =
      resolveWordPresentation({
        frame,
        fps,
        startMs: word.startMs,
        endMs: word.endMs,
        activeWord: presentationConfig?.activeWord,
        highlights: presentationConfig?.highlights,
        edit,
        gradient: presentationConfig?.gradient,
        color: font.color,
        legacyColor: presentationConfig?.wordColors?.[word.id],
      });
    const gradientStyle = makeGradientStyle(gradient);
    const spoken = now >= word.startMs && now < word.endMs;
    const wordProgress = clamp((now - word.startMs) / Math.max(1, word.endMs - word.startMs), 0, 1);
    const reveal = presentationConfig?.reveal ?? "phrase";
    const letters = letterPieces(word.text);
    const visibleLetters = now < word.startMs ? 0 : Math.max(1, Math.ceil(wordProgress * letters.length));
    const keyScale = highlighted && appearance ? appearance.scale : 1;
    // Auto adjust draws a bigger word as a real font size, so the words beside it move over instead of
    // being covered. A word that grows only while spoken eases in and out, so the line slides, not jumps.
    const autoFit = presentationConfig?.autoFit !== false;
    const spokenOnly = !edit?.emphasized && edit?.highlighted !== true && presentationConfig?.activeWord === true
      && presentationConfig?.highlights?.enabled !== false && edit?.highlighted !== false;
    const glideScale = appearance?.scale ?? 1;
    const glide = (t: number) => { const p = clamp(t, 0, 1); return p * p * (3 - 2 * p); };
    const fitScale = !autoFit ? 1
      : spokenOnly && glideScale !== 1 && !reducedMotion
        ? 1 + (glideScale - 1) * glide((now - word.startMs) / 140) * glide((word.endMs + 140 - now) / 140)
        : keyScale;
    const manualScale = autoFit ? 1 : keyScale;
    const glowEnabled = effect === "glow" && presentationConfig?.highlights?.enabled !== false;
    // Soft Glow: a key word keeps a soft colored glow, then flares while it is spoken.
    const keyGlow = effect === "glow" && edit?.emphasized === true;
    const sweepEnabled = effect === "sweep" && !gradient && !edit?.overrideColor && !edit?.emphasized && !presentationConfig?.wordColors?.[word.id]
      && presentationConfig?.highlights?.enabled !== false;
    const popScale = effect === "pop" && spoken && highlighted && !reducedMotion
      // A light bump: the spoken word swells ~4% and lifts a hair, then eases back; long words never reach their neighbours.
      ? Math.sin(Math.PI * clamp((now - word.startMs) / 280, 0, 1)) ** 2 : 0;
    const wordMotion = motionOf(word);
    const ownFx = edit?.effects ?? fx;
    const fillBox = (effect !== "pill" || (edit?.emphasized === true && word.id !== pillWord?.id)) && highlighted && appearance?.mode === "fill";
    const glyphs =
      gradient?.scope === "character" || reveal === "characters"
        ? letters.map((letter, i) => (
            <span key={i} style={{
              ...(gradient?.scope === "character" ? gradientStyle : {}),
              opacity: reveal === "characters" && !reducedMotion && i >= visibleLetters ? 0 : 1,
            }}>
              {letter}
            </span>
          ))
        : word.text;
    return (
      <span
        data-word-id={word.id}
        data-highlighted={highlighted || undefined}
        data-spoken={spoken || undefined}
        style={{
          ...(wordFont
            ? {
                fontFamily: [
                  JSON.stringify(
                    captionFontFamily(
                      wordFont.src ? asset(wordFont.src) : "",
                      wordFont.family,
                      wordFont.weight,
                      wordFont.italic,
                    ),
                  ),
                  ...fallbackFonts.map((face) =>
                    JSON.stringify(
                      captionFontFamily(
                        asset(face.src),
                        face.family,
                        face.weight,
                        face.italic,
                      ),
                    ),
                  ),
                  '"Inter"',
                  "Arial",
                  "sans-serif",
                ].join(", "),
                fontSize: wordFont.size * unit,
                fontWeight: wordFont.weight,
                fontStyle: wordFont.italic ? "italic" : "normal",
                letterSpacing: wordFont.letterSpacing * unit,
                lineHeight: wordFont.lineHeight,
              }
            : {}),
          ...(edit?.textCase ? { textTransform: (edit.textCase === "preserve" ? "none" : edit.textCase) as React.CSSProperties["textTransform"] } : {}),
          ...(fitScale !== 1 ? { fontSize: wordFont ? wordFont.size * unit * fitScale : `${fitScale}em` } : {}),
          display: "inline-block",
          position: "relative",
          zIndex: 1,
          visibility: edit?.blendPass,
          borderRadius: ".16em",
          // Side padding only where a box sits behind the word; plain words keep the font's normal gap.
          // Pop words swell a little, so they keep a small gap to not touch their neighbours.
          padding: effect === "pill" || fillBox ? "0 .06em" : effect === "pop" ? "0 .04em" : undefined,
          backgroundColor: fillBox ? appearance?.backgroundColor : undefined,
          transform: [wordMotion?.transform, popScale ? `translateY(${(-0.05 * popScale).toFixed(4)}em)` : "",
            manualScale * (1 + 0.04 * popScale) !== 1 ? `scale(${manualScale * (1 + 0.04 * popScale)})` : ""].filter(Boolean).join(" ") || undefined,
          filter: [wordFx ? textEffectFilter(ownFx, unit) : undefined, wordMotion?.filter].filter(Boolean).join(" ") || undefined,
          clipPath: wordMotion?.clipPath,
          opacity: (wordFx ? ownFx?.opacity ?? 1 : 1) * (wordMotion?.opacity ?? 1) * (!reducedMotion && reveal === "words" && now < word.startMs ? 0
            : keyGlow ? spoken ? 1 : 0.8
            : glowEnabled ? highlighted ? 1 : now >= word.endMs ? 0.7 : 0.43 : 1),
          textShadow:
            edit?.shadow !== undefined
              ? edit.shadow
                ? `0 ${8 * unit}px ${(8 + edit.shadow * 0.4) * unit}px rgba(0,0,0,${edit.shadow / 100})`
                : "none"
              : keyGlow
                ? spoken ? `0 0 .18em ${color}, 0 0 .7em ${color}` : `0 0 .16em ${color}`
                : glowEnabled && highlighted ? "0 0 .24em rgba(255,255,255,.42)" : undefined,
        }}
      >
        <span style={{
          ...(gradient?.scope === "word" ? gradientStyle : { color: sweepEnabled ? font.color : color }),
          position: "relative",
          display: "inline-block",
          // Stroke is centered on the glyph edge and drawn under the fill, so double it to show the full width outside.
          WebkitTextStroke: ownFx?.stroke
            ? `${ownFx.stroke.width * 2 * unit}px ${ownFx.stroke.color}`
            : !edit?.effects && presentationConfig?.stroke ? `${presentationConfig.stroke}em ${presentationConfig.strokeColor ?? "#101014"}` : undefined,
          strokeLinejoin: ownFx?.stroke ? "round" : undefined,
          paintOrder: "stroke fill",
          textDecorationLine: presentationConfig?.underlineActive && highlighted ? "underline" : undefined,
          textDecorationColor: presentationConfig?.underlineActive && highlighted ? appearance?.color : undefined,
          textDecorationThickness: presentationConfig?.underlineActive && highlighted ? ".09em" : undefined,
          textUnderlineOffset: presentationConfig?.underlineActive && highlighted ? ".13em" : undefined,
        }}>
          {glyphs}
          {sweepEnabled && edit?.highlighted !== false ? (
            <span aria-hidden="true" data-caption-sweep style={{
              position: "absolute", inset: 0,
              color: appearance?.color ?? "#78edee",
              clipPath: `inset(0 ${(1 - wordProgress) * 100}% 0 0)`,
            }}>{glyphs}</span>
          ) : null}
        </span>
      </span>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "#000000" }}>
      {background?.src ? (
        <SourceVideo
          src={asset(background.src)}
          muted={background.muted ?? false}
          volume={background.volume ?? 1}
          style={{
            width: "100%",
            height: "100%",
            objectFit: background.objectFit ?? "contain",
          }}
        />
      ) : null}
      {cue ? (
        <div
          ref={blockRef}
          data-basic-caption={cue.id}
          data-basic-effect={effect}
          style={{
            position: "absolute",
            left: centerAnchor
              ? width * layout.positionX
              : marginX + (width - marginX * 2 - blockWidth) * layout.positionX,
            top: centerAnchor
              ? height * layout.positionY
              : marginY + (height - marginY * 2) * layout.positionY,
            // Anchored at the same fraction it sits at across the frame, so left and right positions keep the
            // whole caption on screen (left edge at 0%, centered at 50%, right edge at 100%).
            transform: `${centerAnchor ? "translate(-50%, -50%)" : `translateY(-${layout.positionY * 100}%)`}${layout.rotation ? ` rotate(${layout.rotation}deg)` : ""}${motion === "pop" && !reducedMotion ? ` scale(${0.9 + progress * 0.1})` : ""} ${blockMotion?.transform ?? ""}`.trim(),
            opacity: (motion === "none" || reducedMotion ? 1 : progress) * (wordFx ? 1 : fx?.opacity ?? 1) * (blockMotion?.opacity ?? 1),
            mixBlendMode: fx?.blend && fx.blend !== "normal" ? (fx.blend as React.CSSProperties["mixBlendMode"]) : undefined,
            filter: [wordFx ? undefined : fxFilter, blockMotion?.filter].filter(Boolean).join(" ") || undefined,
            clipPath: blockMotion?.clipPath,
            isolation: "isolate",
            textShadow: shadow
              ? `0 ${8 * unit}px ${(8 + shadow * 0.4) * unit}px rgba(0,0,0,${shadow / 100})`
              : "none",
            width: blockWidth,
            color: font.color,
            fontFamily: [
              JSON.stringify(family),
              ...fallbackFonts.map((face) =>
                JSON.stringify(
                  captionFontFamily(
                    asset(face.src),
                    face.family,
                    face.weight,
                    face.italic,
                  ),
                ),
              ),
              '"Inter"',
              "Arial",
              "sans-serif",
            ].join(", "),
            fontSize,
            fontWeight: font.weight,
            fontStyle: font.italic ? "italic" : "normal",
            lineHeight: font.lineHeight,
            letterSpacing: font.letterSpacing * unit,
            wordSpacing: font.wordSpacing * unit,
            textAlign: layout.alignment,
            textTransform:
              font.textCase === "preserve" ? "none" : font.textCase,
            whiteSpace: "pre-wrap",
            // Never split a word: a word wider than the box stays whole and centered.
            overflowWrap: "normal",
            minWidth: "min-content",
          }}
        >
          {showPill ? <span aria-hidden="true" data-caption-pill style={{
            position: "absolute", pointerEvents: "none", zIndex: 0,
            left: pillStart.x + (targetRect.x - pillStart.x) * easedPill,
            top: pillStart.y + (targetRect.y - pillStart.y) * easedPill,
            width: pillStart.width + (targetRect.width - pillStart.width) * easedPill,
            height: pillStart.height + (targetRect.height - pillStart.height) * easedPill,
            borderRadius: ".2em", opacity: pillOpacity,
            backgroundColor: pillEdit?.highlight?.backgroundColor ?? presentationConfig?.highlights?.backgroundColor ?? "#8173ed",
          }} /> : null}
          <span style={presentationConfig?.plate ? {
            background: presentationConfig.plateColor ?? "#ffffff", padding: ".13em .22em",
            borderRadius: ".12em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone",
          } : undefined}>
          {cue.words.map((word, wordIndex) => (
            <Fragment key={word.id}>
              {paintWord(word)}
              {wordIndex < cue.words.length - 1 ? (
                lineBreaks.has(word.id) ||
                (presentationConfig?.stacked &&
                  cue.words.length > 1 &&
                  wordIndex === Math.ceil(cue.words.length / 2) - 1) ? (
                  <br />
                ) : (
                  " "
                )
              ) : null}
            </Fragment>
          ))}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
