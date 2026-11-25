import React, {
  Fragment,
  useCallback,
  useContext, useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import transcript from "../StyleTwo/demo.transcript.json";
import { clamp, finite } from "../CaptionEngine/types";
import defaults from "./captions-dot.config.json";
import { buildCaptionsDotTimeline } from "./timeline";
import type { BasicCaptionPresentation } from "../BasicCaption/BasicCaptionRenderer";
import type { BasicCaptionSource } from "../BasicCaption/source";
import { captionFontFamily, loadCaptionFont } from "../BasicCaption/fonts";
import { textEffectFilter } from "../BasicCaption/wordPresentation";
import { captionFrame, poseOf } from "../BasicCaption/motion";
import { SettledMotionContext, useWordBoxes } from "../BasicCaption/cueMotion";
import { useWordFonts, wordLook } from "../BasicCaption/wordLook";
import { SourceVideo } from "../SourceVideo";

export type CaptionsDotConfig = typeof defaults;
type ConfigInput = {
  [K in keyof CaptionsDotConfig]?: Partial<CaptionsDotConfig[K]>;
};
export type CaptionsDotProps = { config?: ConfigInput; sourceConfig?: BasicCaptionSource;
  presentationConfig?: BasicCaptionPresentation; positionX?: number; positionY?: number; rotation?: number; fontSrc?: string; wordSlide?: boolean };
const asset = (src: string) =>
  /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);
const fontName = (family: string) =>
  family === "IntegralCF"
    ? "CaptionsDotIntegral"
    : family === "Poppins"
      ? "CaptionsDotPoppins"
      : family;
/** Anything that isn't a letter, mark, number or space: punctuation, $, %, emoji. */
const SYMBOLS = /([^\p{L}\p{M}\p{N}\s]+)/u;
const fontLoading = new Map<string, Promise<void>>();
const loadFont = (family: string, file: string) => {
  let pending = fontLoading.get(family);
  if (!pending) {
    const face = new FontFace(family, `url(${JSON.stringify(asset(file))})`, { weight: "900" });
    pending = face.load().then(() => void document.fonts.add(face)).catch(() => {
      fontLoading.delete(family);
      console.warn("CaptionsDot: using a system font fallback.");
    });
    fontLoading.set(family, pending);
  }
  return pending;
};

export const CaptionsDot: React.FC<CaptionsDotProps> = ({ config, sourceConfig, presentationConfig, positionX, positionY, rotation = 0, fontSrc, wordSlide = false }) => {
  const c = useMemo(
    () => ({
      style: { ...defaults.style, ...config?.style },
      animation: { ...defaults.animation, ...config?.animation },
      grouping: { ...defaults.grouping, ...config?.grouping },
    }),
    [config],
  );
  const background = sourceConfig?.background;
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const groups = useMemo(
    () => buildCaptionsDotTimeline(sourceConfig?.transcript ?? transcript, fps, c.grouping, c.animation),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compared by value: the config object is rebuilt on every color change.
    [sourceConfig?.transcript, fps, JSON.stringify(c.grouping), JSON.stringify(c.animation)],
  );
  // Pages of several words wrap inside the box; a single word is drawn at the chosen size, even past the edge.
  const wrap = c.grouping.mode === "pages";
  const unit = width / 1080;
  // Style cards pass a cap height so every card reads at one size (Integral's cap height is .72em).
  const opticalHeight = presentationConfig?.opticalHeight;
  const size = opticalHeight ? (opticalHeight * unit) / 0.72 : clamp(finite(c.style.baseFontSize, 78), 20, 240) * unit;
  const fallbackKey = JSON.stringify(presentationConfig?.fallbackFonts ?? []);
  const extraFonts = useMemo(() => JSON.parse(fallbackKey) as NonNullable<BasicCaptionPresentation["fallbackFonts"]>, [fallbackKey]);
  const primaryFamily = fontSrc ? captionFontFamily(asset(fontSrc), c.style.fontFamily, c.style.fontWeight) : fontName(c.style.fontFamily);
  const family = [primaryFamily, fontName(c.style.fallbackFont), ...extraFonts.map(face =>
    captionFontFamily(asset(face.src), face.family, face.weight, face.italic))].map(name => JSON.stringify(name)).join(", ") + ", Arial, sans-serif";
  // Integral's own punctuation is too heavy, so its symbols come from Poppins; any other font keeps its own.
  const symbolFamily = c.style.fontFamily === "IntegralCF" ? `${JSON.stringify(fontName(c.style.fallbackFont))}, ${family}` : undefined;
  const tracking = clamp(finite(c.style.letterSpacing, 0), -0.08, 0.3);
  const transformCase = useCallback(
    (text: string) =>
      c.style.casing === "uppercase"
        ? text.toUpperCase()
        : c.style.casing === "lowercase"
          ? text.toLowerCase()
          : text,
    [c.style.casing],
  );
  const { delayRender, continueRender } = useDelayRender();
  const { fontFamily, fontWeight } = c.style;
  useLayoutEffect(() => {
    const handle = delayRender("Loading CaptionsDot fonts");
    void Promise.all([
      loadFont("CaptionsDotPoppins", "captions-dot/poppins-black.ttf"),
      fontSrc ? loadCaptionFont(asset(fontSrc), fontFamily, fontWeight) : loadFont("CaptionsDotIntegral", "captions-dot/integral-heavy.otf"),
      ...extraFonts.map(face => loadCaptionFont(asset(face.src), face.family, face.weight, face.italic)),
    ])
      // A font that fails to load falls back to the system font; it must not stop the preview.
      .catch(() => undefined)
      .finally(() => continueRender(handle));
    return () => continueRender(handle);
  }, [fontSrc, fontFamily, fontWeight, extraFonts, delayRender, continueRender]);
  useWordFonts(presentationConfig?.wordStyles);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    onLayout?.(size * 1.35);
  }, [onLayout, size]);

  let low = 0,
    high = groups.length - 1,
    index = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (groups[mid].startFrame <= frame) {
      index = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  const active =
    index >= 0 && frame < groups[index].endFrame ? groups[index] : null;
  const last = active?.words[active.words.length - 1];
  // Whole captions and lines bring all of their words in together.
  const together = !!presentationConfig?.animation?.in && presentationConfig.animation.unit !== "word";
  const settled = useContext(SettledMotionContext);
  let scale = 1,
    opacity = 1;
  if (
    active &&
    !settled &&
    !presentationConfig?.reducedMotion && c.animation.type === "pop" &&
    active.endFrame - active.startFrame > 3
  ) {
    const progress = spring({
      frame: frame - active.startFrame,
      fps,
      config: {
        damping: clamp(finite(c.animation.springDamping, 16), 1, 100),
        stiffness: clamp(finite(c.animation.springStiffness, 260), 1, 1000),
        mass: 0.55,
      },
    });
    scale = interpolate(
      progress,
      [0, 1],
      [clamp(finite(c.animation.scaleFrom, 0.88), 0.5, 1), 1],
      { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
    );
  }
  if (active && !settled && c.animation.fadeFrames > 0 && last) {
    const fadeFrames = Math.min(
      c.animation.fadeFrames,
      (active.endFrame - Math.ceil((last.startMs * fps) / 1000)) / 3,
    );
    opacity = clamp((active.endFrame - frame) / Math.max(1, fadeFrames), 0, 1);
  }
  const slide = wordSlide && active && !settled && !presentationConfig?.reducedMotion
    ? 5 * unit * (1 - Math.min(1, Math.max(0, (frame - active.startFrame) / Math.max(1, fps * .12)))) ** 3 : 0;
  const fx = presentationConfig?.textEffects;
  // One word's effects can't sit under the block's, so such a caption paints them word by word.
  const wordFx = active?.words.some((word) => presentationConfig?.wordStyles?.[word.id]?.effects);
  const gradient = presentationConfig?.gradient;
  const chosenMotion = presentationConfig?.reducedMotion ? undefined : presentationConfig?.animation;
  const animation = settled ? undefined : chosenMotion;
  const now = (frame * 1000) / fps;
  const boxRef = useRef<HTMLDivElement>(null);
  const boxes = useWordBoxes(boxRef, chosenMotion?.unit === "line");
  const poseFor = (wordIndex: number) => chosenMotion && active
    ? poseOf(chosenMotion, now, active.words, wordIndex, settled, (other) => boxes[active.words[other].id], presentationConfig?.wordStyles?.[active.words[wordIndex].id]?.emphasized, (active.endFrame * 1000) / fps)
    : undefined;
  const blockMotion = animation && active
    ? captionFrame(animation, now, (active.startFrame * 1000) / fps, (active.endFrame * 1000) / fps)
    : undefined;
  const gradientStyle: React.CSSProperties | undefined = gradient ? {
    backgroundImage: `linear-gradient(${gradient.angle}deg, ${[...gradient.stops]
      .sort((a, b) => a.position - b.position)
      .map((stop) => `${stop.color} ${stop.position}%`)
      .join(", ")})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  } : undefined;
  // Symbols are drawn exactly as the transcript has them; only their color and font differ.
  const symbolStyle: React.CSSProperties | undefined = c.style.colorSymbols || symbolFamily
    ? { ...(c.style.colorSymbols ? { color: c.style.symbolColor } : {}), fontFamily: symbolFamily }
    : undefined;
  return (
    <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor, overflow: "hidden" }}>
      {background?.src ? (
        <SourceVideo
          src={asset(background.src)}
          muted={background.muted ?? false}
          volume={background.volume ?? 1}
          style={{ width: "100%", height: "100%", objectFit: background.objectFit ?? "cover" }}
        />
      ) : null}
      {active ? (
        <div
          ref={boxRef}
          data-caption-box
          style={{
            position: "absolute",
            left: `${clamp(finite(positionX, .5), 0, 1) * 100}%`,
            ...(positionY === undefined ? { bottom: height * clamp(finite(c.style.bottomPadding, 0.12), 0.02, 0.8) }
              : { top: height * clamp(finite(positionY, .72), 0, 1) }),
            transform: `${positionY === undefined ? `translateX(-${clamp(finite(positionX, .5), 0, 1) * 100}%)` : "translate(-50%, -50%)"} translateY(${animation?.in ? 0 : slide}px) rotate(${rotation}deg) scale(${scale}) ${blockMotion?.transform ?? ""}`,
            opacity: opacity * (wordFx ? 1 : fx?.opacity ?? 1) * (blockMotion?.opacity ?? 1),
            clipPath: blockMotion?.clipPath,
            mixBlendMode: fx?.blend && fx.blend !== "normal" ? (fx.blend as React.CSSProperties["mixBlendMode"]) : undefined,
            filter: [wordFx ? undefined : textEffectFilter(fx, unit), blockMotion?.filter].filter(Boolean).join(" ") || undefined,
            WebkitTextStroke: fx?.stroke ? `${fx.stroke.width * 2 * unit}px ${fx.stroke.color}` : undefined,
            paintOrder: "stroke fill",
            whiteSpace: wrap ? "normal" : "pre",
            width: wrap ? width * clamp(finite(c.style.maxWidth, 0.84), 0.2, 0.94) : undefined,
            textAlign: "center",
            fontFamily: family,
            fontWeight: c.style.fontWeight,
            fontSize: size,
            lineHeight: c.style.lineHeight,
            wordSpacing: finite(c.style.wordSpacing, 0) * unit,
            letterSpacing: `${tracking}em`,
            color: c.style.textColor,
            pointerEvents: "none",
          }}
        >
          {active.words.map((word, wordIndex) => {
            const edit = presentationConfig?.wordStyles?.[word.id];
            const keyColor = edit?.emphasized ? edit.highlight?.color : undefined;
            const wordMotion = poseFor(wordIndex);
            const ownFx = edit?.effects ?? fx;
            return (
            <Fragment key={word.id}>
              {wordIndex ? " " : null}
              <span
                data-word-id={word.id}
                style={{
                  ...(edit?.emphasized && edit.keyGradient ? {
                    backgroundImage: `linear-gradient(${edit.keyGradient.angle}deg, ${edit.keyGradient.stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ")})`,
                    WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                  } : keyColor ? { color: keyColor } : gradientStyle),
                  ...wordLook(edit, unit),
                  ...(wordMotion
                    ? { display: "inline-block", opacity: wordMotion.opacity, transform: wordMotion.transform || undefined,
                        filter: wordMotion.filter, clipPath: wordMotion.clipPath }
                    : {}),
                  ...(wordFx
                    ? { display: "inline-block", opacity: (wordMotion?.opacity ?? 1) * (ownFx?.opacity ?? 1),
                        filter: [textEffectFilter(ownFx, unit), wordMotion?.filter].filter(Boolean).join(" ") || undefined,
                        ...(edit?.effects ? { WebkitTextStroke: ownFx?.stroke ? `${ownFx.stroke.width * 2 * unit}px ${ownFx.stroke.color}` : "0" } : {}) }
                    : {}),
                  visibility:
                    together || frame >= Math.ceil((word.startMs * fps) / 1000)
                      ? edit?.blendPass
                      : "hidden",
                }}
              >
                {transformCase(word.text)
                  .split(SYMBOLS)
                  .map((part, partIndex) => part ? (
                    <span key={partIndex} style={partIndex % 2 ? symbolStyle : undefined}>
                      {part}
                    </span>
                  ) : null)}
              </span>
            </Fragment>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const resolveCaptionsDotMetadata = ({
  props,
}: {
  props: CaptionsDotProps;
}) => {
  const animation = { ...defaults.animation, ...props.config?.animation };
  const grouping = { ...defaults.grouping, ...props.config?.grouping };
  const groups = buildCaptionsDotTimeline(props.sourceConfig?.transcript ?? transcript, 30, grouping, animation);
  return {
    durationInFrames: Math.max(props.sourceConfig ? Math.ceil((props.sourceConfig.durationMs ?? 0) * .03) : 1322,
      groups[groups.length - 1]?.endFrame ?? 1),
  };
};
