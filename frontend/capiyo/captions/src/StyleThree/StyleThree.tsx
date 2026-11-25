import { MotionWord } from "../Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { PartSizesContext } from "../Premium/parts";
import {
  AbsoluteFill,
  Sequence,
  Video,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { getActiveCueIndex } from "../CaptionEngine/compilePlan";
import { clamp, finite, isRecord } from "../CaptionEngine/types";
import {
  assetSource,
  ensureStyleTwoFonts,
  fontFamily,
} from "../StyleTwo/fonts";
import { createCanvasMeasurer } from "../StyleTwo/layout";
import { getStyleTwoExit, getStyleTwoWordMotion } from "../StyleTwo/motion";
import { bounded } from "./config";
import { compileStyleThree } from "./engine";
import { styleThreeSource } from "./demo";
import { layoutStyleThreePages, type MumbaiPage } from "./layout";
import defaults from "./style-three.config.json";

export type StyleThreeProps = {
  sourceConfig?: unknown;
  styleConfig?: unknown;
  fps?: number;
  reducedMotion?: boolean;
};
export const StyleThree: React.FC<StyleThreeProps> = ({
  sourceConfig = styleThreeSource,
  styleConfig = defaults,
  reducedMotion = false,
}) => {
  const frame = useCurrentFrame(),
    { width, height, fps } = useVideoConfig();
  const compiled = useMemo(
    () => compileStyleThree(sourceConfig, fps, styleConfig),
    [sourceConfig, fps, styleConfig],
  );
  const { appearance, background } = compiled,
    { fonts, colors, glow, motion } = appearance;
  // Style-library cards pass naturalWrap to keep the chunk fully settled while
  // the preview is idle; reduced-motion preferences share the same stillness.
  const chunkSettled =
    reducedMotion === true ||
    (isRecord(styleConfig) && styleConfig.naturalWrap === true);
  const sizes = useContext(PartSizesContext);
  const token = useMemo(
    () => ({ compiled, width, height, fps, sizes }),
    [compiled, width, height, fps, sizes],
  );
  const fallback = useMemo(
    () =>
      layoutStyleThreePages(
        compiled.captions.cues,
        appearance,
        width,
        height,
        fps,
        compiled.rowBreaks,
        undefined,
        sizes,
      ),
    [compiled, appearance, width, height, fps, sizes],
  );
  const [loaded, setLoaded] = useState<{
    token: typeof token;
    pages: MumbaiPage[];
    diagnostics: string[];
  } | null>(null);
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    let cancelled = false;
    const handle = delayRender("Loading Mumbai fonts and measuring both lines");
    void ensureStyleTwoFonts(fonts)
      .then((diagnostics) => {
        if (!cancelled)
          setLoaded({
            token,
            pages: layoutStyleThreePages(
              compiled.captions.cues,
              appearance,
              width,
              height,
              fps,
              compiled.rowBreaks,
              createCanvasMeasurer(),
              sizes,
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
            diagnostics: ["Using visible font fallbacks."],
          });
        continueRender(handle);
      });
    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [
    token,
    compiled,
    appearance,
    fonts,
    width,
    height,
    fps,
    fallback,
    delayRender,
    continueRender,
  ]);
  const pages = loaded?.token === token ? loaded.pages : fallback;
  const pageIndex = getActiveCueIndex(pages, frame),
    page = pageIndex >= 0 ? pages[pageIndex] : null;
  useCueMotion(page ? (page.tokens[0].startFrame * 1000) / fps : undefined, page ? (page.endFrame * 1000) / fps : undefined);
  const chosen = useChosenEntrance();
  const prefix = useId().replace(/:/g, ""),
    unit = width / 1080;
  const glowId = `${prefix}-mumbai-glow`,
    halo = (glow.radius * 6 + 72) * unit;
  const glowEnabled = glow.enabled && glow.radius > 0 && glow.opacity > 0;
  const exit =
    page && !chunkSettled
      ? getStyleTwoExit(
          frame,
          page.tokens[page.tokens.length - 1].startFrame,
          page.endFrame,
          fps,
          motion.exitMs,
        )
      : 0;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {typeof background.src === "string" && background.src.trim() ? (
        <Sequence name="Mumbai footage" premountFor={fps}>
          <Video
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
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label={page?.words.map((w) => w.text).join(" ")}
        data-readability-limited={page?.readabilityLimited || undefined}
        data-font-fallback={
          (loaded?.token === token && loaded.diagnostics.length > 0) ||
          undefined
        }
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          {glowEnabled ? (
            <filter
              id={glowId}
              filterUnits="userSpaceOnUse"
              x={(page?.left ?? 0) - halo}
              y={(page?.top ?? 0) - halo}
              width={(page?.width ?? width) + halo * 2}
              height={(page?.height ?? height) + halo * 2}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={glow.radius * unit * 0.8}
                result="inner"
              />
              <feComponentTransfer in="inner" result="inner-alpha">
                <feFuncA type="linear" slope={glow.opacity} />
              </feComponentTransfer>
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={glow.radius * unit * 2.1}
                result="outer"
              />
              <feComponentTransfer in="outer" result="outer-alpha">
                <feFuncA type="linear" slope={glow.opacity * 0.72} />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="outer-alpha" />
                <feMergeNode in="inner-alpha" />
              </feMerge>
            </filter>
          ) : null}
          <filter
            id={`${prefix}-soft-shadow`}
            filterUnits="userSpaceOnUse"
            x={(page?.left ?? 0) - halo}
            y={(page?.top ?? 0) - halo}
            width={(page?.width ?? width) + halo * 2}
            height={(page?.height ?? height) + halo * 2}
          >
            <feGaussianBlur
              in="SourceAlpha"
              stdDeviation={1.5 * unit}
              result="blur"
            />
            <feOffset in="blur" dx={0} dy={2.5 * unit} result="offset" />
            <feComponentTransfer in="offset" result="shadow">
              <feFuncA type="linear" slope={0.28} />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {page?.tokens
            .filter((t) => t.primary)
            .map((t) => {
              const left =
                colors.gradientLevel === "line" ? page.primaryLeft : t.x;
              const span =
                colors.gradientLevel === "line" ? page.primaryWidth : t.width;
              const angle = (colors.angle * Math.PI) / 180,
                dx = (Math.cos(angle) * span) / 2,
                dy = (Math.sin(angle) * t.size) / 2;
              const elapsed = ((frame - t.startFrame) * 1000) / fps,
                shine = clamp(elapsed / motion.shineMs, 0, 1);
              return (
                <React.Fragment key={t.word.id}>
                  <linearGradient
                    id={`${prefix}-gold-${t.word.id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={left + span / 2 - dx}
                    y1={t.y - t.size / 2 - dy}
                    x2={left + span / 2 + dx}
                    y2={t.y - t.size / 2 + dy}
                  >
                    {colors.stops.map((stop, index) => (
                      <stop
                        key={index}
                        offset={stop.offset}
                        stopColor={stop.color}
                      />
                    ))}
                  </linearGradient>
                  <linearGradient
                    id={`${prefix}-shine-${t.word.id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={t.x + t.width * (shine * 1.6 - 0.4) - t.width * 0.2}
                    x2={t.x + t.width * (shine * 1.6 - 0.4) + t.width * 0.2}
                  >
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </React.Fragment>
              );
            })}
        </defs>
        <g opacity={1 - exit}>
          {page?.tokens.map((t) => {
            const still = chunkSettled || chosen(t.word.id, t.primary);
            // Word by word, each one slides up smoothly into place. Its size never changes.
            const rowStart = t.startFrame;
            const next = page.tokens.map((other) => other.startFrame).filter((f) => f > t.startFrame).sort((a, b) => a - b)[0];
            // A pause before the next word gives a longer slide; fast speech a shorter one.
            const slideMs = next === undefined ? 520 : clamp(((next - t.startFrame) * 1000 / fps) * 0.9, 260, 520);
            const p = clamp(((frame - rowStart) * 1000) / fps / slideMs, 0, 1);
            const eased = 1 - (1 - p) ** 3;
            const entry = still || p >= 1
              ? { opacity: 1, y: 0, scale: 1, rotation: 0 }
              : frame < rowStart ? { opacity: 0, y: 0, scale: 1, rotation: 0 } : {
                  opacity: clamp(p * 2.2, 0, 1),
                  y: t.size * 0.42 * (1 - eased),
                  scale: 1,
                  rotation: 0,
                };
            void getStyleTwoWordMotion;
            if (entry.opacity <= 0 && !still) return null;
            const font = t.primary ? fonts.body : fonts.highlight;
            const cx = t.x + t.width / 2, cy = t.y - t.size * 0.3;
            const available = Math.max(1, page.endFrame - t.startFrame);
            const duration = Math.min(
              (motion.entryMs * fps) / 1000,
              available * 0.65,
            );
            const progress = clamp(
              (frame - rowStart + 1) / Math.max(1, duration),
              0,
              1,
            );
            const elapsed = ((frame - rowStart) * 1000) / fps;
            const shineOpacity =
              !chunkSettled &&
              elapsed >= 0 &&
              elapsed < motion.shineMs
                ? Math.sin((Math.PI * elapsed) / motion.shineMs) *
                  motion.shineOpacity
                : 0;
            const textProps: React.SVGProps<SVGTextElement> = {
              x: t.x,
              y: t.y,
              fontSize: t.size,
              fontFamily: `${fontFamily(font)}, Arial, sans-serif`,
              fontWeight: font.weight,
              fontStyle: font.style,
              letterSpacing: t.tracking,
              style: {
                fontKerning: "normal",
                fontSynthesis: "none",
                whiteSpace: "pre",
              },
            };
            return (
              <MotionWord key={t.word.id} id={t.word.id} startMs={(t.startFrame * 1000) / fps} size={t.size} main={t.primary}>
              <g
                data-word-id={t.word.id}
                data-mumbai-row={t.primary ? "gold" : "script"}
                opacity={entry.opacity}
                transform={`translate(0 ${entry.y}) translate(${cx} ${cy}) rotate(${entry.rotation}) scale(${entry.scale}) translate(${-cx} ${-cy})`}
                style={{
                  filter:
                    !still && progress < 1 && motion.blur > 0
                      ? `blur(${motion.blur * unit * (1 - progress) ** 2}px)`
                      : undefined,
                }}
              >
                {glowEnabled ? (
                  <text
                    {...textProps}
                    fill={t.primary ? colors.glow : colors.script}
                    filter={`url(#${glowId})`}
                    aria-hidden="true"
                  >
                    {t.text}
                  </text>
                ) : null}
                <text
                  {...textProps}
                  fill={
                    t.primary
                      ? `url(#${prefix}-gold-${t.word.id})`
                      : colors.script
                  }
                  filter={`url(#${prefix}-soft-shadow)`}
                >
                  {t.text}
                </text>
                {shineOpacity > 0 ? (
                  <text
                    {...textProps}
                    fill={`url(#${prefix}-shine-${t.word.id})`}
                    opacity={shineOpacity * (t.primary ? 1 : 0.32)}
                    aria-hidden="true"
                  >
                    {t.text}
                  </text>
                ) : null}
              </g>
              </MotionWord>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
export const resolveStyleThreeMetadata = ({
  props,
}: {
  props: StyleThreeProps;
}) => {
  const fps = clamp(finite(props.fps, 30), 1, 120);
  return {
    fps,
    durationInFrames: compileStyleThree(
      props.sourceConfig ?? styleThreeSource,
      fps,
      props.styleConfig ?? defaults,
    ).durationInFrames,
  };
};
export default StyleThree;
