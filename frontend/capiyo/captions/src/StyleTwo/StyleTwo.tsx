import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { getActiveCueIndex } from "../CaptionEngine/compilePlan";
import { clamp, finite, isRecord } from "../CaptionEngine/types";
import { bounded } from "./config";
import { styleTwoSource } from "./demo";
import { compileStyleTwo } from "./engine";
import { assetSource, ensureStyleTwoFonts, fontFamily } from "./fonts";
import {
  createCanvasMeasurer,
  layoutStyleTwoPages,
  type StyleTwoPage,
} from "./layout";
import { getStyleTwoExit, getStyleTwoWordMotion } from "./motion";
import { captionFrame, poseOf, type CaptionAnimation } from "../BasicCaption/motion";
import { SettledMotionContext } from "../BasicCaption/cueMotion";
import { useWordFonts, wordLook } from "../BasicCaption/wordLook";
import type { BasicWordPresentation } from "../BasicCaption/wordPresentation";
import defaults from "./style-two.config.json";
import { SourceVideo } from "../SourceVideo";

export { compileStyleTwo } from "./engine";
export { resolveStyleTwoAppearance } from "./config";
export type StyleTwoProps = {
  /** Chosen motion for the whole caption; undefined keeps the style's own. */
  animation?: CaptionAnimation;
  /** What single words changed for themselves. */
  wordStyles?: Record<string, BasicWordPresentation>;
  sourceConfig?: unknown;
  styleConfig?: unknown;
  fps?: number;
  reducedMotion?: boolean;
};

const usePages = (
  compiled: ReturnType<typeof compileStyleTwo>,
  width: number,
  height: number,
  fps: number,
) => {
  const { delayRender, continueRender } = useDelayRender();
  const token = useMemo(
    () => ({ compiled, width, height, fps }),
    [compiled, width, height, fps],
  );
  const fallback = useMemo(
    () =>
      layoutStyleTwoPages(
        compiled.captions.cues,
        compiled.appearance,
        width,
        height,
        fps,
      ),
    [compiled, width, height, fps],
  );
  const [loaded, setLoaded] = useState<{
    token: typeof token;
    pages: StyleTwoPage[];
    diagnostics: string[];
  } | null>(null);
  useLayoutEffect(() => {
    let cancelled = false;
    const handle = delayRender(
      "Loading Style Two fonts and measuring caption lines",
    );
    void ensureStyleTwoFonts(compiled.appearance.fonts)
      .then((diagnostics) => {
        if (!cancelled)
          setLoaded({
            token,
            pages: layoutStyleTwoPages(
              compiled.captions.cues,
              compiled.appearance,
              width,
              height,
              fps,
              createCanvasMeasurer(),
            ),
            diagnostics,
          });
        continueRender(handle);
      })
      .catch(() => {
        if (!cancelled)
          setLoaded({
            token,
            pages: fallback,
            diagnostics: ["Using fallback caption measurements."],
          });
        continueRender(handle);
      });
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [
    compiled,
    width,
    height,
    fps,
    token,
    fallback,
    delayRender,
    continueRender,
  ]);
  return loaded?.token === token
    ? loaded
    : { pages: fallback, diagnostics: [] };
};

export const StyleTwo: React.FC<StyleTwoProps> = ({
  sourceConfig = styleTwoSource,
  styleConfig = defaults,
  reducedMotion = false,
  animation,
  wordStyles,
}) => {
  const frame = useCurrentFrame(),
    { width, height, fps } = useVideoConfig();
  const compiled = useMemo(
    () => compileStyleTwo(sourceConfig, fps, styleConfig),
    [sourceConfig, fps, styleConfig],
  );
  const { pages, diagnostics } = usePages(compiled, width, height, fps);
  const index = getActiveCueIndex(pages, frame),
    page = index >= 0 ? pages[index] : null;
  const { appearance, background } = compiled;
  const { colors, glow, motion } = appearance;
  // Style-library cards pass naturalWrap to keep the chunk fully settled while
  // the preview is idle; reduced-motion preferences share the same stillness.
  const chunkSettled =
    reducedMotion === true ||
    (isRecord(styleConfig) && styleConfig.naturalWrap === true);
  const unit = width / 1080,
    prefix = useId().replace(/:/g, ""),
    glowId = `${prefix}-style-two-glow`;
  const glowEnabled = glow.enabled && glow.radius > 0 && glow.opacity > 0;
  const glowPadding = (glow.radius * 5 + motion.travel + 4) * unit;
  const paused = useContext(SettledMotionContext);
  useWordFonts(wordStyles);
  const lastStart = page?.tokens[page.tokens.length - 1].startFrame ?? 0;
  const exit =
    page && !chunkSettled && !paused
      ? getStyleTwoExit(frame, lastStart, page.endFrame, fps, motion.exitMs)
      : 0;
  const chosen = animation && page && !chunkSettled && !paused
    ? captionFrame(animation, (frame * 1000) / fps, (page.tokens[0].startFrame * 1000) / fps, (page.endFrame * 1000) / fps)
    : undefined;
  const tokenTimes = page?.tokens.map((token) => ({ id: token.word.id, startMs: (token.startFrame * 1000) / fps })) ?? [];
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {typeof background.src === "string" && background.src.trim() ? (
        <Sequence name="Style Two footage" premountFor={fps}>
          <SourceVideo
            src={assetSource(background.src)}
            muted={background.muted === true}
            volume={bounded(background.volume, 1, 0, 1)}
            trimBefore={Math.round(
              (bounded(background.trimBeforeMs, 0, 0, 86400000) * fps) / 1000,
            )}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Sequence>
      ) : null}
      {colors.backdropOpacity > 0 ? (
        <AbsoluteFill
          style={{
            backgroundColor: colors.backdrop,
            opacity: colors.backdropOpacity,
          }}
        />
      ) : null}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={page?.words.map((word) => word.text).join(" ")}
        data-readability-limited={page?.readabilityLimited || undefined}
        data-font-fallback={diagnostics.length > 0 || undefined}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {glowEnabled ? (
          <defs>
            <filter
              id={glowId}
              filterUnits="userSpaceOnUse"
              x={(page?.left ?? 0) - glowPadding}
              y={(page?.top ?? 0) - glowPadding}
              width={(page?.width ?? width) + glowPadding * 2}
              height={(page?.height ?? height) + glowPadding * 2}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={glow.radius * unit * 0.5}
                result="inner"
              />
              <feComponentTransfer in="inner" result="inner-alpha">
                <feFuncA type="linear" slope={glow.opacity} />
              </feComponentTransfer>
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={glow.radius * unit}
                result="middle"
              />
              <feComponentTransfer in="middle" result="middle-alpha">
                <feFuncA type="linear" slope={glow.opacity * 0.75} />
              </feComponentTransfer>
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={glow.radius * unit * 1.5}
                result="outer"
              />
              <feComponentTransfer in="outer" result="outer-alpha">
                <feFuncA type="linear" slope={glow.opacity * 0.5} />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="outer-alpha" />
                <feMergeNode in="middle-alpha" />
                <feMergeNode in="inner-alpha" />
              </feMerge>
            </filter>
          </defs>
        ) : null}
        <g
          opacity={chosen ? chosen.opacity : 1 - exit}
          data-caption-box
          style={chosen ? {
            transform: chosen.transform || undefined, filter: chosen.filter, clipPath: chosen.clipPath,
            transformBox: "fill-box", transformOrigin: "center", fontSize: appearance.layout.fontSize * unit,
          } : undefined}
        >
          {page?.tokens.map((token, tokenIndex) => {
            // A chosen entrance replaces the style's own, for the chunk or for each word or line.
            const pose = animation && !chunkSettled
              ? poseOf(animation, (frame * 1000) / fps, tokenTimes, tokenIndex, paused, (other) => ({
                  y: page.tokens[other].y, height: page.tokens[other].size,
                }), wordStyles?.[token.word.id]?.emphasized, (page.endFrame * 1000) / fps)
              : undefined;
            if (pose?.opacity === 0) return null;
            const entry = chunkSettled || animation?.in || pose
              ? { opacity: 1, y: 0, scale: 1, rotation: 0 }
              : getStyleTwoWordMotion(
                  frame,
                  token.startFrame,
                  page.endFrame,
                  fps,
                  motion,
                  token.highlighted,
                  unit,
                );
            if (entry.opacity <= 0) return null;
            const look = wordLook(wordStyles?.[token.word.id], unit);
            const cx = token.x + token.width / 2,
              cy = token.y - token.size * 0.3;
            const textProps: React.SVGProps<SVGTextElement> = {
              x: token.x,
              y: token.y,
              fontSize: token.size,
              fontFamily: look.fontFamily ?? `${fontFamily(token.font)}, ${token.font.style === "italic" ? "Georgia, serif" : "Arial, sans-serif"}`,
              fontWeight: (look.fontWeight as number | undefined) ?? token.font.weight,
              fontStyle: look.fontStyle ?? token.font.style,
              dominantBaseline: "alphabetic",
              textAnchor: "start",
              style: {
                fontKerning: "normal",
                fontSynthesis: "none",
                whiteSpace: "pre",
                textTransform: look.textTransform,
              },
            };
            return (
              <g
                key={token.word.id}
                data-word-id={token.word.id}
                data-highlighted={token.highlighted || undefined}
                opacity={entry.opacity * (pose?.opacity ?? 1)}
                visibility={look.visibility}
                transform={`translate(0 ${entry.y}) translate(${cx} ${cy}) rotate(${entry.rotation}) scale(${entry.scale}) translate(${-cx} ${-cy})`}
              >
                <g style={pose ? {
                  transform: pose.transform || undefined, filter: pose.filter, clipPath: pose.clipPath,
                  transformBox: "fill-box", transformOrigin: "center", fontSize: token.size,
                } : undefined}>
                {token.highlighted && glowEnabled ? (
                  <text
                    {...textProps}
                    fill={colors.glow}
                    filter={`url(#${glowId})`}
                    aria-hidden="true"
                  >
                    {token.word.text}
                  </text>
                ) : null}
                <text
                  {...textProps}
                  fill={look.color ?? (token.highlighted ? colors.highlight : colors.text)}
                >
                  {token.word.text}
                </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
export const resolveStyleTwoMetadata = ({
  props,
}: {
  props: StyleTwoProps;
}) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  return {
    fps,
    durationInFrames: compileStyleTwo(
      props.sourceConfig ?? styleTwoSource,
      fps,
      props.styleConfig ?? defaults,
    ).durationInFrames,
  };
};
export default StyleTwo;
