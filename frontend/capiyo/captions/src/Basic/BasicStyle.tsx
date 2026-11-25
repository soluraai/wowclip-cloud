import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { blendPasses, effectsFilter } from "../BasicCaption/wordPresentation";
import { isRecord } from "../CaptionEngine/types";
import {
  BasicCaptionRenderer,
  type BasicCaptionRendererProps,
} from "../BasicCaption/BasicCaptionRenderer";
import { BASIC_FONTS, SCRIPT_FONTS, basicStyle, isSignatureStyleId, type BasicStyleId } from "./catalog";
import { compileBasicCaption } from "../BasicCaption/engine";
import { CaptionsDot, resolveCaptionsDotMetadata } from "../CaptionsDot/CaptionsDot";
import { CreatorEmoji } from "./CreatorEmoji";
import { SignatureCaption } from "./Signature";
import { StyleTwo, resolveStyleTwoMetadata } from "../StyleTwo/StyleTwo";

export type BasicStyleProps = BasicCaptionRendererProps & { styleId?: BasicStyleId | "cinematic-stack" };

/** One renderer and one registry drive Studio, editor playback, and card previews. */
export const BasicStyle: React.FC<BasicStyleProps> = (input) => {
  // Other words Design: every word that isn't a key word (and has no Design of its own) takes it.
  const rest = input.presentationConfig?.restEffects, styles = input.presentationConfig?.wordStyles;
  const transcript = input.sourceConfig.transcript as unknown as { id: string }[];
  const wordStyles = useMemo(() => {
    if (!rest) return styles;
    const next = { ...styles };
    for (const word of transcript ?? []) {
      const own = styles?.[word.id];
      if (!own?.emphasized && !own?.effects) next[word.id] = { ...own, effects: rest };
    }
    return next;
  }, [rest, styles, transcript]);
  const props = useMemo(() => wordStyles === styles ? input : { ...input, presentationConfig: { ...input.presentationConfig, wordStyles } },
    [input, wordStyles, styles]);
  const passes = useMemo(() => blendPasses(props.presentationConfig?.wordStyles), [props.presentationConfig?.wordStyles]);
  if (!passes) return <BasicStyleBody {...props} />;
  return <>
    <BasicStyleBody {...props} presentationConfig={{ ...props.presentationConfig, wordStyles: passes.caption }} />
    <AbsoluteFill style={{ mixBlendMode: passes.blend, visibility: "hidden" }}>
      <BasicStyleBody {...props} presentationConfig={{ ...props.presentationConfig, wordStyles: passes.layer, onLayout: undefined }} />
    </AbsoluteFill>
  </>;
};

const BasicStyleBody: React.FC<BasicStyleProps> = ({ styleId = "clean-subtitles", styleConfig, presentationConfig, ...props }) => {
  const preset = basicStyle(styleId);
  const { width } = useVideoConfig();
  const fallbackFonts = useMemo(() => /[\u0900-\u097f]/u.test(JSON.stringify(props.sourceConfig.transcript))
    ? [{ ...BASIC_FONTS.devanagari, weight: 700, italic: false }] : [], [props.sourceConfig.transcript]);
  const config = useMemo(() => {
    const input = isRecord(styleConfig) ? styleConfig : {};
    const section = (key: string) => isRecord(input[key]) ? input[key] : {};
    return {
      ...input,
      font: { ...BASIC_FONTS[preset.font], weight: preset.weight, size: 88, color: preset.color,
        lineHeight: 1.2, letterSpacing: preset.letterSpacing, wordSpacing: 0, textCase: preset.textCase, ...section("font") },
      layout: { positionX: 0.5, positionY: 0.72, maxWidth: 0.88, safeMargin: 0.05, alignment: "center", rotation: 0, ...section("layout") },
      phrasing: { maxWords: preset.maxWords, maxCharacters: 38, maxDurationMs: 2800, maxGapMs: 320, lingerMs: 120, ...section("phrasing") },
    };
  }, [preset, styleConfig]);

  // Styles built on the Style Two engine read key words from the source's auto plan.
  const keyWordIds = Object.entries(presentationConfig?.wordStyles ?? {})
    .filter(([, word]) => word.emphasized).map(([id]) => id).join(" ");
  const editorConfig = isRecord(styleConfig) ? styleConfig : {};
  const editorPaged = isRecord(editorConfig.phrasing) && editorConfig.phrasing.paged === true;
  const editorCase = isRecord(editorConfig.font) ? editorConfig.font.textCase : undefined;
  const keyWordSource = useMemo(() => {
    if (!editorPaged) return props.sourceConfig;
    const ids = new Set(keyWordIds.split(" "));
    const cased = (text: string) => styleId !== "style-two" ? text
      : editorCase === "uppercase" ? text.toUpperCase() : editorCase === "lowercase" ? text.toLowerCase() : text;
    return {
      ...props.sourceConfig,
      paged: true,
      keyWordsOnly: keyWordIds.length > 0,
      engine: { maxGapMs: 3000, maxPlainWords: 6, maxPlainCharacters: 60, maxPlainDurationMs: 4000 },
      transcript: (props.sourceConfig.transcript as unknown as Record<string, unknown>[]).map((word) => ({
        ...word, hero: undefined, emphasis: ids.has(String(word.id)), text: cased(String(word.text)),
      })),
    };
  }, [props.sourceConfig, editorPaged, editorCase, keyWordIds, styleId]);

  // The editor sends `paged`: it has already split the transcript into pages and picked key
  // words. Style cards and Studio don't, so they keep each renderer's own defaults.
  const paged = isRecord(config.phrasing) && (config.phrasing as { paged?: unknown }).paged === true;
  const textCase = String(config.font.textCase);

  if (styleId === "captions-dot") return <CaptionsDot sourceConfig={props.sourceConfig} presentationConfig={{ fallbackFonts, ...presentationConfig }}
    positionX={config.layout.positionX as number} positionY={config.layout.positionY as number} rotation={Number(config.layout.rotation ?? 0)}
    fontSrc={config.font.src as string} wordSlide config={{
      style: { fontFamily: config.font.family as string, fontWeight: config.font.weight as number,
        baseFontSize: config.font.size as number, textColor: config.font.color as string, casing: textCase,
        letterSpacing: Number(config.font.letterSpacing ?? 0) / Math.max(1, Number(config.font.size)),
        maxWidth: config.layout.maxWidth as number, symbolColor: presentationConfig?.highlights?.color ?? "#e2fb00",
        colorSymbols: presentationConfig?.highlights?.enabled !== false,
        lineHeight: Number(config.font.lineHeight), wordSpacing: Number(config.font.wordSpacing ?? 0) },
      grouping: { mode: paged ? "pages" : "single-word" }, animation: { type: "none" },
    }} />;

  const fx = presentationConfig?.textEffects;
  const layered = (node: React.ReactNode) => fx ? <AbsoluteFill style={{ opacity: fx.opacity, filter: effectsFilter(fx, width / 1080),
    mixBlendMode: fx.blend && fx.blend !== "normal" ? fx.blend as React.CSSProperties["mixBlendMode"] : undefined }}>{node}</AbsoluteFill> : node;
  if (styleId === "creator-emoji") {
    return layered(<CreatorEmoji styleId={styleId} sourceConfig={props.sourceConfig} styleConfig={styleConfig} presentationConfig={presentationConfig} />);
  }
  if (styleId === "style-two") {
    const emphasis = presentationConfig?.emphasis;
    const preset = SCRIPT_FONTS[(emphasis?.font ?? "caveat") as keyof typeof SCRIPT_FONTS] ?? SCRIPT_FONTS.caveat;
    // A key word font picked from the full list replaces the script.
    const picked = presentationConfig?.parts?.main;
    const script = picked?.family ? { family: picked.family, src: picked.src, weight: picked.weight ?? 400, style: picked.italic ? "italic" : "normal" }
      : { ...preset, style: "normal" };
    const size = Number(config.font.size);
    return layered(<StyleTwo sourceConfig={keyWordSource} reducedMotion={presentationConfig?.reducedMotion} animation={presentationConfig?.animation} wordStyles={presentationConfig?.wordStyles} styleConfig={paged ? {
      fonts: {
        body: { family: config.font.family, src: config.font.src, weight: config.font.weight, style: "normal" },
        highlight: { family: script.family, src: script.src, weight: script.weight, style: script.style },
      },
      layout: { fontSize: size, minFontSize: Math.min(size, Math.max(32, size * 0.78)), heroScale: 1.75 * (emphasis?.scale ?? 1),
        positionX: config.layout.positionX, positionY: config.layout.positionY, maxWidth: config.layout.maxWidth,
        maxWords: 6, maxCharacters: 60, maxDurationMs: 4000,
        wordGap: 0.22 + Number(config.font.wordSpacing ?? 0) / Math.max(1, size) },
      // The glow is part of the key word, so it shares the key word's color.
      colors: { text: config.font.color, highlight: emphasis?.color ?? "#ffffff", glow: emphasis?.color ?? "#ffffff" },
      glow: { enabled: presentationConfig?.features?.glow !== false },
    } : styleConfig} />);
  }
  if (isSignatureStyleId(styleId)) {
    const naturalWrap = isRecord(styleConfig) && typeof styleConfig.naturalWrap === "boolean"
      ? styleConfig.naturalWrap : !!presentationConfig?.onLayout;
    return layered(<SignatureCaption styleId={styleId} sourceConfig={keyWordSource}
      font={{ family: config.font.family as string, src: config.font.src as string | undefined,
        weight: Number(config.font.weight), size: Number(config.font.size), color: String(config.font.color),
        textCase, letterSpacing: Number(config.font.letterSpacing ?? 0) }}
      layout={{ positionX: Number(config.layout.positionX), positionY: Number(config.layout.positionY),
        maxWidth: Number(config.layout.maxWidth), rotation: Number(config.layout.rotation ?? 0) }}
      accent={presentationConfig?.highlights?.backgroundColor ?? preset.accent}
      accent2={presentationConfig?.highlights?.color}
      keyColor={presentationConfig?.emphasis?.color}
      keyWordIds={keyWordIds}
      gradient={presentationConfig?.gradient}
      shape={presentationConfig?.emphasis?.shapeColorMode === "gradient" && presentationConfig.emphasis.shapeGradientStops?.length
        ? { stops: presentationConfig.emphasis.shapeGradientStops, angle: presentationConfig.emphasis.shapeGradientAngle ?? 90 } : undefined}
      wordStyles={presentationConfig?.wordStyles}
      animation={presentationConfig?.animation}
      settled={naturalWrap} opticalHeight={presentationConfig?.opticalHeight} reducedMotion={presentationConfig?.reducedMotion}
      backgroundColor={presentationConfig?.backgroundColor} />);
  }

  return <BasicCaptionRenderer {...props} styleConfig={config} presentationConfig={{
    centerAnchor: true,
    motion: preset.motion,
    fallbackFonts,
    highlights: { enabled: true, color: preset.effect === "pill" ? "#ffffff" : preset.accent,
      backgroundColor: preset.accent, mode: preset.effect === "pill" ? "fill" : "text", scale: 1 },
    ...presentationConfig,
    activeWord: preset.effect !== "plain",
    basicEffect: preset.effect,
    reveal: preset.reveal,
    // Editor drafts carry the stroke in their Design settings, so turning it off really removes it.
    stroke: presentationConfig?.textEffects ? 0 : preset.stroke,
    strokeColor: preset.strokeColor,
    plate: preset.plate,
    plateColor: presentationConfig?.highlights?.backgroundColor ?? preset.plateColor,
    stacked: preset.stacked,
    underlineActive: preset.effect === "underline",
  }} />;
};

export const resolveBasicStyleMetadata = ({ props }: { props: BasicStyleProps }) => {
  if (props.styleId === "captions-dot") return resolveCaptionsDotMetadata({ props: { sourceConfig: props.sourceConfig } });
  if (isSignatureStyleId(props.styleId)) return resolveStyleTwoMetadata({ props: { sourceConfig: props.sourceConfig } });
  if (props.styleId === "style-two") return resolveStyleTwoMetadata({ props: { sourceConfig: props.sourceConfig, styleConfig: props.styleConfig } });
  const preset = basicStyle(props.styleId ?? "clean-subtitles");
  const input = isRecord(props.styleConfig) ? props.styleConfig : {};
  const phrasing = isRecord(input.phrasing) ? input.phrasing : {};
  return { fps: 30, durationInFrames: compileBasicCaption(props.sourceConfig, 30, {
    ...input, phrasing: { maxWords: preset.maxWords, maxCharacters: 38, maxDurationMs: 2800, maxGapMs: 320, lingerMs: 120, ...phrasing },
  }).durationInFrames };
};
