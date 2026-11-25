import type { BasicCaptionProps, BasicCaptionSource } from "@caption-styles";
import type { Cue } from "../app/CaptionTimeline";
import type { CaptionSettings, PartSettings } from "../app/captionSettings";
import {
  DEFAULT_ANIMATION,
  DEFAULT_GRADIENT,
  DEFAULT_HIGHLIGHTS,
  resolveEffects,
} from "../app/captionSettings";
import { defaultStyleSettings, wordSettings } from "../editor/words";
import { LOCAL_FONTS, closestFace, resolveFontAsset } from "../fonts/catalog";
import { basicMotion, captionStyle, type CaptionStyleId } from "../app/styleCatalog";
import { resolveEmphasis, styleCapabilities } from "../app/styleCapabilities";
import { evenPages, layoutCaptionPages } from "../editor/captionPages";
import { HERO_SHARES, planHeroes, type HeroPlan } from "../../../captions/src/Premium/heroPlan";
import { isSignatureStyleId } from "../../../captions/src/Basic/catalog";

export const PREVIEW_FPS = 60;
export type PreviewAspectRatio = "9:16" | "4:5" | "16:9" | "1:1";
export const compositionSize = (ratio: PreviewAspectRatio) =>
  ratio === "16:9"
    ? { width: 1280, height: 720 }
    : ratio === "1:1"
      ? { width: 720, height: 720 }
      : ratio === "4:5"
        ? { width: 720, height: 900 }
        : { width: 720, height: 1280 };

/** The preview frame in the uploaded video's own shape: the short side is 720, like the presets above. */
export const frameSizeOf = (width: number, height: number, fallback: PreviewAspectRatio, ratio?: number) => {
  // A shape picked in the toolbar wins over the upload's own.
  if (ratio) [width, height] = [ratio, 1];
  if (!(width > 0 && height > 0)) return compositionSize(fallback);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return width >= height ? { width: even((720 * width) / height), height: 720 } : { width: 720, height: even((720 * height) / width) };
};

// Explicit adapter: the editor owns seconds/UI units; the shared renderer owns
// word timestamps in milliseconds and font sizes relative to a 1080px canvas.
export function createBasicSource(
  cues: Cue[],
  videoSrc: string,
  duration: number,
): BasicCaptionSource {
  const transcript = cues.flatMap((cue) => {
    const text = [cue.lead, cue.hero, cue.trail]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text || cue.start < 0 || cue.end <= cue.start) return [];
    return [
      {
        id: cue.id,
        text,
        startMs: Math.round(cue.start * 1000),
        endMs: Math.round(cue.end * 1000),
        timestampMs: null,
        confidence: null,
        pageBreakAfter: cue.pageBreak === true || /[.!?।॥]["'”’)]?$/u.test(text),
        hero: cue.hero || undefined,
        // Mix captions: the English form a key or main word shows (captions/src/Script/mix.ts).
        ...(cue.mix && { mix: [cue.lead, cue.mix, cue.trail].filter(Boolean).join(" ").trim() }),
        ...(cue.mix && cue.latin && { latin: [cue.lead, cue.latin, cue.trail].filter(Boolean).join(" ").trim() }),
      },
    ];
  });
  return {
    transcript,
    durationMs: Math.round(duration * 1000),
    background: {
      src: videoSrc && videoSrc.trim() ? videoSrc : "/demo.mp4",
      objectFit: "cover",
      bottomGradient: false,
    },
  };
}

// Formatting/emphasis edits retain the timing source identity, so they never
// trigger a transcript recompile while a color or size slider is being dragged.
export function createSourceSelector() {
  let previous:
    | { cues: Cue[]; src: string; duration: number; source: BasicCaptionSource }
    | undefined;
  return (cues: Cue[], src: string, duration: number) => {
    if (
      previous &&
      previous.src === src &&
      previous.duration === duration &&
      previous.cues.length === cues.length &&
      cues.every((cue, index) => {
        const before = previous!.cues[index];
        return (
          cue === before ||
          (cue.id === before.id &&
            cue.start === before.start &&
            cue.end === before.end &&
            cue.hero === before.hero &&
            cue.pageBreak === before.pageBreak &&
            cue.lead === before.lead &&
            cue.trail === before.trail &&
            cue.mix === before.mix &&
            cue.latin === before.latin)
        );
      })
    ) {
      previous.cues = cues;
      return previous.source;
    }
    const source = createBasicSource(cues, src, duration);
    previous = { cues, src, duration, source };
    return source;
  };
}

export function createWordColors(cues: Cue[]) {
  const colors: Record<string, string> = {};
  for (const cue of cues)
    if (cue.color && cue.color !== "none") colors[cue.id] = cue.color;
  return colors;
}

/** Clears the right-hand buttons on Reels, TikTok and Shorts with the caption still centered. */
const CAPTION_WIDTH = 0.78;

function pageLimits(settings: CaptionSettings, styleId: string) {
  const preset = captionStyle(styleId);
  const textCase = settings.textCase ?? preset?.textCase ?? (styleId === "bold-impact" ? "uppercase" : "preserve");
  const styleWidth = CAPTION_WIDTH;
  const maxWidth = settings.maxWidth ?? styleWidth;
  // A narrower box wraps the same words onto more lines; it shouldn't cut them into other captions.
  const pageWidth = settings.maxLines ? maxWidth : Math.max(maxWidth, styleWidth);
  // Estimate how many characters fit at this size and width (renderer is 1080 units wide, size × 4).
  const charWidth = settings.size * 4 * (textCase === "uppercase" ? 0.66 : 0.56) + (settings.letterSpacing ?? 0) * 4;
  const charsPerLine = Math.max(4, Math.floor((1080 * pageWidth) / Math.max(1, charWidth)));
  return {
    textCase,
    maxWidth,
    maxCharacters: charsPerLine * (settings.maxLines ?? 2),
    maxWords: settings.maxWords ?? preset?.maxWords ?? (
      styleId === "one-word"
        ? 1
        : styleId === "bold-impact"
          ? 3
          : styleId === "stacked-text"
            ? 6
            : 5),
    paged: styleCapabilities(styleId).words !== null,
  };
}

/** Letters a Standard or Premium line holds at the starting size and width. */
const DESIGN_LETTERS = 34;
/** Styles built as a tall block of short rows: a page holds about this many lines' worth of letters. */
const STACKED_ROWS: Record<string, number> = { fourfold: 3 };
/** The width a Standard or Premium caption starts at, before the width handles move it. */
const DESIGN_WIDTH = 0.9;

/**
 * Standard and Premium captions, cut in code before the style lays them out. The user's normal-text
 * word count (the main word comes on top) or, on Auto, as many words as fit the box at this size.
 * Either way the pages of a sentence come out about the same width.
 */
function designedPages(cues: Cue[], settings: CaptionSettings, styleId: string) {
  const preset = captionStyle(styleId);
  if (!preset || preset.category === "Basic" || !("maxWords" in preset)) return cues;
  const main = styleCapabilities(styleId).emphasis === "hero" ? 1 : 0;
  const lines = styleId === "double-trouble" ? settings.lineWords : undefined;
  const picked = lines && (lines.top || lines.bottom) ? (lines.top ?? 2) + (lines.bottom ?? 3)
    : settings.normalWords ? settings.normalWords + main : undefined;
  const room = Math.min(1.5, (settings.maxWidth ?? DESIGN_WIDTH) / DESIGN_WIDTH) / Math.max(0.4, settings.size / 22);
  // Fourfold builds its own tall 3-4 row blocks (8 words or so, across sentence ends) unless a count is picked.
  if (!picked && STACKED_ROWS[styleId]) return cues;
  const maxWords = picked ?? preset.maxWords;
  const maxCharacters = picked ? 400 : Math.max(10, Math.round(DESIGN_LETTERS * room * (STACKED_ROWS[styleId] ?? 1)));
  return evenPages(layoutCaptionPages(cues, { maxWords, maxCharacters }), maxWords);
}

/** Cues with page breaks for the current size, width and word limit. */
export function pagedCues(cues: Cue[], settings: CaptionSettings, styleId: string) {
  const limits = pageLimits(settings, styleId);
  return limits.paged ? layoutCaptionPages(cues, limits) : designedPages(cues, settings, styleId);
}

/** The words a style's own plan makes the main word, for controls that treat them differently. */
export function heroWords(styleId: string, cues: Cue[], maxWords = 6) {
  const share = HERO_SHARES[styleId];
  if (!share) return new Set<string>();
  const words = cues.map((cue) => ({ id: cue.id, text: [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" "),
    startMs: Math.round(cue.start * 1000), endMs: Math.round(cue.end * 1000), pageBreakAfter: cue.pageBreak === true })) as HeroPlan["transcript"];
  const marked = (value: boolean) => new Set(cues.filter((cue) => cue.highlighted === value).map((cue) => cue.id));
  return new Set(planHeroes(words, marked(true), marked(false), share, Math.min(maxWords, 8)).direction.map((item) => item.heroWordId));
}

export function createBasicStyle(
  settings: CaptionSettings,
  styleId: CaptionStyleId = "simple-text",
) {
  const weight = settings.weight ?? 400;
  const limits = pageLimits(settings, styleId);
  // A chosen entrance takes over from the style's own.
  const ownEntrance = captionStyle(styleId)?.category === "Standard" && styleCapabilities(styleId).motion
    && !!settings.animation?.in && settings.animation.in !== "style";
  // IntegralCF has no lowercase letters, so Aa and aa need a font that does.
  const capsOnly = /^integral/i.test(settings.font) && limits.textCase !== "uppercase";
  const family = capsOnly ? "Poppins" : settings.font;
  return {
    font: {
      family,
      src:
        (!capsOnly && settings.fontAsset) ||
        resolveFontAsset(family, weight, settings.italic),
      size: settings.size * 4,
      weight,
      italic: settings.italic === true,
      color: settings.color,
      letterSpacing: (settings.letterSpacing ?? 0) * 4,
      wordSpacing: (settings.wordSpacing ?? 0) * 4,
      lineHeight: settings.lineSpacing ?? 1.1,
      textCase: limits.textCase,
    },
    layout: {
      positionX: settings.x / 100,
      positionY: settings.y / 100,
      maxWidth: limits.maxWidth,
      safeMargin: 0.05,
      alignment: settings.textAlign ?? "center",
      rotation: settings.rotation ?? 0,
      // Standard and Premium get their size and placement from one layer around the caption.
      ...(captionStyle(styleId) && captionStyle(styleId)?.category !== "Basic"
        ? { editor: true, scale: settings.size / 22, lineWords: settings.lineWords, anchorY: defaultStyleSettings(styleId).y / 100, boxWidth: settings.maxWidth,
            textCase: styleCapabilities(styleId).textCase ? limits.textCase : undefined,
            ownEntrance,
            // A reveal carried over from another style only counts if this one offers it.
            reveal: styleCapabilities(styleId).reveal?.find((mode) => mode === settings.animation?.reveal),
            revealWords: Math.min(captionStyle(styleId)?.maxWords ?? 5, 8) }
        : {}),
    },
    phrasing: {
      // Pages are cut in code before the engine (see pagedCues), so its caps stay out of the way.
      paged: limits.paged,
      maxWords: limits.paged ? 14 : limits.maxWords,
      maxCharacters: limits.paged ? 140 : settings.maxLines ? limits.maxCharacters : 38,
      maxDurationMs: limits.paged ? 10000 : 2800,
      maxGapMs: limits.paged ? 3000 : 320,
      lingerMs: 120,
    },
  };
}

export function captionFallbacks(cues: Cue[]) {
  const text = cues
    .map((cue) => [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" "))
    .join(" ");
  return LOCAL_FONTS.filter(
    (font) =>
      font.fallback &&
      ((font.subsets.includes("devanagari") && /[\u0900-\u097f]/u.test(text)) ||
        (font.subsets.includes("kannada") && /[\u0c80-\u0cff]/u.test(text))),
  ).map((font) => {
    const face = closestFace(font, 800)!;
    return {
      family: font.family,
      src: face.src,
      weight: face.weight,
      italic: face.italic,
    };
  });
}
const withAlpha = (hex: string, percent: number) => {
  const value = /^#[a-f0-9]{6}$/i.test(hex) ? hex : "#000000";
  const channel = (start: number) => parseInt(value.slice(start, start + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${Math.max(0, Math.min(100, percent)) / 100})`;
};
// Editor px → renderer units (the same ×4 used for font size and letter spacing).
function createTextEffects(settings: CaptionSettings) {
  if (!settings.effects) return undefined;
  const fx = resolveEffects(settings.effects);
  return {
    opacity: fx.opacity / 100,
    blend: fx.blend,
    stroke: fx.stroke.on && fx.stroke.width > 0
      ? { color: fx.stroke.color, width: fx.stroke.width * 4 }
      : undefined,
    shadow: fx.shadow.on
      ? {
          color: withAlpha(fx.shadow.color, fx.shadow.opacity),
          blur: fx.shadow.blur * 4,
          x: fx.shadow.x * 4,
          y: fx.shadow.y * 4,
        }
      : undefined,
    glow: fx.glow.on
      ? { color: withAlpha(fx.glow.color, fx.glow.opacity), blur: fx.glow.blur * 4 }
      : undefined,
    depth: fx.depth.on && fx.depth.length > 0
      ? { color: fx.depth.color, length: fx.depth.length * 4, angle: fx.depth.angle }
      : undefined,
  };
}

/** Long enough to read as motion; fast speech shortens it, see motion.ts. */
export const MOTION_MS = 320;

/** The motion to render, or undefined when the template's own motion is untouched. */
function createAnimation(settings: CaptionSettings, cap: ReturnType<typeof styleCapabilities>, cues: Cue[], styleId: string) {
  const saved = { ...DEFAULT_ANIMATION, ...settings.animation };
  // Older projects saved "Default" (the style's own motion). A style designed around an entrance
  // now plays that entrance, so the same project looks the way the style card does.
  const designed = saved.in === "style" ? basicMotion(styleId) : undefined;
  const chosen = designed ? { ...saved, ...designed, keyIn: saved.keyIn ?? designed.keyIn } : saved;
  const keyIn = (cap.emphasis !== "none" || cap.partMotion) && cap.keyMotion !== false && chosen.keyIn !== "same" ? chosen.keyIn : undefined;
  const keyOut = (cap.emphasis !== "none" || cap.partMotion) && cap.keyMotion !== false && saved.keyOut && saved.keyOut !== "same" && saved.keyOut !== "none" ? saved.keyOut : undefined;
  const wordIn = Object.fromEntries(cues.flatMap((cue) => (cue.format?.wordIn ? [[cue.id, cue.format.wordIn]] : [])));
  const ownMotion = Object.keys(wordIn).length > 0;
  if (!cap.motion || (chosen.in === "style" && chosen.out === "none" && !keyIn && !keyOut && !ownMotion)) return undefined;
  const singleWord = (settings.maxWords ?? 4) <= 1;
  const allowed =
    chosen.in !== "style" &&
    !singleWord &&
    cap.motionUnits.includes(chosen.unit);
  // Show decides what moves: a chunk as one, words and lines through their own start times.
  const shown = cap.reveal?.includes(chosen.reveal as never) ? chosen.reveal : "word";
  return {
    unit: cap.wordMotion ? (shown === "chunk" ? ("caption" as const) : ("word" as const)) : allowed ? chosen.unit : ("caption" as const),
    in: chosen.in === "style" ? undefined : chosen.in,
    keyIn,
    keyOut,
    wordIn: ownMotion ? wordIn : undefined,
    out: chosen.out,
    durationMs: MOTION_MS,
  };
}

/** What the renderer needs of each part; colors and gradients stay out unless they were picked. */
const partLook = (part: PartSettings) => ({
  family: part.font,
  src: part.font ? part.fontAsset || resolveFontAsset(part.font, part.weight ?? 400, part.italic) : undefined,
  weight: part.weight,
  italic: part.italic,
  color: part.colorMode === "gradient" ? undefined : part.color,
  gradient: part.colorMode === "gradient"
    ? { stops: part.gradientStops ?? DEFAULT_GRADIENT, angle: part.gradientAngle ?? 90 }
    : undefined,
  scale: part.scale,
  // Same em conversion as the caption's own letter spacing (px * 4 / 100).
  tracking: part.letterSpacing ? part.letterSpacing * 4 / 100 : undefined,
  textCase: part.textCase,
  wordGap: part.wordSpacing ? part.wordSpacing * 4 / 100 : undefined,
});

type Colored = Pick<PartSettings, "color" | "colorMode" | "gradientStops" | "gradientAngle">;
/** A picked color as the renderer paints it; nothing when none was picked. */
const paintOf = (look?: Colored) =>
  look?.colorMode === "gradient"
    ? { gradient: { stops: look.gradientStops ?? DEFAULT_GRADIENT, angle: look.gradientAngle ?? 90 } }
    : look?.color ? { color: look.color } : undefined;
const sameFace = (a?: { family: string; weight: number; italic?: boolean }, b?: { family: string; weight: number; italic?: boolean }) =>
  !!a && !!b && a.family === b.family && a.weight === b.weight && !!a.italic === !!b.italic;

/**
 * The parts as the renderer reads them. Key words a style draws in the same face and color as the rest
 * follow what is picked for the rest until a key word font or color is picked; the "All text" side of
 * the panel then reaches them too.
 */
function roleParts(settings: CaptionSettings, cap: ReturnType<typeof styleCapabilities>) {
  const parts = { ...settings.parts };
  const restSpec = cap.parts?.find((spec) => spec.id !== "main"), mainSpec = cap.parts?.find((spec) => spec.id === "main");
  const rest = restSpec && parts[restSpec.id];
  if (cap.target === "key" && rest) {
    const main = { ...parts.main };
    if (!main.font && rest.font && sameFace(mainSpec?.font, restSpec?.font))
      Object.assign(main, { font: rest.font, weight: rest.weight, italic: rest.italic, fontAsset: rest.fontAsset, fontUploadId: rest.fontUploadId });
    parts.main = main;
  }
  return parts;
}

export function createPresentation(
  settings: CaptionSettings,
  wordColors: Record<string, string>,
  fallbackFonts: ReturnType<typeof captionFallbacks>,
  cues: Cue[] = [],
  styleId = "simple-text",
) {
  const cap = styleCapabilities(styleId);
  const emphasis = resolveEmphasis(settings, styleId);
  // A style that picks its own key words never sees the marks left by another one.
  const keyWords = emphasis.enabled && cap.emphasis !== "none" && cap.emphasisPanel !== false;
  const highlights = { ...DEFAULT_HIGHLIGHTS, ...settings.highlights };
  // Plain Basic captions and Script Accent size key words themselves; the other Basic layouts scale the word.
  const basic = captionStyle(styleId)?.category === "Basic";
  const nativeKeyScale = !basic || styleId === "style-two" || (!isSignatureStyleId(styleId) && styleId !== "captions-dot" && styleId !== "creator-emoji");
  return {
    wordColors,
    fallbackFonts,
    // Picking Gradient shows the default colors before any is changed, so they are what gets drawn.
    emphasis: {
      ...emphasis,
      ...(emphasis.shapeColorMode === "gradient" ? { shapeGradientStops: emphasis.shapeGradientStops ?? DEFAULT_GRADIENT } : {}),
      ...(emphasis.colorMode === "gradient" ? { gradientStops: emphasis.gradientStops ?? DEFAULT_GRADIENT } : {}),
    },
    animation: createAnimation(settings, cap, cues, styleId),
    features: settings.features,
    // AI-picked emojis by word id (Creator Emoji); empty for transcripts made before the emoji pass.
    emojis: Object.fromEntries(cues.flatMap((cue) => cue.emoji ? [[cue.id, cue.emoji]] : [])),
    parts: settings.parts
      ? Object.fromEntries(Object.entries(roleParts(settings, cap)).flatMap(([id, part]) => part ? [[id, partLook(part)]] : []))
      : undefined,
    // Colors picked for key words (or the main line) and the rest. Key words without a color of their
    // own in the design take the rest's color until one is picked for them.
    paints: (() => {
      const restSpec = cap.parts?.find((spec) => spec.id !== "main"), mainSpec = cap.parts?.find((spec) => spec.id === "main");
      const rest = paintOf(restSpec ? settings.parts?.[restSpec.id] : undefined);
      const sameColor = !cap.emphasisWord && !!mainSpec?.color && mainSpec.color === restSpec?.color;
      const main = paintOf(settings.parts?.main) ?? (cap.target === "key" && sameColor ? rest : undefined);
      return main || rest ? { main, rest } : undefined;
    })(),
    paintWords: cap.paintWords,
    // Design picked for one kind of text: the main line or key words, the rest, and plain lines.
    roleEffects: (() => {
      const restSpec = cap.parts?.find((spec) => spec.id !== "main" && spec.id !== "plain");
      const fx = (effects?: CaptionSettings["effects"]) => effects ? createTextEffects({ ...settings, effects }) : undefined;
      const others = fx(settings.restEffects);
      const main = fx(settings.parts?.main?.effects), rest = fx(restSpec ? settings.parts?.[restSpec.id]?.effects : undefined) ?? others,
        // A style without its own Normal lines row sets them in its script (Maroon King), so that row's Design reaches them.
        plain = fx(settings.parts?.plain?.effects ?? (cap.parts?.some((spec) => spec.id === "plain") ? undefined : settings.parts?.script?.effects)) ?? others;
      return main || rest || plain ? { main, rest, plain } : undefined;
    })(),
    restEffects: settings.restEffects ? createTextEffects({ ...settings, effects: settings.restEffects }) : undefined,
    box: settings.box ? {
      color: settings.box.colorMode === "gradient" ? undefined : settings.box.color,
      gradient: settings.box.colorMode === "gradient"
        ? { stops: settings.box.gradientStops ?? DEFAULT_GRADIENT, angle: settings.box.gradientAngle ?? 90 } : undefined,
      opacity: settings.box.opacity, frameWidth: settings.box.frameWidth, radius: settings.box.radius,
      padding: settings.box.padding !== undefined ? settings.box.padding / 100 : undefined,
      handles: settings.box.handles, glow: settings.box.glow, drawMs: settings.box.drawMs,
    } : undefined,
    shadow: settings.shadow,
    textEffects: createTextEffects(settings),
    motion: settings.motion,
    motionDurationMs: settings.motionDuration,
    autoFit: settings.autoFit !== false,
    centerAnchor: true,
    // Creator Emoji has no accent of its own: its glow is the key word's color.
    highlights: cap.emphasisShape
      ? { ...highlights, backgroundColor: emphasis.backgroundColor }
      : cap.emphasis === "hero" && !cap.accent
        ? { ...highlights, color: emphasis.color, enabled: emphasis.enabled }
        : highlights,
    wordStyles: Object.fromEntries(
      cues
        .filter(
          (cue) => cue.format || cue.highlight || cue.highlighted !== undefined,
        )
        .map((cue) => {
          // The Key words side edits every key word at once, under each word's own edits.
          const key = cue.highlighted === true && keyWords;
          const keyFormat = key && settings.keyFormat && Object.keys(settings.keyFormat).length ? settings.keyFormat : undefined;
          const format = keyFormat || cue.format ? { ...keyFormat, ...cue.format } : undefined;
          const keyFace = cap.keyFont && cue.highlighted === true && keyWords && settings.parts?.main?.font &&
            !(cue.format && ["font", "weight", "italic"].some((key) => key in cue.format!)) ? settings.parts.main : undefined;
          const own = { ...settings, ...format };
          const effective = keyFace
            ? { ...own, font: keyFace.font!, weight: keyFace.weight, italic: keyFace.italic,
                fontAsset: keyFace.fontAsset, fontUploadId: keyFace.fontUploadId }
            : own;
          const style = createBasicStyle(effective);
          const ownColor = !!cue.format && ["color", "colorMode", "gradientStops", "gradientAngle", "gradientScope"].some((key) => key in cue.format!);
          return [
            cue.id,
            {
              font: format || keyFace ? style.font : undefined,
              shadow: cue.format?.shadow,
              overrideColor: ownColor,
              ownFont: !!keyFace || (!!cue.format && ["font", "weight", "italic"].some((key) => key in cue.format!)),
              ownSize: !!cue.format && "size" in cue.format,
              // Renderers without a key word size of their own scale the word itself.
              sizeScale: cue.format?.sizeScale ?? (key && !nativeKeyScale && emphasis.scale !== 1 ? emphasis.scale : undefined),
              ownSpacing: !!format && "letterSpacing" in format,
              effects: format?.effects ? createTextEffects(effective) : undefined,
              textCase: format?.textCase,
              gradient: cue.format
                ? effective.colorMode === "gradient"
                  ? {
                      stops: effective.gradientStops ?? DEFAULT_GRADIENT,
                      angle: effective.gradientAngle ?? 90,
                      scope: effective.gradientScope ?? "word",
                    }
                  : null
                : undefined,
              // "Never" only removes a word from the key words; it must not switch off the
              // style's active-word effect on that word.
              highlighted: cap.emphasis === "hero" && cue.highlighted === false ? false : undefined,
              emphasized: cue.highlighted === true && keyWords,
              keyGradient:
                !ownColor && cue.highlighted === true && keyWords && emphasis.colorMode === "gradient" && emphasis.mode !== "fill" && !cue.highlight?.color
                  ? {
                      stops: emphasis.gradientStops ?? DEFAULT_GRADIENT,
                      angle: emphasis.gradientAngle ?? 90,
                      scope: "word" as const,
                    }
                  : undefined,
              highlight:
                cue.highlighted === true && keyWords
                  ? {
                      color: emphasis.color,
                      backgroundColor: emphasis.backgroundColor,
                      mode: emphasis.mode,
                      scale: emphasis.scale,
                      ...cue.highlight,
                      // A color picked for this word beats the shared key word color.
                      ...(ownColor ? { color: undefined } : {}),
                    }
                  : cue.highlight,
            },
          ];
        }),
    ),
    gradient:
      settings.colorMode === "gradient"
        ? {
            stops: settings.gradientStops ?? DEFAULT_GRADIENT,
            angle: settings.gradientAngle ?? 90,
            scope: settings.gradientScope ?? "word",
          }
        : undefined,
  };
}

export function createBasicInputProps(
  cues: Cue[],
  settings: CaptionSettings,
  videoSrc: string,
  duration: number,
): BasicCaptionProps {
  return {
    sourceConfig: createBasicSource(pagedCues(cues, settings, "simple-text"), videoSrc, duration),
    styleConfig: createBasicStyle(settings),
    presentationConfig: createPresentation(
      settings,
      createWordColors(cues),
      captionFallbacks(cues),
      cues,
    ),
  };
}
