import { NO_SPACING, useSpacing } from "./sizes";
import React, { useCallback, useMemo, useState } from "react";
import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import type { BasicCaptionRendererProps } from "../BasicCaption/BasicCaptionRenderer";
import { isRecord } from "../CaptionEngine/types";
import { NeonOverlap } from "../NeonOverlap/NeonOverlap";
import type { NeonSource } from "../NeonOverlap/types";
import { ReferenceStack } from "../ReferenceStack/ReferenceStack";
import { resolveStackConfig, type StackSource } from "../ReferenceStack/engine";
import { StyleOne } from "../StyleOne/StyleOne";
import styleOneConfig from "../StyleOne/style-one.config.json";
import { resolveStyleOneConfig } from "../StyleOne/config";
import { EditorialType } from "../EditorialType/EditorialType";
import type { EditorialSource } from "../EditorialType/types";
import { Luxe } from "../Luxe";
import { expandLuxeWords } from "../LuxePreview";
import { normalizeWords } from "../LaunchCaptionPack/timeline";
import { GlowAnchor } from "../GlowAnchor";
import { Cadence } from "../Cadence";
import { SmartTextCaption, type FlowSource } from "../SmartTextFlow";
import { ViralLockup, groupViralWords } from "../ViralLockup";
import { premiumPreviewSource, PREMIUM_CANVAS } from "./story";
import { SplitLine } from "../SplitLine/SplitLine";
import { Viewfinder } from "../Viewfinder/Viewfinder";
import { premiumShowcaseSource, smartScenes, editorialScenes, neonScenes, stackScenes } from "./showcases";
import { SignatureCaption } from "./Signature/SignatureCaption";
import { CuratedCaption } from "../Curated/CuratedCaption";
import { dropShadows, wordLooksOf } from "../Standard/CaptionLayer";
import { growWordStyles, HERO_SHARES, planHeroes, type HeroPlan } from "./heroPlan";
import { PlainLayers, usePlainFont } from "./PlainLine";
import type { FontSpec } from "../StyleOne/config";
import { usePartSizes, type PartLook } from "./parts";
import { SourceVideo } from "../SourceVideo";

export type PremiumStyleProps = BasicCaptionRendererProps & { styleId?: string };

/** Anchor Stack has two fonts: the main word's, and one for all the text around it. */
const anchorFont = (look: PartLook | undefined, fallback: FontSpec): FontSpec => look?.family && look.src
  ? { family: look.family, src: look.src, weight: look.weight ?? fallback.weight, style: look.italic ? "italic" : "normal" } : fallback;
const ANCHOR_HELPER: FontSpec = { family: "Instrument Sans", weight: 400, src: "style-two/fonts/instrument-sans-variable.ttf" };
/** Anchor Stack's main size goes in cue by cue; here only its helpers, whose floor must follow a smaller pick. */
const anchorSizes = (helper: number) => {
  const { helperRatio, softRatio, minHelperFontSize } = styleOneConfig.layout;
  return { helperRatio: helperRatio * helper, softRatio: softRatio * helper, minHelperFontSize: minHelperFontSize * Math.min(helper, 1) };
};

const PremiumCaptions: React.FC<PremiumStyleProps> = ({ styleId, sourceConfig, styleConfig, presentationConfig }) => {
  const preview = !!presentationConfig?.onLayout;
  // The preview-video recorder may ask for its own canvas (black, for footage blended in later).
  const asked = presentationConfig?.backgroundColor;
  const previewCanvas = asked && asked !== "transparent" ? asked : PREMIUM_CANVAS;
  const [measuredHeight, setMeasuredHeight] = useState(160);
  const onLayout = useCallback((height: number) => {
    if (Number.isFinite(height) && height > 0) setMeasuredHeight(height);
  }, []);
  const presentation = useMemo(() => preview ? {
    ...presentationConfig, backgroundColor: previewCanvas, onLayout,
  } : presentationConfig, [preview, presentationConfig, onLayout, previewCanvas]);
  const input = isRecord(styleConfig) ? styleConfig : {};
  const layout = isRecord(input.layout) ? input.layout : {};
  const font = isRecord(input.font) ? input.font : {};
  const number = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const positionY = preview ? .5 : number(layout.positionY, .72);
  const positionX = preview ? .5 : number(layout.positionX, .5);
  const maxWidth = preview ? .74 : number(layout.maxWidth, .84);
  const source = preview ? premiumShowcaseSource(styleId) : sourceConfig;
  // The editor keeps the video on a layer of its own, so a renderer draws only its words.
  const bare = preview || !source.background?.src;
  // Anchor Stack's main word used to default to teal; a project still carrying that old default gets the white design.
  const picked = !preview && layout.editor === true ? presentationConfig?.highlights?.color : undefined;
  const accent = styleId === "style-one" && picked?.toLowerCase() === "#68e0cf" ? undefined : picked;
  const reduced = presentationConfig?.reducedMotion === true;
  const spacing = useSpacing(presentationConfig);
  const tracking = preview ? NO_SPACING : spacing;
  const nativeSize = preview ? 100 : number(font.size, 120);
  const parts = preview ? undefined : presentationConfig?.parts;
  const anchorMain = parts?.main, anchorHelper = parts?.helper;
  const anchorPlan = useMemo(() => {
    const stop = new Set("a an the and of to for in is are it your you my our this that make".split(" "));
    return { version: 1, cues: groupViralWords(normalizeWords(source).words).map(words => {
      const score = (word: typeof words[number]) => (word.emphasis ? 100 : 0) + word.text.length -
        (stop.has(word.text.toLowerCase()) ? 30 : 0);
      const hero = words.reduce((best, word) => score(word) > score(best) ? word : best);
      return { id: `anchor-${words[0].id}`, mode: "emphasis", wordIds: words.map(w => w.id),
        heroWordIds: [hero.id], nesting: "auto", helperPlacement: "natural" };
    }) };
  }, [source]);
  const sizes = usePartSizes(preview ? undefined : presentationConfig);
  const anchorFaces = JSON.stringify([anchorFont(anchorMain, { family: "", weight: 800 }), anchorFont(anchorHelper, ANCHOR_HELPER)]);
  const anchorConfig = useMemo(() => {
    const [hero, helper] = JSON.parse(anchorFaces) as ReturnType<typeof anchorFont>[];
    const resolved = resolveStyleOneConfig({
    ...styleOneConfig, ...source,
    plan: anchorPlan,
    fonts: { ...styleOneConfig.fonts, ...(hero.family ? { hero } : {}), helper, soft: helper, plain: helper },
    background: bare ? { muted: true, volume: 0 } : source.background,
    theme: { ...styleOneConfig.theme, backgroundColor: preview ? previewCanvas : "transparent", backdropDim: bare ? 0 : .3,
      ...(accent ? { heroColor: accent } : {}) },
    layout: { ...styleOneConfig.layout, positionX, positionY, maxWidth,
      ...(preview ? { heroFontSize: 164, minHeroFontSize: 110, helperRatio: .38, softRatio: .38,
        plainFontSize: 60, standaloneFontSize: 164, maxHeight: .68 } : anchorSizes(sizes.helper)) },
    });
    // Spacing goes on top of each text's own tracking; the pockets are fitted with it, so nothing overlaps.
    if (!tracking.main && !tracking.helper && !tracking.plain) return resolved;
    const l = resolved.layout;
    return { ...resolved, layout: { ...l, heroTracking: l.heroTracking + tracking.main, helperTracking: l.helperTracking + tracking.helper,
      softTracking: l.softTracking + tracking.helper, supportTracking: l.supportTracking + tracking.plain } };
  }, [source, preview, bare, accent, positionX, positionY, maxWidth, anchorPlan, anchorFaces, sizes.helper, tracking]);
  const stackSource = useMemo<StackSource>(() => preview ? {
    transcript: source.transcript, durationMs: source.durationMs,
    plan: { cues: stackScenes.map(scene => ({ wordIds: scene.words.map(w => w.id), lines: [
      { wordIds: scene.words.slice(0, 2).map(w => w.id), role: "body" },
      { wordIds: scene.words.slice(2, 3).map(w => w.id), role: "serif" },
      { wordIds: scene.words.slice(3).map(w => w.id), role: "italic" },
    ] })) },
  } : source as StackSource, [preview, source]);
  const stackStyle = useMemo(() => {
    const base = resolveStackConfig();
    return { ...base, fonts: { ...base.fonts, sans: { ...base.fonts.sans,
      family: typeof font.family === "string" ? font.family : base.fonts.sans.family,
      src: typeof font.src === "string" ? font.src : base.fonts.sans.src,
    } }, roles: Object.fromEntries(Object.entries(base.roles).map(([role, value]) =>
      [role, { ...value, size: value.size * (preview ? .96 : number(font.size, 88) / 88) }])),
      layout: { ...base.layout, positionX, baselineY: positionY, maxWidth },
      depth: preview ? { ...base.depth, enabled: true, frequency: 1 } : base.depth,
      background: bare ? { ...base.background, dim: 0, scrim: { enabled: false } } : base.background };
  }, [preview, bare, positionX, positionY, maxWidth, font.size, font.family, font.src]);
  const neonSource = useMemo<NeonSource>(() => preview ? { ...source, direction: neonScenes.map((scene, i) => ({
    wordIds: scene.words.map(w => w.id), heroWordId: scene.words[scene.hero].id,
    variant: (["outline", "shine", "metric", "split"] as const)[i],
  })) } : source as NeonSource, [preview, source]);
  const smartSource = useMemo<FlowSource>(() => preview ? {
    durationMs: premiumPreviewSource.durationMs,
    cues: smartScenes.map((scene, i) => ({
      startMs: scene.words[0].startMs, endMs: scene.words[scene.words.length - 1].endMs,
      segments: scene.words.map((word, index) => ({ type: "text" as const, value: word.text,
        startMs: word.startMs, endMs: word.endMs,
        ...(index === scene.hero ? { emphasis: (["marker", "underline", "textColor", "bracket"] as const)[i],
          style: (["bold", "italic-serif", "bold", "cursive"] as const)[i] } : {}),
      })),
    })),
  } : { transcript: source.transcript, durationMs: source.durationMs,
    background: source.background?.src ? { ...source.background, src: source.background.src } : undefined }, [preview, source]);
  const editorialSource = useMemo<EditorialSource>(() => preview ? {
    durationMs: 12800,
    cues: editorialScenes.map(scene => ({
      startMs: scene.words[0].startMs, endMs: scene.words[scene.words.length - 1].endMs,
      segments: scene.words.map((word, index) => ({ type: "text" as const, value: word.text,
        startMs: word.startMs, endMs: word.endMs,
        style: index === scene.hero ? "italic-serif" as const : "normal" as const,
      })),
    })),
  } : source as EditorialSource, [preview, source]);
  // A new object here would redo the whole fit on hover and leave the card blank meanwhile.
  const editorialStyle = useMemo(() => ({ transparent: bare, positionY, fontSize: preview ? 50 : 40 * sizes.helper, helperSize: preview ? 37 : 30 * sizes.helper,
    heroSize: preview ? 152 : 120 * sizes.main, ...(preview ? {} : { numberSize: 124 * sizes.main, mainPick: sizes.main }), maxWidth: preview ? .82 : maxWidth }),
  [bare, positionY, preview, maxWidth, sizes.main, sizes.helper]);
  const neonSize = number(font.size, 88);
  const neonStyle = useMemo(() => ({ positionY, positionX, maxWidth, heroScale: preview ? .66 : neonSize / 88,
    normalSize: preview ? 40 : neonSize / 2, transparent: bare, flicker: .96 }), [positionY, positionX, maxWidth, preview, neonSize, bare]);
  const smartMain = parts?.main?.gradient?.stops[0]?.color ?? parts?.main?.color, smartHelper = parts?.helper?.color;
  const smartStyle = useMemo(() => ({ positionY, maxWidth, fontSize: preview ? 54 : 52, transparent: bare, maxWords: 7,
    ...(smartMain ? { accent: smartMain, colorMode: "single" as const } : {}), ...(smartHelper ? { text: smartHelper } : {}) }),
  [positionY, maxWidth, preview, bare, smartMain, smartHelper]);
  // These renderers fit their text whenever styleConfig changes, so each config stays the same object
  // until a setting it holds changes; a color drag or a card's height report never redoes their layout.
  const luxeSource = useMemo(() => styleId === "luxe" ? expandLuxeWords(source) : undefined, [styleId, source]);
  const luxeSize = preview ? 112 : number(font.size, 116);
  const luxeWrap = preview && input.naturalWrap === true;
  const inkLayer = input.inkLayer === "only" ? "only" as const : input.inkLayer === "skip" ? "skip" as const : undefined;
  const luxeStyle = useMemo(() => ({ positionY, maxWidth, fontSize: luxeSize, scriptSize: preview ? 42 : 48,
    naturalWrap: luxeWrap, showcase: preview, palette: preview ? "purple" as const : undefined, inkLayer }),
  [positionY, maxWidth, luxeSize, preview, luxeWrap, inkLayer]);
  const maroonStyle = useMemo(() => ({ positionY, positionX, maxWidth, fontSize: nativeSize + 12 }), [positionY, positionX, maxWidth, nativeSize]);
  const glowStyle = useMemo(() => ({ positionY, maxWidth, fontSize: preview ? 120 : nativeSize, helperSize: preview ? 49 : nativeSize * 49 / 120, accent }),
    [positionY, maxWidth, preview, nativeSize, accent]);
  const cadenceScale = preview ? .9 : number(font.size, 132) / 132;
  const cadenceStyle = useMemo(() => ({ positionY, maxWidth, theme: "amber" as const, centered: preview, scale: cadenceScale }),
    [positionY, maxWidth, preview, cadenceScale]);
  let content: React.ReactNode;
  if (styleId === "dynamic-simple" || styleId === "verse-flow") content = <CuratedCaption variant={styleId}
    sourceConfig={source} styleConfig={styleConfig} presentationConfig={presentation} />;
  else if (styleId === "ember-lock" || styleId === "cursor-story") content = <SignatureCaption variant={styleId}
    sourceConfig={source} styleConfig={styleConfig} presentationConfig={presentation} />;
  else if (styleId === "split-line") content = <SplitLine sourceConfig={source} styleConfig={styleConfig} presentationConfig={presentation} />;
  else if (styleId === "viewfinder") content = <Viewfinder sourceConfig={source} styleConfig={styleConfig} presentationConfig={presentation} />;
  else if (styleId === "luxe") content = <Luxe sourceConfig={luxeSource} presentationConfig={presentation} reducedMotion={reduced}
    styleConfig={luxeStyle} />;
  else if (styleId === "maroon-king") content = <ViralLockup variant="maroon-king" sourceConfig={source} presentationConfig={presentation}
    styleConfig={maroonStyle} />;
  else if (styleId === "glow-anchor") content = <GlowAnchor sourceConfig={source} reducedMotion={reduced} presentationConfig={presentation}
    styleConfig={glowStyle} />;
  else if (styleId === "cadence") content = <Cadence sourceConfig={source} reducedMotion={reduced} presentationConfig={presentation}
    styleConfig={cadenceStyle} />;
  else if (styleId === "smart-text-caption") content = <SmartTextCaption sourceConfig={smartSource} presentationConfig={presentation} styleConfig={smartStyle} />;
  else if (styleId === "style-one") content = <StyleOne config={anchorConfig} fps={30} presentationConfig={presentation} />;
  else if (styleId === "editorial-type") content = <EditorialType sourceConfig={editorialSource} presentationConfig={presentation}
    styleConfig={editorialStyle} fps={30} />;
  else if (styleId === "reference-stack") content = <ReferenceStack sourceConfig={stackSource} styleConfig={stackStyle} presentationConfig={presentation} />;
  else content = <NeonOverlap sourceConfig={neonSource} presentationConfig={presentation} styleConfig={neonStyle} />;

  // Fit the measured maximum once for the complete story, never on each frame.
  const scale = preview ? Math.min(1, (styleId === "smart-text-caption" ? 214 : 196) / measuredHeight) : 1;
  return <AbsoluteFill data-premium-style={styleId} style={{ background: preview ? previewCanvas : "transparent", overflow: "hidden" }}>
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>{content}</AbsoluteFill>
  </AbsoluteFill>;
};

const NEON_VARIANTS = ["outline", "shine", "split", "echo"] as const;

/** The same stage as Standard: the video on its own, and the caption on layers that move, scale and tilt. */
export const PremiumStyle: React.FC<PremiumStyleProps> = (props) => {
  const { styleId, sourceConfig, styleConfig, presentationConfig } = props;
  const { width, height } = useVideoConfig();
  const input = isRecord(styleConfig) ? styleConfig : {};
  const layout = isRecord(input.layout) ? input.layout : {};
  const editor = layout.editor === true && !presentationConfig?.onLayout;
  const marked = (rule: (word: { emphasized?: boolean; highlighted?: boolean }) => boolean | undefined) =>
    Object.entries(presentationConfig?.wordStyles ?? {}).filter(([, word]) => rule(word)).map(([id]) => id).join(" ");
  const keyWords = marked(word => word.emphasized), neverWords = marked(word => word.highlighted === false);
  // A missing or broken value falls back to the default instead of reaching the chunking as NaN.
  const askedWords = Number(layout.revealWords ?? 6);
  const chunkWords = Number.isFinite(askedWords) && askedWords >= 1 ? askedWords : 6;
  const plan = useMemo<HeroPlan | undefined>(() => {
    if (!editor) return undefined;
    const keys = new Set(keyWords.split(" ")), never = new Set(neverWords.split(" "));
    const words = sourceConfig.transcript as unknown as HeroPlan["transcript"];
    const share = styleId ? HERO_SHARES[styleId] : undefined;
    if (share) return planHeroes(words, keys, never, share, chunkWords);
    return { plain: [], direction: [], grow: {}, transcript: words.map(word => ({ ...word, hero: undefined, emphasis: keys.has(word.id) })) };
  }, [editor, sourceConfig, styleId, keyWords, neverWords, chunkWords]);
  const source = useMemo(() => {
    if (!plan) return sourceConfig;
    const numbers = new Set(plan.transcript.filter(word => /\d/.test(word.text)).map(word => word.id));
    return { ...sourceConfig, background: undefined, transcript: plan.transcript,
      direction: styleId !== "neon-overlap" ? undefined : plan.direction.map((item, index) => ({ ...item,
        variant: item.wordIds.some(id => numbers.has(id)) ? undefined : NEON_VARIANTS[index % NEON_VARIANTS.length] })),
    } as unknown as typeof sourceConfig;
  }, [plan, sourceConfig, styleId]);
  // A zero or broken scale would divide the fit width into Infinity or NaN.
  const askedScale = Number(layout.scale ?? 1);
  const scale = Number.isFinite(askedScale) && askedScale > 0 ? askedScale : 1;
  const fitWidth = Math.min(0.94, Number(layout.boxWidth ?? 0.94)) / scale;
  const anchorY = Number(layout.anchorY ?? 0.72);
  const stage = useMemo(() => ({ ...input, font: {}, layout: { ...layout, positionX: 0.5, positionY: anchorY, fitWidth,
    maxWidth: Math.min(Number(layout.maxWidth ?? 0.84), fitWidth) } }), [input, layout, anchorY, fitWidth]);
  // Spacing arrives in the editor's px at a 1080 frame; Premium words come in many sizes, so it becomes a
  // share of each word's own size and the main word and small text open up evenly.
  const font = isRecord(input.font) ? input.font : {};
  const tracking = typeof font.letterSpacing === "number" && Number.isFinite(font.letterSpacing) ? Math.max(-.08, Math.min(.5, font.letterSpacing / 100)) : 0;
  // A short main word is drawn bigger than the design's size, so the helper lines never outweigh it (heroPlan.ts).
  const grow = plan?.grow;
  const presentation = useMemo(() => ({ ...presentationConfig, wordStyles: growWordStyles(presentationConfig?.wordStyles, grow),
    backgroundColor: "transparent", tracking }), [presentationConfig, tracking, grow]);
  const hasLockups = !!plan?.transcript.length;
  const glass = styleId === "luxe";
  const lockups = useMemo(() => hasLockups ? <PremiumCaptions styleId={styleId} sourceConfig={source} presentationConfig={presentation}
    styleConfig={glass ? { ...stage, inkLayer: "skip" } : stage} /> : null, [hasLockups, styleId, source, presentation, stage, glass]);
  // A transformed layer blends only with itself, so Luxe's glass needs one of its own to reach the video.
  const ink = useMemo(() => hasLockups && glass ? <PremiumCaptions styleId={styleId} sourceConfig={source} presentationConfig={presentation}
    styleConfig={{ ...stage, inkLayer: "only" }} /> : null, [hasLockups, glass, styleId, source, presentation, stage]);
  const plainFont = usePlainFont(editor ? styleId : undefined, presentationConfig?.fallbackFonts, presentationConfig?.parts);
  const sizes = usePartSizes(presentationConfig);
  const plainSpacing = useSpacing(presentation);
  const wordStyles = presentationConfig?.wordStyles;
  const scaleUnit = width / 1080 / scale;
  const wordLooks = useMemo(() => wordLooksOf(wordStyles, scaleUnit), [wordStyles, scaleUnit]);
  const roleFx = presentationConfig?.roleEffects;
  const roleLooks = useMemo(() => roleFx ? Object.fromEntries(Object.entries(roleFx).flatMap(([role, fx]) =>
    fx ? [[role, { filter: dropShadows(fx, scaleUnit), opacity: fx.opacity }]] : [])) : undefined, [roleFx, scaleUnit]);
  if (!plan) return <PremiumCaptions {...props} />;

  // Moving sideways stops once the caption's box meets the frame's edge, so it is never cut off.
  // The caption's middle goes exactly where the user put it.
  const x = Number(layout.positionX ?? 0.5), y = Number(layout.positionY ?? anchorY);
  const fx = presentationConfig?.textEffects;
  const place = {
    origin: `50% ${anchorY * 100}%`,
    transform: `translate(${(x - 0.5) * width}px, ${(y - anchorY) * height}px) rotate(${Number(layout.rotation ?? 0)}deg) scale(${scale})`,
    animation: presentationConfig?.reducedMotion ? undefined : presentationConfig?.animation,
    keyWords, wordLooks, roleLooks,
    look: { opacity: fx?.opacity, filter: dropShadows(fx, scaleUnit),
      mixBlendMode: fx?.blend && fx.blend !== "normal" ? fx.blend as React.CSSProperties["mixBlendMode"] : undefined },
  };
  const video = sourceConfig.background;
  const src = video?.src;
  return <AbsoluteFill style={{ backgroundColor: "#000000", overflow: "hidden" }}>
    {src ? <SourceVideo src={/^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src)} muted={video?.muted ?? false}
      volume={video?.volume ?? 1} style={{ width: "100%", height: "100%", objectFit: video?.objectFit ?? "cover" }} /> : null}
    <PlainLayers pages={plan.plain} place={place} ink={ink} plain={{ font: { ...plainFont, size: plainFont.size * (styleId === "maroon-king" ? sizes.script : sizes.plain), tracking: styleId === "maroon-king" ? plainSpacing.script : plainSpacing.plain }, anchorY, words: sizes.words,
      width: Math.min(0.8, fitWidth), reduced: presentationConfig?.reducedMotion }}>{lockups}</PlainLayers>
  </AbsoluteFill>;
};
