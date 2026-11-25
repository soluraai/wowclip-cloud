import React, { useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { clamp, finite, type CaptionWord } from "../../CaptionEngine/types";
import {
  activeTrendingCue,
  compileTrendingCaptions,
  ease,
  type TrendingCue,
  type TrendingSource,
  type TrendingVariant,
} from "./engine";
import { trendingSource } from "./source";
import { SourceVideo } from "../../SourceVideo";

export type TrendingCaptionProps = {
  variant: TrendingVariant;
  sourceConfig?: TrendingSource;
  styleConfig?: {
    positionX?: number;
    positionY?: number;
    maxWidth?: number;
    scrimOpacity?: number;
    pillColor?: string;
    fontSize?: number;
    fontSrc?: string;
    color?: string;
    activeColor?: string;
    highlightsEnabled?: boolean;
    centerAnchor?: boolean;
    backgroundColor?: string;
  };
};

type PositionedWord = {
  word: CaptionWord;
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
};

const fontFor = {
  hormozi: {
    family: "TrendingPoppinsBlack",
    src: "launch-caption-pack/fonts/legacy/poppins-black.ttf",
    weight: "900",
  },
  minimal: {
    family: "TrendingInstrumentSans",
    src: "launch-caption-pack/fonts/legacy/instrument-sans-variable.ttf",
    weight: "300 700",
  },
  pill: {
    family: "TrendingInterBold",
    src: "launch-caption-pack/fonts/legacy/Inter-700-normal.ttf",
    weight: "700",
  },
} as const;

const fontPromises = new Map<string, Promise<void>>();
const loadFont = (variant: TrendingVariant, src?: string) => {
  const key = `${variant}:${src ?? "default"}`;
  const existing = fontPromises.get(key);
  if (existing) return existing;
  const font = fontFor[variant];
  const promise = (async () => {
    const face = new FontFace(
      font.family,
      `url(${JSON.stringify(src ? asset(src) : staticFile(font.src))})`,
      { weight: font.weight },
    );
    await face.load();
    document.fonts.add(face);
  })();
  fontPromises.set(key, promise);
  void promise.catch(() => fontPromises.delete(key));
  return promise;
};

const asset = (src: string) =>
  /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

const displayText = (text: string, variant: TrendingVariant) => {
  if (variant === "hormozi") return text.toUpperCase();
  if (variant === "minimal")
    return text.replace(/[.,!:;]+/g, "").toLowerCase() || text.toLowerCase();
  return text;
};

const nominalSize = { hormozi: 62, minimal: 47, pill: 54 };
const gapSize = { hormozi: 13, minimal: 14, pill: 13 };

const layoutCue = (
  cue: TrendingCue,
  variant: TrendingVariant,
  width: number,
  height: number,
  maxWidth: number,
  positionY: number,
  ctx: CanvasRenderingContext2D | null,
  fontSize?: number,
  positionX = 0.5,
  centerAnchor = false,
): PositionedWord[] => {
  const unit = width / 720;
  const size = clamp(finite(fontSize, nominalSize[variant]), 24, 160) * unit;
  const gap = gapSize[variant] * unit;
  const family = fontFor[variant].family;
  const weight =
    variant === "minimal" ? 700 : variant === "hormozi" ? 900 : 700;
  if (ctx)
    ctx.font = `${weight} ${size}px ${JSON.stringify(family)}, Arial, sans-serif`;
  const measured = cue.words.map((word) => {
    const text = displayText(word.text, variant);
    return {
      word,
      text,
      width: ctx
        ? Math.max(ctx.measureText(text).width, size * 0.25)
        : Math.max(size * 0.25, text.length * size * 0.58),
    };
  });
  const limit = width * maxWidth;
  const lines: (typeof measured)[] = [[]];
  if (variant === "minimal") lines[0] = measured;
  else {
    for (const item of measured) {
      const line = lines[lines.length - 1];
      const proposed =
        line.reduce((sum, word) => sum + word.width, 0) +
        line.length * gap +
        item.width;
      if (line.length && proposed > limit && lines.length < 2) lines.push([]);
      lines[lines.length - 1].push(item);
    }
  }
  const widths = lines.map(
    (line) =>
      line.reduce((sum, item) => sum + item.width, 0) +
      Math.max(0, line.length - 1) * gap,
  );
  const fit = Math.min(1, limit / Math.max(1, ...widths));
  const actualSize = size * fit;
  const lineStep = actualSize * 1.13;
  const centerY = height * positionY + (centerAnchor ? actualSize * 0.35 : 0);
  const items: PositionedWord[] = [];
  lines.forEach((line, lineIndex) => {
    const y = centerY + (lineIndex - (lines.length - 1) / 2) * lineStep;
    let x = width * positionX - (widths[lineIndex] * fit) / 2;
    for (const item of line) {
      items.push({
        word: item.word,
        text: item.text,
        x,
        y,
        width: item.width * fit,
        size: actualSize,
      });
      x += (item.width + gap) * fit;
    }
  });
  return items;
};

const activeWordIndex = (words: CaptionWord[], now: number) => {
  let index = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].startMs <= now) index = i;
    else break;
  }
  return index;
};

const emphasisColor = (text: string) => {
  const word = text.toLowerCase().replace(/[^a-z]/g, "");
  if (/^(money|profit|growth|grow|win|success|free|best)$/.test(word))
    return "#43ef8a";
  if (/^(no|not|never|fail|wrong|stop|bad)$/.test(word)) return "#ff7068";
  return "#ffda4a";
};

export const TrendingCaption: React.FC<TrendingCaptionProps> = ({
  variant,
  sourceConfig = trendingSource,
  styleConfig,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = (frame * 1000) / fps;
  const compiled = useMemo(
    () => compileTrendingCaptions(sourceConfig, variant),
    [sourceConfig, variant],
  );
  const { delayRender, continueRender } = useDelayRender();
  const fontSrc = styleConfig?.fontSrc;
  const fontKey = `${variant}:${fontSrc ?? "default"}`;
  const [loadedFont, setLoadedFont] = useState<string | null>(null);
  const fontReady = loadedFont === fontKey;
  useLayoutEffect(() => {
    let cancelled = false;
    const handle = delayRender(`Loading ${variant} caption font`);
    void loadFont(variant, fontSrc)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setLoadedFont(fontKey);
      })
      .finally(() => continueRender(handle));
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [variant, fontSrc, fontKey, delayRender, continueRender]);

  const maxWidth = clamp(finite(styleConfig?.maxWidth, 0.88), 0.5, 0.94);
  const positionY = clamp(finite(styleConfig?.positionY, 0.83), 0.1, 0.9);
  const positionX = clamp(finite(styleConfig?.positionX, 0.5), 0.1, 0.9);
  const fontSize = styleConfig?.fontSize;
  const centerAnchor = styleConfig?.centerAnchor === true;
  const layouts = useMemo(() => {
    if (!fontReady) return new Map<string, PositionedWord[]>();
    const ctx =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
    return new Map(
      compiled.cues.map((cue) => [
        cue.id,
        layoutCue(cue, variant, width, height, maxWidth, positionY, ctx, fontSize, positionX, centerAnchor),
      ]),
    );
  }, [compiled, variant, width, height, maxWidth, positionY, fontReady, fontSize, positionX, centerAnchor]);
  const cue = activeTrendingCue(compiled.cues, now);
  const items = cue ? (layouts.get(cue.id) ?? []) : [];
  const active = cue ? activeWordIndex(cue.words, now) : 0;
  const entry = cue ? ease((now - cue.startMs) / 150) : 0;
  const scrim = clamp(finite(styleConfig?.scrimOpacity, 0.7), 0, 1);
  const unit = width / 720;
  const pillColor = styleConfig?.pillColor ?? "#6366f1";
  const highlightsEnabled = styleConfig?.highlightsEnabled !== false;

  const target = items[active];
  const previous = items[Math.max(0, active - 1)] ?? target;
  const move = target ? ease((now - target.word.startMs) / 120) : 1;
  const mix = (a: number, b: number) => a + (b - a) * move;
  const pill =
    target && previous
      ? {
          x: mix(previous.x, target.x) - 10 * unit,
          y: mix(
            previous.y - previous.size * 0.82,
            target.y - target.size * 0.82,
          ),
          width: mix(previous.width, target.width) + 20 * unit,
          height: mix(previous.size, target.size) * 1.04,
        }
      : null;

  return (
    <AbsoluteFill style={{ backgroundColor: styleConfig?.backgroundColor ?? "#000", overflow: "hidden" }}>
      {sourceConfig.background?.src ? (
        <SourceVideo
          src={asset(sourceConfig.background.src)}
          muted={sourceConfig.background.muted ?? false}
          volume={sourceConfig.background.volume ?? 1}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `linear-gradient(to bottom, transparent 0%, transparent 44%, rgba(0,0,0,${(0.035 * scrim).toFixed(3)}) 56%, rgba(0,0,0,${(0.1 * scrim).toFixed(3)}) 70%, rgba(0,0,0,${(0.25 * scrim).toFixed(3)}) 86%, rgba(0,0,0,${(0.38 * scrim).toFixed(3)}) 100%)`,
        }}
      />
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={cue?.words.map((word) => word.text).join(" ")}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <g
          opacity={entry}
          transform={`translate(0 ${(1 - entry) * 10 * unit})`}
        >
          {variant === "pill" && pill && highlightsEnabled ? (
            <rect
              x={pill.x}
              y={pill.y}
              width={pill.width}
              height={pill.height}
              rx={13 * unit}
              fill={pillColor}
              style={{
                filter: `drop-shadow(0 ${6 * unit}px ${10 * unit}px rgba(0,0,0,0.3))`,
              }}
            />
          ) : null}
          {items.map((item, index) => {
            const isActive = index === active;
            const isPast = index < active;
            const spoken = ease((now - item.word.startMs) / 190);
            const pulse = isActive
              ? Math.sin(Math.PI * clamp((now - item.word.startMs) / 190, 0, 1))
              : 0;
            const centerX = item.x + item.width / 2;
            const centerY = item.y - item.size * 0.35;
            const pop =
              variant === "hormozi" && isActive ? 1 + 0.11 * pulse : 1;
            const opacity =
              variant === "minimal"
                ? isActive
                  ? 0.72 + 0.28 * spoken
                  : isPast
                    ? 0.64
                    : 0.38
                : variant === "pill" && !isActive
                  ? 0.8
                  : 1;
            const weight =
              variant === "minimal"
                ? isActive
                  ? 500 + 200 * spoken
                  : isPast
                    ? 450
                    : 300
                : variant === "hormozi"
                  ? 900
                  : 700;
            return (
              <g
                key={item.word.id}
                opacity={opacity}
                transform={`translate(${centerX} ${centerY}) scale(${pop}) translate(${-centerX} ${-centerY})`}
              >
                <text
                  x={item.x}
                  y={item.y}
                  fontFamily={`${JSON.stringify(fontFor[variant].family)}, Arial, sans-serif`}
                  fontWeight={weight}
                  fontSize={item.size}
                  letterSpacing={variant === "hormozi" ? `${-0.8 * unit}px` : 0}
                  fill={
                    variant === "hormozi" && isActive && highlightsEnabled
                      ? (styleConfig?.activeColor ?? emphasisColor(item.text))
                      : (styleConfig?.color ?? "#fff")
                  }
                  stroke={variant === "hormozi" ? "#101014" : "none"}
                  strokeWidth={variant === "hormozi" ? 4.5 * unit : 0}
                  strokeLinejoin="round"
                  paintOrder="stroke fill"
                  style={{
                    whiteSpace: "pre",
                    fontSynthesis: "none",
                    filter:
                      variant === "minimal"
                        ? isActive
                          ? `drop-shadow(0 0 ${8 * unit}px rgba(255,255,255,0.35)) drop-shadow(0 ${3 * unit}px ${8 * unit}px rgba(0,0,0,0.55))`
                          : `drop-shadow(0 ${3 * unit}px ${8 * unit}px rgba(0,0,0,0.45))`
                        : variant === "hormozi"
                          ? `drop-shadow(0 ${3 * unit}px 0 rgba(0,0,0,0.65)) drop-shadow(0 ${6 * unit}px ${8 * unit}px rgba(0,0,0,0.6))`
                          : `drop-shadow(0 ${3 * unit}px ${7 * unit}px rgba(0,0,0,0.35))`,
                  }}
                >
                  {item.text}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

export const resolveTrendingCaptionMetadata = ({
  props,
}: {
  props: TrendingCaptionProps;
}) => ({
  fps: 30,
  durationInFrames: Math.max(
    1,
    Math.ceil(
      (compileTrendingCaptions(
        props.sourceConfig ?? trendingSource,
        props.variant,
      ).durationMs *
        30) /
        1000,
    ),
  ),
});
