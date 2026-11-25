import React, { Fragment, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { getActiveCueIndex } from "../CaptionEngine/compilePlan";
import { clamp, isRecord } from "../CaptionEngine/types";
import { compileBasicCaption } from "../BasicCaption/engine";
import { captionFrame, poseOf } from "../BasicCaption/motion";
import { SettledMotionContext, useWordBoxes } from "../BasicCaption/cueMotion";
import { useWordFonts, wordLook } from "../BasicCaption/wordLook";
import { captionFontFamily, loadCaptionFont } from "../BasicCaption/fonts";
import { resolveBasicCaptionConfig } from "../BasicCaption/config";
import { BASIC_FONTS, basicStyle } from "./catalog";
import { analyzeCueSentiment } from "./emojiSentiment";
import emojiAssets from "./emojiAssets.json";
import type { BasicStyleProps } from "./BasicStyle";
import { SourceVideo } from "../SourceVideo";

// Any emoji the AI picks can be drawn: the ones bundled with the pack load locally, the rest come
// from the same pinned Twemoji release (CC BY 4.0, see emoji/ATTRIBUTION.txt).
const TWEMOJI = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/assets/svg/";
const twemojiUrl = (emoji: string) =>
  `${TWEMOJI}${[...(emoji.includes("\u200d") ? emoji : emoji.replace(/\ufe0f/g, ""))].map((c) => c.codePointAt(0)!.toString(16)).join("-")}.svg`;

const asset = (src: string) =>
  /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

export const CreatorEmoji: React.FC<BasicStyleProps> = ({
  styleId = "creator-emoji",
  sourceConfig,
  styleConfig,
  presentationConfig,
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const blockRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const [loadedFont, setLoadedFont] = useState("");
  const [failedIcon, setFailedIcon] = useState("");
  const preset = basicStyle(styleId);

  const fallbackFonts = useMemo(
    () =>
      /[\u0900-\u097f]/u.test(JSON.stringify(sourceConfig.transcript))
        ? [{ ...BASIC_FONTS.devanagari, weight: 700, italic: false }]
        : [],
    [sourceConfig.transcript],
  );

  const settings = useMemo(() => {
    const input = isRecord(styleConfig) ? styleConfig : {};
    const section = (key: string) => (isRecord(input[key]) ? input[key] : {});
    return {
      ...input,
      font: {
        ...BASIC_FONTS[preset.font],
        weight: preset.weight,
        size: 88,
        color: preset.color,
        lineHeight: 1.15,
        letterSpacing: 0.5,
        textCase: preset.textCase,
        ...section("font"),
      },
      layout: {
        positionX: 0.5,
        positionY: 0.72,
        maxWidth: 0.88,
        safeMargin: 0.05,
        alignment: "center",
        ...section("layout"),
      },
      phrasing: {
        maxWords: preset.maxWords,
        maxCharacters: 40,
        maxDurationMs: 2400,
        maxGapMs: 320,
        lingerMs: 140,
        ...section("phrasing"),
      },
    };
  }, [preset, styleConfig]);

  const compiled = useMemo(
    () => compileBasicCaption(sourceConfig, fps, settings),
    [sourceConfig, fps, settings],
  );

  const { font, layout } = resolveBasicCaptionConfig(settings);
  const fontSrc = (settings.font as { src?: string })?.src ?? BASIC_FONTS[preset.font].src;
  const fontFamily = (settings.font as { family?: string })?.family ?? BASIC_FONTS[preset.font].family;
  const family = captionFontFamily(
    fontSrc ? asset(fontSrc) : "",
    fontFamily,
    font.weight,
    font.italic,
  );

  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    if (!fontSrc) return;
    const handle = delayRender("Loading creator emoji font");
    let cancelled = false;
    let released = false;
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    Promise.all([
      loadCaptionFont(asset(fontSrc), fontFamily, font.weight, font.italic),
      ...fallbackFonts.map((face) =>
        loadCaptionFont(asset(face.src), face.family, face.weight, face.italic),
      ),
    ])
      .catch(() => {
        console.warn("CreatorEmoji: using system font fallback.");
      })
      .finally(() => {
        if (!cancelled) setLoadedFont(family);
        release();
      });
    return () => {
      cancelled = true;
      release();
    };
  }, [delayRender, continueRender, family, fontSrc, fontFamily, font.weight, font.italic, fallbackFonts]);

  const index = getActiveCueIndex(compiled.captions.cues, frame);
  const cue = index >= 0 ? compiled.captions.cues[index] : null;

  const unit = width / 1080;
  const opticalHeight = presentationConfig?.opticalHeight;
  const fontSize = useMemo(() => {
    if (!opticalHeight || typeof document === "undefined" || (fontSrc && loadedFont !== family))
      return font.size * unit;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return font.size * unit;
    context.font = `${font.italic ? "italic " : ""}${font.weight} 100px ${JSON.stringify(family)}, sans-serif`;
    const cap = context.measureText("H").actualBoundingBoxAscent || 72;
    return (opticalHeight * unit * 100) / Math.max(40, cap);
  }, [opticalHeight, unit, font.size, fontSrc, font.italic, font.weight, family, loadedFont]);

  const reducedMotion = presentationConfig?.reducedMotion === true;
  const now = frame * 1000 / fps;
  const settled = useContext(SettledMotionContext);
  const chosenMotion = reducedMotion ? undefined : presentationConfig?.animation;
  const animation = settled ? undefined : chosenMotion;
  const boxes = useWordBoxes(wordsRef, chosenMotion?.unit === "line");
  useWordFonts(presentationConfig?.wordStyles);
  const blockMotion = animation && cue
    ? captionFrame(animation, now, cue.startFrame * 1000 / fps, cue.endFrame * 1000 / fps)
    : undefined;
  const blockWidth = Math.min(width * layout.maxWidth, width * (1 - layout.safeMargin * 2));
  const sentiment = useMemo(() => cue ? analyzeCueSentiment(cue.words) : null, [cue]);
  // The AI read the transcript and placed emojis on the words worth one. Transcripts made before
  // that pass (and the style cards) fall back to the keyword list, but only when a word really matched.
  const aiEmojis = presentationConfig?.emojis;
  const aiPicked = !!aiEmojis && Object.keys(aiEmojis).length > 0;
  const aiWord = aiPicked ? cue?.words.find((word) => aiEmojis![word.id]) : undefined;
  const trigger = aiPicked ? aiWord
    : sentiment?.matched ? cue?.words.find(word => word.id === (sentiment.triggerWordId ?? sentiment.heroWordId)) : undefined;
  const emoji = aiWord ? aiEmojis![aiWord.id] : trigger ? sentiment?.emoji : undefined;
  const heroWordId = aiWord?.id ?? sentiment?.heroWordId;
  const onLayout = presentationConfig?.onLayout;
  const emojiSize = fontSize * 1.4;
  useLayoutEffect(() => {
    const words = wordsRef.current;
    if (words && cue) onLayout?.(words.offsetHeight + emojiSize * 1.2);
  }, [cue, blockWidth, family, loadedFont, fontSize, emojiSize, onLayout]);

  const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  const age = trigger ? (now - trigger.startMs) / 1000 : -1;
  const cueEnd = cue ? cue.endFrame * 1000 / fps : now;
  // A soft spring: grows from nothing, overshoots a touch, settles, then floats gently while it stays.
  const spring = reducedMotion ? 1 : Math.max(0, 1 - Math.exp(-age * 9) * Math.cos(age * 13));
  const tilt = reducedMotion ? 0 : (index % 2 ? 1 : -1) * 16 * Math.exp(-age * 7);
  const float = reducedMotion ? 0 : Math.sin(age * Math.PI * 1.6) * emojiSize * .03 * smooth(age / .5);
  const leave = cue ? reducedMotion ? 1 : smooth((cueEnd - now) / 120) : 0;
  const icon = emoji && (emojiAssets as Record<string, string>)[emoji];
  const iconSrc = emoji ? icon ? asset(`launch-caption-pack/emoji/${icon}`) : twemojiUrl(emoji) : "";
  const showEmoji = !!emoji && age >= 0;
  const accentColor = presentationConfig?.highlights?.color ?? (aiWord ? preset.accent : sentiment?.accentColor) ?? preset.accent;
  const background = sourceConfig.background;
  const keyWordsChosen = Object.values(presentationConfig?.wordStyles ?? {}).some((word) => word.emphasized);

  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "transparent", overflow: "hidden" }}>
    {background?.src && <SourceVideo src={asset(background.src)} muted={background.muted ?? false} volume={background.volume ?? 1}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: background.objectFit ?? "cover" }} />}
    {cue && <div ref={blockRef} data-basic-caption={cue.id} data-basic-effect="creator-emoji"
      style={{ position: "absolute", left: width * clamp(layout.positionX, 0, 1), top: height * layout.positionY,
        transform: `translate(-50%,-50%)${layout.rotation ? ` rotate(${layout.rotation}deg)` : ""} ${blockMotion?.transform ?? ""}`,
        opacity: blockMotion?.opacity, filter: blockMotion?.filter, clipPath: blockMotion?.clipPath, width: blockWidth, paddingTop: emojiSize * 1.15, paddingBottom: fontSize * .2,
        pointerEvents: "none", isolation: "isolate", textAlign: layout.alignment, minWidth: "min-content" }}>
      <div ref={wordsRef} data-caption-box style={{ position: "relative", width: "100%", color: font.color,
        fontFamily: [JSON.stringify(family), ...fallbackFonts.map(face => JSON.stringify(captionFontFamily(asset(face.src), face.family, face.weight, face.italic))), "sans-serif"].join(","),
        fontSize, fontWeight: font.weight, fontStyle: font.italic ? "italic" : "normal", lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing * unit, wordSpacing: font.wordSpacing * unit,
        textTransform: font.textCase === "preserve" ? "none" : font.textCase, whiteSpace: "pre-wrap", overflowWrap: "normal", minWidth: "min-content" }}>
        {showEmoji && presentationConfig?.features?.emoji !== false && <div aria-hidden="true" data-creator-emoji={emoji} data-emoji-word={trigger!.id}
          style={{ position: "absolute", left: "50%", top: -emojiSize * 1.08, width: emojiSize, height: emojiSize, marginLeft: -emojiSize / 2,
            zIndex: 1, opacity: clamp(age / .08, 0, 1) * leave,
            transform: `translateY(${(float + (1 - leave) * emojiSize * .12).toFixed(2)}px) scale(${(spring * (.88 + .12 * leave)).toFixed(4)}) rotate(${tilt.toFixed(2)}deg)`,
            transformOrigin: "50% 80%",
            filter: `drop-shadow(0 ${6 * unit}px ${10 * unit}px rgba(0,0,0,.35))` }}>
          {failedIcon === iconSrc ? <span style={{ display: "grid", width: "100%", height: "100%", placeItems: "center", fontSize: emojiSize * .86, lineHeight: 1 }}>
            {emoji}
          </span> : <Img src={iconSrc} onError={() => setFailedIcon(iconSrc)} style={{ width: "100%", height: "100%" }} />}
        </div>}
        {cue.words.map((word, wordIndex) => {
          // Whole captions and lines bring all of their words in together.
          const together = !!presentationConfig?.animation?.in && presentationConfig.animation.unit !== "word";
          const visible = together || now >= word.startMs;
          const p = reducedMotion || together || settled ? 1 : smooth((now - word.startMs) / 160);
          const spoken = visible && now < word.endMs;
          const edit = presentationConfig?.wordStyles?.[word.id];
          const glowing = presentationConfig?.highlights?.enabled !== false;
          // Once key words exist, only those glow; the guessed word is just for transcripts without any.
          const hero = glowing && (keyWordsChosen ? edit?.emphasized === true : edit?.highlighted !== false && word.id === heroWordId);
          const wordMotion = chosenMotion ? poseOf(chosenMotion, now, cue.words, wordIndex, settled, (other) => boxes[cue.words[other].id], edit?.emphasized, cue.endFrame * 1000 / fps) : undefined;
          const color = presentationConfig?.wordColors?.[word.id] ?? (edit?.overrideColor ? edit.font?.color :
            hero ? edit?.highlight?.color ?? accentColor : font.color) ?? font.color;
          // A gradient picked for this word, for key words, or for the caption fills the letters; a text-shadow
          // would show through clear glyphs, so the lift becomes a drop shadow.
          const legacy = presentationConfig?.wordColors?.[word.id];
          const fill = legacy ? undefined : edit?.overrideColor ? edit.gradient ?? undefined
            : hero ? edit?.keyGradient : presentationConfig?.gradient;
          const fillStyle: React.CSSProperties = fill ? {
            backgroundImage: `linear-gradient(${fill.angle}deg, ${fill.stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ")})`,
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent",
          } : { color };
          return <Fragment key={word.id}>
            <span data-word-id={word.id} data-spoken={spoken || undefined}
              style={{ ...wordLook(edit, unit), display: "inline-block", position: "relative", zIndex: 2, visibility: visible ? edit?.blendPass : "hidden", margin: `0 ${fontSize * .035}px` }}>
              <span style={{ display: "inline-block", ...fillStyle, opacity: wordMotion ? wordMotion.opacity : .35 + .65 * p,
                filter: [fill ? `drop-shadow(0 ${3 * unit}px ${6 * unit}px rgba(0,0,0,.55))` : undefined, wordMotion?.filter].filter(Boolean).join(" ") || undefined,
                clipPath: wordMotion?.clipPath,
                transform: wordMotion ? `${wordMotion.transform} scale(${hero ? 1.06 : 1})` : `translateY(${(1 - p) * fontSize * .22}px) scale(${(.96 + .04 * p) * (hero ? 1.06 : 1)})`,
                WebkitTextStroke: `${preset.stroke}em #121212`, paintOrder: "stroke fill",
                // A soft lift under every word and a faint halo on the key word, never a neon blur.
                textShadow: fill ? undefined : hero && /^#[\da-f]{6}$/i.test(color)
                  ? `0 ${3 * unit}px ${8 * unit}px rgba(0,0,0,.6), 0 0 ${fontSize * .22}px ${color}55`
                  : `0 ${3 * unit}px ${8 * unit}px rgba(0,0,0,.6)` }}>{word.text}</span>
            </span>{wordIndex < cue.words.length - 1 ? " " : null}
          </Fragment>;
        })}
      </div>
    </div>}
  </AbsoluteFill>;
};
