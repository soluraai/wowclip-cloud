import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { CaptionLayer, dropShadows, wordLooksOf } from "./CaptionLayer";
import { blendPasses } from "../BasicCaption/wordPresentation";
import { growWordStyles, HERO_SHARES, planHeroes, type HeroPlan } from "../Premium/heroPlan";
import { PlainLayers, usePlainFont } from "../Premium/PlainLine";
import { PartSizesContext, usePartSizes } from "../Premium/parts";
import { LineRevealContext, revealChunks } from "./reveal";
import { isRecord } from "../CaptionEngine/types";
import { EditorialSelect, resolveEditorialSelectMetadata, type EditorialSelectProps } from "../EditorialSelect/EditorialSelect";
import { DoubleTrouble, Shamani, resolveKalakarCaptionMetadata } from "../KalakarCaptions";
import { SundayScript, RedlineWordBox, GoldenAura, resolveClucapMetadata } from "../ClucapPack/ClucapCaptions";
import { PixelatedWord, resolvePixelatedWordMetadata } from "../PixelatedWord";
import { BecomesNotes, resolveBecomesNotesMetadata } from "../BecomesNotes";
import { Sara, resolveSaraMetadata } from "../Sara/Sara";
import { CoralStory, resolveCoralStoryMetadata } from "../CoralStory/CoralStory";
import { SerifGlow, resolveSerifGlowMetadata } from "../SerifGlow/SerifGlow";
import { BlendCursor, resolveBlendCursorMetadata } from "../BlendCursor";
import { Fourfold, resolveFourfoldMetadata } from "../Fourfold";
import { StyleThree, resolveStyleThreeMetadata } from "../StyleThree/StyleThree";
import { ViralLockup, resolveViralLockupMetadata } from "../ViralLockup";
import { KineticStyle, resolveKineticMetadata } from "./kinetic/KineticStyle";
import { CuratedCaption, resolveCuratedMetadata } from "../Curated/CuratedCaption";
import { BasicStyle, resolveBasicStyleMetadata } from "../Basic/BasicStyle";
import { RevealBar } from "../RevealBar/RevealBar";
import { BlockPoster } from "../BlockPoster/BlockPoster";
import type { BasicCaptionRendererProps } from "../BasicCaption/BasicCaptionRenderer";
import { SourceVideo } from "../SourceVideo";

/** One color for a paint: a solid color, or a gradient's first stop. */
const solidPaint = (paint?: { color?: string; gradient?: { stops: { color: string; position: number }[] } }) =>
  paint?.gradient ? [...paint.gradient.stops].sort((a, b) => a.position - b.position)[0]?.color : paint?.color;

export type StandardStyleProps = BasicCaptionRendererProps & { styleId?: string };

const StandardEditorialSelect: React.FC<{
  sourceConfig: StandardStyleProps["sourceConfig"];
  styleConfig: StandardStyleProps["styleConfig"];
  presentationConfig: StandardStyleProps["presentationConfig"];
  naturalWrap: boolean;
}> = ({ sourceConfig, styleConfig, presentationConfig, naturalWrap }) => {
  const { width } = useVideoConfig();
  const config = useMemo<EditorialSelectProps["styleConfig"]>(() => {
    const input = isRecord(styleConfig) ? styleConfig : {};
    const font = isRecord(input.font) ? input.font : {};
    const layout = isRecord(input.layout) ? input.layout : {};
    const number = (value: unknown) => typeof value === "number" ? value : undefined;
    const text = (value: unknown) => typeof value === "string" ? value : undefined;
    return {
      fontSrc: text(font.src),
      fontFamily: text(font.family),
      fontWeight: number(font.weight),
      fontItalic: font.italic === true,
      fontSize: number(font.size) !== undefined ? Number(font.size) * 2 / 3 : undefined,
      textColor: text(font.color),
      letterSpacing: number(font.letterSpacing) !== undefined ? Number(font.letterSpacing) * 2 / 3 : undefined,
      lineHeight: number(font.lineHeight),
      phrasing: isRecord(input.phrasing) ? input.phrasing as NonNullable<EditorialSelectProps["styleConfig"]>["phrasing"] : undefined,
      positionX: number(layout.positionX),
      positionY: number(layout.positionY),
      maxWidth: number(layout.maxWidth),
      topScrimOpacity: 0,
      backgroundColor: presentationConfig?.backgroundColor,
      opticalHeight: presentationConfig?.opticalHeight ? presentationConfig.opticalHeight * width / 1080 : undefined,
      naturalWrap,
      onLayout: presentationConfig?.onLayout,
      selectionStrokeWidth: naturalWrap ? 720 / width : 1.8,
      // Frame color is the key word color; Box color, the accent, tints the inside of the frame.
      selectionColor: presentationConfig?.emphasis?.color ?? presentationConfig?.highlights?.color,
      // Until a box color is picked (Focus Frame's own blue), the box keeps following the frame color.
      boxColor: presentationConfig?.box?.color ?? (presentationConfig?.highlights?.backgroundColor && presentationConfig.highlights.backgroundColor.toLowerCase() !== "#4777df"
        ? presentationConfig.highlights.backgroundColor : undefined),
      showSelection: presentationConfig?.highlights?.enabled,
      reducedMotion: presentationConfig?.reducedMotion,
      keyFont: presentationConfig?.parts?.main?.family && presentationConfig.parts.main.src
        ? { family: presentationConfig.parts.main.family, src: presentationConfig.parts.main.src,
            weight: presentationConfig.parts.main.weight ?? 400, italic: presentationConfig.parts.main.italic === true } : undefined,
      keyScale: presentationConfig?.emphasis?.scale,
      frameGradient: presentationConfig?.emphasis?.colorMode === "gradient" && presentationConfig.emphasis.gradientStops?.length
        ? { stops: presentationConfig.emphasis.gradientStops, angle: presentationConfig.emphasis.gradientAngle ?? 90 } : undefined,
      box: presentationConfig?.box,
    };
  }, [styleConfig, presentationConfig, width, naturalWrap]);

  return <EditorialSelect sourceConfig={sourceConfig} styleConfig={config} />;
};

/** Serif Glow measures again whenever its config object changes, so that object has to stay stable. */
const StandardSerifGlow: React.FC<{
  sourceConfig: StandardStyleProps["sourceConfig"];
  presentationConfig: StandardStyleProps["presentationConfig"];
  preview: boolean;
  positionY: number;
  maxWidth: number;
  naturalWrap: boolean;
}> = ({ sourceConfig, presentationConfig, preview, positionY, maxWidth, naturalWrap }) => {
  const onLayout = presentationConfig?.onLayout;
  // The glowing words take the key word color picked in the editor.
  // Older projects saved Serif Glow's former pastel yellows; those read grey, so they become its bright yellow.
  const picked = presentationConfig?.emphasis?.color;
  const accent = picked && !["#ffe08a", "#ffd21f", "#ffe36b"].includes(picked.toLowerCase()) ? picked : "#ffe600";
  // The normal words take the text color picked for them (a gradient's first color).
  const rest = presentationConfig?.paints?.rest;
  const textColor = rest?.gradient ? [...rest.gradient.stops].sort((a, b) => a.position - b.position)[0]?.color : rest?.color;
  const styleConfig = useMemo(() => ({
    normalSize: preview ? 40 : 60,
    highlightSize: preview ? 48 : 72,
    positionY, maxWidth, onLayout, naturalWrap, accent, textColor,
  }), [preview, positionY, maxWidth, onLayout, naturalWrap, accent, textColor]);
  return <SerifGlow sourceConfig={sourceConfig as React.ComponentProps<typeof SerifGlow>["sourceConfig"]}
    styleConfig={styleConfig} presentationConfig={presentationConfig} />;
};

const StandardCaptions: React.FC<StandardStyleProps> = ({ styleId = "editorial-select", sourceConfig, styleConfig, presentationConfig }) => {
  const preview = !!presentationConfig?.onLayout;
  const layout = isRecord(styleConfig) && isRecord(styleConfig.layout) ? styleConfig.layout : {};
  const font = isRecord(styleConfig) && isRecord(styleConfig.font) ? styleConfig.font : {};
  // The layer scales the caption afterwards, so a bigger caption is laid out narrower to stay on the frame.
  const fit = (maxWidth: number) => typeof layout.fitWidth === "number" ? Math.min(maxWidth, layout.fitWidth) : maxWidth;
  // Card thumbnails stay centered; actual video captions use the editor's
  // lower-screen position, matching Focus Frame's default placement.
  const positionY = preview ? .5 : typeof layout.positionY === "number" && Number.isFinite(layout.positionY)
    ? Math.max(.2, Math.min(.86, layout.positionY))
    : styleId === "crimson-rise" || styleId === "pocket-flow" || styleId === "prism-relay" ? .7 : .82;
  // The wrap layout doubles as the settled look of a template card, and the
  // exact real-captions word animation lives outside it. A card preview
  // therefore passes an explicit naturalWrap to switch between the settled
  // chunk and the real playback; callers without one keep the card default.
  const wrap = isRecord(styleConfig) && typeof styleConfig.naturalWrap === "boolean"
    ? (styleConfig.naturalWrap as boolean)
    : preview;

  if (styleId === "red-wipe" || styleId === "creator" || styleId === "hind" || styleId === "luma-script" || styleId === "relay-flow") return <CuratedCaption variant={styleId}
    sourceConfig={sourceConfig} presentationConfig={presentationConfig}
    styleConfig={{ ...(isRecord(styleConfig) ? styleConfig : {}), naturalWrap: wrap }} />;

  if (styleId === "reveal-bar" || styleId === "block-poster") {
    const Renderer = styleId === "reveal-bar" ? RevealBar : BlockPoster;
    return <Renderer sourceConfig={sourceConfig} presentationConfig={presentationConfig}
      styleConfig={{ ...(isRecord(styleConfig) ? styleConfig : {}), naturalWrap: wrap }} />;
  }

  if (styleId === "cinematic-stack") return <BasicStyle styleId="cinematic-stack" sourceConfig={sourceConfig} presentationConfig={presentationConfig}
    styleConfig={{ ...(isRecord(styleConfig) ? styleConfig : {}), naturalWrap: wrap }} />;

  if (styleId === "og") return <ViralLockup variant="og" sourceConfig={sourceConfig}
    presentationConfig={presentationConfig} styleConfig={{ positionY, maxWidth: fit(.76),
      positionX: preview ? .5 : typeof layout.positionX === "number" ? layout.positionX : .5,
      fontSize: preview ? 90 : typeof font.size === "number" ? font.size : 108, naturalWrap: wrap }} />;

  if (styleId === "fourfold") {
    return <Fourfold sourceConfig={sourceConfig} presentationConfig={presentationConfig}
      styleConfig={{ lines: 4, naturalWrap: wrap, positionY,
        positionX: preview ? .5 : typeof layout.positionX === "number" ? layout.positionX : .5,
        maxWidth: preview ? .65 : typeof layout.maxWidth === "number" ? layout.maxWidth : .6,
      }} />;
  }

  if (styleId === "crimson-rise" || styleId === "pocket-flow" || styleId === "prism-relay") {
    return <KineticStyle variant={styleId} sourceConfig={sourceConfig} presentationConfig={presentationConfig}
      styleConfig={{ naturalWrap: wrap, positionY,
        positionX: preview ? .5 : typeof layout.positionX === "number" ? layout.positionX : .5,
        maxWidth: typeof layout.maxWidth === "number" ? layout.maxWidth : .74,
      }} />;
  }

  if (styleId === "blend-cursor") {
    return <BlendCursor sourceConfig={sourceConfig} presentationConfig={presentationConfig}
      reducedMotion={presentationConfig?.reducedMotion}
      styleConfig={{ naturalWrap: wrap, onLayout: presentationConfig?.onLayout,
        inkLayer: isRecord(styleConfig) && (styleConfig.inkLayer === "only" || styleConfig.inkLayer === "skip") ? styleConfig.inkLayer : undefined,
        // Actual captions keep Luxe's original size and position. Only the
        // library miniature uses a compact centered presentation.
        ...(preview ? { positionY: .5, fontSize: 62, scriptSize: 36, maxWidth: .84 } : { positionY, maxWidth: fit(.84) }),
      }} />;
  }

  if (styleId === "redline-word-box" || styleId === "golden-aura") {
    const Renderer = styleId === "redline-word-box" ? RedlineWordBox : GoldenAura;
    return <Renderer sourceConfig={sourceConfig}
      styleConfig={{ fontSize: preview ? 44 : styleId === "golden-aura" ? 62 : 54, positionY, maxWidth: fit(.9),
        naturalWrap: wrap, onLayout: presentationConfig?.onLayout }}
      presentationConfig={presentationConfig} reducedMotion={presentationConfig?.reducedMotion} />;
  }

  if (styleId === "double-trouble") {
    return <DoubleTrouble
      sourceConfig={sourceConfig}
      styleConfig={{
        fontSize: preview ? 44 : 53,
        positionY,
        maxWidth: fit(.92),
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
        lineWords: isRecord(layout.lineWords) ? layout.lineWords as { top?: number; bottom?: number } : undefined,
      }}
      presentationConfig={presentationConfig}
      reducedMotion={presentationConfig?.reducedMotion}
    />;
  }

  if (styleId === "mumbai-script") {
    const mumbaiFonts = (body: string | undefined, parts: import("../Premium/parts").PremiumParts | undefined) => {
      const face = (look?: { family?: string; src?: string; weight?: number; italic?: boolean }) => look?.family && look.src
        ? { family: look.family, src: look.src, weight: look.weight ?? 400, style: look.italic ? "italic" : "normal" } : undefined;
      const gold = face(parts?.main) ?? (body ? { src: body } : undefined), script = face(parts?.script);
      return gold || script ? { ...(gold ? { body: gold } : {}), ...(script ? { highlight: script } : {}) } : undefined;
    };
    // Mumbai keeps its own appearance defaults (Poppins 800 caps over Kaushan
    // Script); only the editor font, size, colour and placement flow in. Card
    // previews center the lockup while real captions use the editor position.
    const src = typeof font.src === "string" ? font.src : undefined;
    const size = typeof font.size === "number" && Number.isFinite(font.size) ? font.size : undefined;
    // The script line takes the color picked for it (older projects kept it in the caption's text color).
    const color = presentationConfig?.parts?.script?.color ?? (typeof font.color === "string" ? font.color : undefined);
    return <StyleThree
      sourceConfig={sourceConfig}
      reducedMotion={presentationConfig?.reducedMotion}
      styleConfig={{
        // Gold line and script line each take the font picked for them; Font Family still sets the gold line.
        fonts: mumbaiFonts(src, presentationConfig?.parts),
        layout: {
          fontSize: size,
          positionX: typeof layout.positionX === "number" ? layout.positionX : undefined,
          positionY: preview ? .5 : typeof layout.positionY === "number" ? layout.positionY : undefined,
          maxWidth: typeof layout.maxWidth === "number" ? layout.maxWidth : undefined,
        },
        colors: color ? { script: color } : undefined,
        naturalWrap: wrap,
      }}
    />;
  }

  if (styleId === "sunday-script") {
    return <SundayScript
      sourceConfig={sourceConfig}
      styleConfig={{
        fontSize: preview ? 44 : 58,
        positionY,
        maxWidth: fit(.92),
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
      }}
      presentationConfig={presentationConfig}
      reducedMotion={presentationConfig?.reducedMotion}
    />;
  }

  if (styleId === "pixelated-word") {
    return <PixelatedWord
      sourceConfig={sourceConfig}
      styleConfig={{
        fontSize: preview ? 44 : 56,
        positionY,
        maxWidth: fit(.92),
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
      }}
      presentationConfig={presentationConfig}
      reducedMotion={presentationConfig?.reducedMotion}
    />;
  }

  if (styleId === "shamani") {
    return <Shamani
      sourceConfig={sourceConfig}
      styleConfig={{
        fontSize: preview ? 44 : 56,
        positionY,
        maxWidth: fit(.92),
        glow: 1,
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
      }}
      presentationConfig={presentationConfig}
      reducedMotion={presentationConfig?.reducedMotion}
    />;
  }

  if (styleId === "becomes-notes") {
    return <BecomesNotes
      sourceConfig={sourceConfig}
      styleConfig={{
        fontSize: preview ? 44 : 84,
        positionY,
        maxWidth: fit(.92),
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
      }}
      presentationConfig={presentationConfig}
      reducedMotion={presentationConfig?.reducedMotion}
    />;
  }

  if (styleId === "sara") {
    return <Sara
      sourceConfig={sourceConfig}
      styleConfig={{
        fontSize: preview ? 44 : 54,
        positionY,
        maxWidth: fit(.92),
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
      }}
      presentationConfig={presentationConfig}
    />;
  }

  if (styleId === "coral-story") {
    return <CoralStory
      sourceConfig={sourceConfig}
      styleConfig={{
        // Coral uses 1920px design units; retain the same readable scale in
        // the miniature card and the editor instead of shrinking playback.
        fontSize: preview ? 112 : 140,
        positionY,
        maxWidth: fit(.92),
        soundEnabled: false,
        // Text takes the color picked for it; the stamp and key word blocks take the key word color.
        ...(solidPaint(presentationConfig?.paints?.rest) ? { ink: solidPaint(presentationConfig?.paints?.rest) } : {}),
        ...(solidPaint(presentationConfig?.paints?.main) ? { coral: solidPaint(presentationConfig?.paints?.main) } : {}),
        onLayout: presentationConfig?.onLayout,
        naturalWrap: wrap,
      }}
      presentationConfig={presentationConfig}
    />;
  }

  if (styleId === "serif-glow") {
    return <StandardSerifGlow sourceConfig={sourceConfig} presentationConfig={presentationConfig}
      preview={preview} positionY={positionY} maxWidth={fit(.92)} naturalWrap={wrap} />;
  }

  return (
    <StandardEditorialSelect
      sourceConfig={sourceConfig}
      styleConfig={styleConfig}
      presentationConfig={presentationConfig}
      naturalWrap={wrap}
    />
  );
};

/**
 * In the editor the video sits on its own, and the caption on a layer above it. That single layer
 * gives every renderer the same move, resize, tilt and motion without touching its typography.
 */
export const StandardStyle: React.FC<StandardStyleProps> = (props) => {
  const { sourceConfig, styleConfig, presentationConfig } = props;
  const { width, height } = useVideoConfig();
  const input = isRecord(styleConfig) ? styleConfig : {};
  const layout = isRecord(input.layout) ? input.layout : {};
  const font = isRecord(input.font) ? input.font : {};
  const editor = layout.editor === true;
  const marked = (rule: (word: { emphasized?: boolean; highlighted?: boolean }) => boolean | undefined) =>
    Object.entries(presentationConfig?.wordStyles ?? {}).filter(([, word]) => rule(word)).map(([id]) => id).join(" ");
  const keyWords = marked(word => word.emphasized), neverWords = marked(word => word.highlighted === false);
  const share = editor && props.styleId && !presentationConfig?.onLayout ? HERO_SHARES[props.styleId] : undefined;
  const wholeChunk = layout.reveal === "chunk";
  const revealWords = Number(layout.revealWords ?? 5);
  const textCase = layout.textCase;
  // Reveals move when a word appears; its real start still drives anything that follows speech.
  const ownEntrance = layout.ownEntrance === true;
  const planned = useMemo(() => {
    if (!editor) return { source: sourceConfig, plain: [], grow: undefined };
    const ids = new Set(keyWords.split(" "));
    const words = (sourceConfig.transcript as unknown as (Record<string, unknown> & { startMs: number; endMs: number })[])
      .map((word) => ({
        ...word,
        text: textCase === "uppercase" ? String(word.text).toUpperCase() : textCase === "lowercase" ? String(word.text).toLowerCase() : word.text,
        ...(typeof word.mix === "string" ? { mix: textCase === "uppercase" ? word.mix.toUpperCase() : textCase === "lowercase" ? word.mix.toLowerCase() : word.mix } : {}),
        hero: undefined,
        emphasis: ids.has(String(word.id)),
      }));
    // Chunks without a main word become plain lines, so the big treatment stays special.
    const plan = share ? planHeroes(words as unknown as HeroPlan["transcript"], ids, new Set(neverWords.split(" ")), share, revealWords) : undefined;
    const shown = (plan?.transcript ?? words) as typeof words;
    return {
      source: { ...sourceConfig, background: undefined,
        transcript: wholeChunk ? revealChunks(shown, revealWords) : shown } as unknown as typeof sourceConfig,
      plain: (plan?.plain ?? []).map(page => wholeChunk ? { ...page, words: page.words.map(word => ({ ...word, startMs: page.startMs })) } : page),
      grow: plan?.grow,
    };
  }, [editor, sourceConfig, keyWords, neverWords, share, wholeChunk, revealWords, textCase]);
  const source = planned.source;
  // Normal lines take the font and color picked for them; older picks for the helper text no longer leak in.
  const plainParts = useMemo(() => presentationConfig?.parts?.plain ? { plain: presentationConfig.parts.plain } : undefined, [presentationConfig?.parts?.plain]);
  const plainFont = usePlainFont(share ? props.styleId : undefined, presentationConfig?.fallbackFonts, plainParts);
  // A short main word is drawn bigger than the design's size, so the helper lines never outweigh it (heroPlan.ts).
  const grownStyles = useMemo(() => growWordStyles(presentationConfig?.wordStyles, planned.grow), [presentationConfig?.wordStyles, planned.grow]);
  const sizes = usePartSizes(presentationConfig && { ...presentationConfig, wordStyles: grownStyles });
  const wordStyles = presentationConfig?.wordStyles;
  // Blended key words are drawn again alone on a layer that blends with the video, and hidden in the caption.
  const passes = useMemo(() => blendPasses(wordStyles), [wordStyles]);
  const wordLooks = useMemo(() => wordLooksOf(passes?.caption ?? wordStyles, width / 1080 / Number(layout.scale ?? 1)), [passes, wordStyles, width, layout.scale]);
  const layerLooks = useMemo(() => passes && wordLooksOf(passes.layer, width / 1080 / Number(layout.scale ?? 1)), [passes, width, layout.scale]);
  const roleFx = presentationConfig?.roleEffects;
  const roleLooks = useMemo(() => {
    if (!roleFx) return undefined;
    const unit = width / 1080 / Number(layout.scale ?? 1);
    return Object.fromEntries(Object.entries(roleFx).flatMap(([role, fx]) => fx ? [[role, { filter: dropShadows(fx, unit), opacity: fx.opacity }]] : []));
  }, [roleFx, width, layout.scale]);
  const picked = presentationConfig?.paints, painted = presentationConfig?.paintWords?.join(" ") ?? "";
  const paints = useMemo(() => ({ main: painted.includes("main") ? picked?.main : undefined, rest: painted.includes("rest") ? picked?.rest : undefined }),
    [picked, painted]);
  const spokenMs = useMemo(() => ownEntrance
    ? Object.fromEntries((sourceConfig.transcript as unknown as { id: string; startMs: number }[]).map((word) => [word.id, word.startMs]))
    : undefined, [ownEntrance, sourceConfig]);
  if (!editor) {
    // Style cards play the style's default motion and reveal through the same layer as the editor.
    const cardMotion = presentationConfig?.reducedMotion ? undefined : presentationConfig?.animation;
    if (!cardMotion && layout.reveal !== "line" && !paints.main && !paints.rest) return <StandardCaptions {...props} />;
    return <LineRevealContext.Provider value={layout.reveal === "line"}>
      <CaptionLayer origin="50% 50%" transform="" animation={cardMotion} paints={paints}><StandardCaptions {...props} /></CaptionLayer>
    </LineRevealContext.Provider>;
  }

  const anchorY = Number(layout.anchorY ?? 0.82);
  const y = Number(layout.positionY ?? anchorY);
  const scale = Number(layout.scale ?? 1);
  // The caption's box, as drawn on the frame. Moving sideways stops once that box meets the frame's
  // edge, so a caption placed left or right is never cut off.
  const boxWidth = props.styleId === "og" ? 0.94 : Number(layout.boxWidth ?? 0.94);
  const fitWidth = Math.min(0.94, boxWidth) / scale;
  // The caption's middle goes exactly where the user put it.
  const x = Number(layout.positionX ?? 0.5);
  const place = {
    origin: `50% ${anchorY * 100}%`,
    transform: `translate(${(x - 0.5) * width}px, ${(y - anchorY) * height}px) rotate(${Number(layout.rotation ?? 0)}deg) scale(${scale})`,
    animation: presentationConfig?.reducedMotion ? undefined : presentationConfig?.animation,
  };
  // OG has no box width of its own (boxWidth above); one carried over from another style must not squeeze it.
  const caption = (inkLayer?: "only" | "skip") => <PartSizesContext.Provider value={sizes}><LineRevealContext.Provider value={layout.reveal === "line"}>
    <StandardCaptions {...props} sourceConfig={source}
      presentationConfig={{ ...presentationConfig, wordStyles: grownStyles, backgroundColor: "transparent", spokenMs }}
      styleConfig={{ ...input, inkLayer, layout: { ...layout, positionX: 0.5, positionY: anchorY, fitWidth,
        maxWidth: Math.min(Number(layout.maxWidth ?? 0.78), fitWidth) },
        // The layer scales the caption, so each style keeps its own designed size.
        font: { ...font, size: props.styleId === "editorial-select" || props.styleId === "cinematic-stack" ? 88 : undefined } }} />
  </LineRevealContext.Provider></PartSizesContext.Provider>;
  const fx = presentationConfig?.textEffects;
  // Sizes are on the 1080 canvas; the layer's scale must not change them as the caption is resized.
  const unit = width / 1080 / Number(layout.scale ?? 1);
  const look: React.CSSProperties = {
    opacity: fx?.opacity,
    filter: dropShadows(fx, unit),
    mixBlendMode: fx?.blend && fx.blend !== "normal" ? fx.blend as React.CSSProperties["mixBlendMode"] : undefined,
  };
  // A transformed layer blends only with itself, so Blend Cursor's ink needs one of its own to reach the video.
  const blendsWithVideo = props.styleId === "blend-cursor";
  const video = sourceConfig.background;
  const src = video?.src;
  return <AbsoluteFill style={{ backgroundColor: "#000000", overflow: "hidden" }}>
    {src ? <SourceVideo src={/^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src)} muted={video?.muted ?? false}
      volume={video?.volume ?? 1} style={{ width: "100%", height: "100%", objectFit: video?.objectFit ?? "cover" }} /> : null}
    <PlainLayers pages={planned.plain} place={{ ...place, look, keyWords, wordLooks, paints, roleLooks }}
      ink={blendsWithVideo ? caption("only") : undefined} inkLook={{ opacity: fx?.opacity }}
      plain={{ font: { ...plainFont, size: plainFont.size * sizes.plain }, anchorY, words: sizes.words,
        width: Math.min(0.8, fitWidth), reduced: presentationConfig?.reducedMotion }}>{caption(blendsWithVideo ? "skip" : undefined)}</PlainLayers>
    {passes && layerLooks && <AbsoluteFill style={{ mixBlendMode: passes.blend, visibility: "hidden" }}>
      <PlainLayers pages={planned.plain} place={{ ...place, look, keyWords, wordLooks: layerLooks, paints, roleLooks }}
        plain={{ font: { ...plainFont, size: plainFont.size * sizes.plain }, anchorY, words: sizes.words,
          width: Math.min(0.8, fitWidth), reduced: presentationConfig?.reducedMotion }}>{caption()}</PlainLayers>
    </AbsoluteFill>}
  </AbsoluteFill>;
};

export const resolveStandardStyleMetadata = ({ props }: { props: StandardStyleProps }) => {
  switch (props.styleId) {
    case "cinematic-stack":
      return resolveBasicStyleMetadata({ props: { ...props, styleId: "cinematic-stack" } });
    case "reveal-bar":
    case "block-poster":
    case "luma-script":
    case "red-wipe":
    case "creator":
    case "hind":
    case "relay-flow":
      return resolveCuratedMetadata({ props });
    case "crimson-rise":
    case "pocket-flow":
    case "prism-relay":
      return resolveKineticMetadata({ props });
    case "fourfold":
      return resolveFourfoldMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "blend-cursor":
      return resolveBlendCursorMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "mumbai-script":
      return resolveStyleThreeMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "og":
      return resolveViralLockupMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "double-trouble":
    case "shamani":
      return resolveKalakarCaptionMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "sunday-script":
    case "redline-word-box":
    case "golden-aura":
      return resolveClucapMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "pixelated-word":
      return resolvePixelatedWordMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "becomes-notes":
      return resolveBecomesNotesMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "sara":
      return resolveSaraMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "coral-story":
      return resolveCoralStoryMetadata({ props: { sourceConfig: props.sourceConfig } });
    case "serif-glow":
      return resolveSerifGlowMetadata({ props: { sourceConfig: { ...props.sourceConfig,
        background: props.sourceConfig.background?.src
          ? { ...props.sourceConfig.background, src: props.sourceConfig.background.src } : undefined } } });
    default:
      return resolveEditorialSelectMetadata({ props: { sourceConfig: props.sourceConfig } });
  }
};
