import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue, normalizeWords } from "./LaunchCaptionPack/timeline";
import { CueMotionContext, useCueMotion } from "./BasicCaption/cueMotion";
import { evenSizeCap } from "./CaptionEngine/evenSize";
import { chosenEntrance, darken, gradientLine, lighten, usePartFonts, usePartSizes, type PartFace } from "./Premium/parts";
import { NO_SIZES, SAFE_WIDTH, sizeOf, type PartSizes } from "./Premium/sizes";
import { MotionWord } from "./Standard/MotionWord";
import type { CaptionSource, Word } from "./LaunchCaptionPack/types";
import transcript from "./StyleTwo/demo.transcript.json";
import type { BasicCaptionPresentation } from "./BasicCaption/BasicCaptionRenderer";
import { SourceVideo } from "./SourceVideo";
import { mixText } from "./Script/mix";
import { isComplexScript } from "./Script/scripts";

export type GlowAnchorProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: { positionY?: number; fontSize?: number; helperSize?: number; maxWidth?: number; accent?: string };
  reducedMotion?: boolean;
  presentationConfig?: BasicCaptionPresentation;
};
const SOURCE: CaptionSource = { transcript, durationMs: 44044, background: { src: "why_not_you_hq.mp4" } };
const clamp = (value: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const setting = (value: number | undefined, fallback: number, lo: number, hi: number) =>
  clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, lo, hi);
const ease = (value: number) => 1 - (1 - clamp(value)) ** 3;
const asset = (src: string) => /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);
const hindi = (text: string) => /[\u0900-\u097f]/u.test(text);
const bare = (text: string) => text.toLowerCase().replace(/’/gu, "'").replace(/[^\p{L}\p{M}\p{N}']/gu, "");
const STOP = new Set("a an the and or but of to for in on at from with by as is are was were be been being am i my me we our you your they their he his she her it its this that these those can could would should will have has had do does did so just very really now then than not don't got i'm i've i'll you're you've we'll we're they're it's that's एक यह वह और या तो को का की के में पर से है हैं मैं तुम आप हम भी ही जो कि नहीं".split(" "));
const POWER = new Set("dream dreams powerful power freedom courage discipline purpose success growth grow believe build create change achieve extraordinary unstoppable confidence confident financial future decisions decision opportunity possibilities potential passion strength breakthrough remarkable beautiful amazing happiness health healthy love life become becoming better best जीत सपने सपना सफलता हिम्मत विश्वास ताकत बदलाव आज़ादी मेहनत".split(" "));
const score = (word: Word) => {
  const text = bare(word.text);
  return (word.emphasis ? 100 : 0) - (STOP.has(text) || word.event ? 45 : 0) +
    (POWER.has(text) ? 9 : 0) + Math.min(22, [...text].length) * 1.9 +
    Math.min(2, (word.endMs - word.startMs) / 260) + (/\d/u.test(text) ? 3 : 0);
};
type AnchorCue = { id: string; words: Word[]; mainId: string; startMs: number; endMs: number };
const mainWordOf = (words: Word[]) => words.reduce((winner, word) => score(word) > score(winner) ? word : winner);
const compile = (words: Word[], fits: (words: Word[]) => boolean): AnchorCue[] => {
  const groups: Word[][] = [];
  for (let start = 0; start < words.length;) {
    let end = start + 1;
    // Search the whole phrase: a later, longer emphasis word may fit more helpers.
    // The number of helpers comes from measured text width, not a fixed word count.
    for (let next = start; next < words.length; next++) {
      const word = words[next]; const previous = words[next - 1];
      if (next > start && (previous.pageBreakAfter || previous.speaker !== word.speaker ||
        previous.event !== word.event || /[.!?।॥]["'”’)]?$/u.test(previous.text) ||
        word.startMs - previous.endMs > 380 || word.endMs - words[start].startMs > 3200 ||
        words.slice(start, next + 1).map(item => item.text).join(" ").length > 64)) break;
      if (fits(words.slice(start, next + 1))) end = next + 1;
    }
    groups.push(words.slice(start, end));
    start = end;
  }
  return groups.map((entries, index) => ({ id: `anchor-${entries[0].id}`, words: entries,
    mainId: mainWordOf(entries).id,
    startMs: entries[0].startMs,
    endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 180, groups[index + 1]?.[0].startMs ?? Infinity) }));
};

const FONT = [
  { family: "GlowAnchor Display", path: "luxe/Outfit-Black.woff2", weight: "900" },
  { family: "GlowAnchor Body", path: "editorial-type/fonts/roboto-variable.ttf", weight: "100 900" },
  { family: "GlowAnchor Hindi", path: "editorial-type/fonts/noto-sans-devanagari.ttf", weight: "100 900" },
] as const;
const fontPromises = new Map<string, Promise<void>>();
const loadFonts = (needsHindi: boolean) => Promise.all(FONT.slice(0, needsHindi ? 3 : 2).map(font => {
  if (!fontPromises.has(font.family)) {
    const promise = new FontFace(font.family, `url(${JSON.stringify(asset(font.path))})`, { weight: font.weight })
      .load().then(face => { document.fonts.add(face); });
    fontPromises.set(font.family, promise);
    void promise.catch(() => fontPromises.delete(font.family));
  }
  return fontPromises.get(font.family)!;
}));
// Ink edges scale with the font, so a word is rasterized once and every size reads from that.
const INK_SIZE = 200;
const inkEdges = new Map<string, { left: number; right: number }>();
type Item = { word: Word; text: string; x: number; y: number; size: number; family: string;
  weight: number; italic: boolean; tracking: number; scaleY: number; main: boolean; left: number; right: number; ascent: number; descent: number; advance: number };
type AnchorLayout = AnchorCue & { items: Item[]; top: number; bottom: number; column: number };
const layout = (words: Word[], ctx: CanvasRenderingContext2D, height: number,
  config: GlowAnchorProps["styleConfig"], faces: { main?: PartFace; helper?: PartFace }, sizes: PartSizes, extra = 0): AnchorLayout[] => {
  const maxWidth = 720 * setting(config?.maxWidth, .84, .6, .9);
  const mainSize = setting(config?.fontSize, 120, 66, 160);
  const helperSize = setting(config?.helperSize, 49, 32, 64);
  // Chunks and the even size come from the design alone; size picks go on top.
  let own = NO_SIZES;
  // Native captions (Hindi…): one main size and one helper size for every chunk, so no chunk jumps big or small.
  const native = words.some(word => isComplexScript(word.text));
  const positionY = setting(config?.positionY, .77, .4, .83);
  // Font advance boxes include invisible side bearings and can omit tracking.
  // Sample the rendered ink once per word to find the real visible edges.
  const inkCanvas = document.createElement("canvas");
  const inkCtx = inkCanvas.getContext("2d", { willReadFrequently: true });
  if (!inkCtx) throw new Error("GlowAnchor needs a canvas to align its glyphs.");
  const measure = (word: Word, main: boolean, requested: number, whole = false) => {
    const size = requested * sizeOf(own, main ? "main" : "helper", word.id);
    // Mix: the main word reads in English letters, the helpers in the speaker's script.
    const text = main ? mixText(word).toUpperCase() : word.text;
    const face = main ? faces.main : faces.helper;
    const family = face?.family ?? (main ? "GlowAnchor Display" : "GlowAnchor Body");
    const weight = face?.weight ?? (main ? 900 : 550);
    const italic = face?.italic === true;
    const fontStyle = italic ? "italic " : "";
    // Spacing picked in the editor, as a share of the word's size.
    const tracking = size * extra;
    // Joined scripts hang their letters from a headline and stack signs below: a softer stretch keeps them readable.
    const scaleY = main && !whole ? isComplexScript(text) ? 1.16 : 1.42 : 1;
    ctx.font = `${fontStyle}${weight} ${size}px "${family}"`; ctx.letterSpacing = `${tracking}px`;
    const m = ctx.measureText(text);
    const key = JSON.stringify([text, family, weight, italic, extra, main, whole]);
    let edges = inkEdges.get(key);
    if (!edges) {
      const inkFont = `${fontStyle}${weight} ${INK_SIZE}px "${family}"`;
      inkCtx.font = inkFont;
      const large = inkCtx.measureText(text);
      const padding = Math.ceil(Math.abs(large.actualBoundingBoxLeft || 0) + INK_SIZE * .3 + 8);
      inkCanvas.width = Math.max(1, Math.ceil(Math.max(large.width, large.actualBoundingBoxRight || 0) +
        Math.abs(INK_SIZE * extra) * [...text].length + padding * 2));
      inkCanvas.height = Math.max(1, Math.ceil(INK_SIZE * 2.6 + 16));
      inkCtx.font = inkFont;
      inkCtx.letterSpacing = `${INK_SIZE * extra}px`;
      inkCtx.fontKerning = "normal";
      const baseline = Math.ceil(INK_SIZE * 1.6);
      inkCtx.fillText(main && !whole ? text.replace(/[^\p{L}\p{M}\p{N}]+$/gu, "") : text, padding, baseline);
      const pixels = inkCtx.getImageData(0, 0, inkCanvas.width, inkCanvas.height).data;
      let first = inkCanvas.width; let last = -1;
      for (let pixel = 0; pixel < pixels.length / 4; pixel++) {
        if (pixels[pixel * 4 + 3] <= 8) continue;
        if (main && !whole) {
          // The lower outline disappears in the fade; align to the visible crown.
          const row = Math.floor(pixel / inkCanvas.width);
          const inkTop = baseline - (large.actualBoundingBoxAscent || INK_SIZE * .75);
          const inkHeight = (large.actualBoundingBoxAscent || INK_SIZE * .75) + Math.max(0, large.actualBoundingBoxDescent || 0);
          if ((row - inkTop) / Math.max(1, inkHeight) > .6) continue;
        }
        const column = pixel % inkCanvas.width;
        first = Math.min(first, column); last = Math.max(last, column);
      }
      edges = last >= first ? { left: padding - first, right: last + 1 - padding } :
        { left: 0, right: large.width };
      inkEdges.set(key, edges);
    }
    return { word, text, main, family, weight, italic, tracking, scaleY, size,
      left: edges.left * size / INK_SIZE, right: edges.right * size / INK_SIZE,
      ascent: (Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * .75) * scaleY,
      descent: (Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * .2) * scaleY,
      advance: m.width };
  };
  const metrics = (entries: Word[], cap = 1) => {
    const mainWord = mainWordOf(entries);
    const helpers = entries.filter(word => word.id !== mainWord.id);
    const natural = helpers.map(word => measure(word, false, helperSize));
    const helperInkWidth = natural.reduce((sum, item) => sum + item.left + item.right, 0);
    const minimumGap = Math.max(16, helperSize * .34);
    const helperWidth = helperInkWidth + minimumGap * Math.max(0, helpers.length - 1);
    // A word that never gets a helper shows whole, so it drops the stretch and sits a little smaller.
    const alone = !helpers.length;
    const baseSize = alone ? mainSize * .84 : mainSize;
    const raw = measure(mainWord, true, baseSize, alone);
    // A short headline can grow slightly to keep its supporting line readable.
    const pick = sizeOf(own, "main", mainWord.id);
    const requestedWidth = Math.max(raw.left + raw.right, helperWidth / own.helper * .84 * pick);
    const room = (Math.max(maxWidth, Math.min(720 * SAFE_WIDTH, maxWidth * pick)) - 20) / Math.max(1, raw.left + raw.right);
    const headlineScale = native ? Math.min(cap, room) : Math.min(cap < 1 ? cap : 1.18, requestedWidth / Math.max(1, raw.left + raw.right), room);
    const main = measure(mainWord, true, baseSize * headlineScale, alone);
    const mainWidth = main.left + main.right;
    return { main, mainWidth, helpers, helperWidth, fit: Math.min(1, room) };
  };
  const cues = compile(words, entries => {
    const { mainWidth, helperWidth, helpers } = metrics(entries);
    return !helpers.length || helperWidth * .86 <= mainWidth - 4;
  });
  // A long headline never sits beside one far bigger: sizes hold together across the video.
  const cap = evenSizeCap(cues.map(cue => metrics(cue.words).fit));
  const designed = cues.map(cue => metrics(cue.words, cap).mainWidth);
  const columns = cues.map((_, index) => Math.max(1, Math.min(maxWidth - 20, (designed[index] - 4))));
  const evenHelper = helperSize * evenSizeCap(cues.map((cue, index) => {
    const { helperWidth, helpers } = metrics(cue.words, cap);
    return helpers.length ? Math.min(1, columns[index] / Math.max(1, helperWidth)) : 1;
  }));
  own = sizes;
  return cues.map((cue, index) => {
    const { main, mainWidth, helpers, helperWidth } = metrics(cue.words, cap);
    const x = 360 - (main.right - main.left) / 2;
    const mainBaseline = height * positionY + main.ascent / 2;
    const items: Item[] = [{ ...main, x, y: mainBaseline }];
    let column = mainWidth;
    if (helpers.length) {
      // The helper line keeps its own width, so the main word and helpers resize apart.
      const columnWidth = Math.max(1, Math.min(maxWidth - 20, (designed[index] - 4) * sizes.helper));
      column = Math.max(mainWidth, columnWidth + 4);
      let size = native ? evenHelper * sizes.helper * Math.min(1, (maxWidth - 20) / Math.max(1, helperWidth * evenHelper / helperSize))
        : helperSize * Math.min(1, columnWidth / Math.max(1, helperWidth));
      let measured = helpers.map(word => measure(word, false, size));
      // Remeasure at the fitted size: ink bearings are not perfectly proportional.
      for (let pass = 0; pass < 4; pass++) {
        const width = measured.reduce((sum, item) => sum + item.left + item.right, 0) +
          Math.max(16, size * .34) * (helpers.length - 1);
        if (width <= (native ? maxWidth - 20 : columnWidth)) break;
        size *= columnWidth / width * .995;
        measured = helpers.map(word => measure(word, false, size));
      }
      const inkWidth = measured.reduce((sum, item) => sum + item.left + item.right, 0);
      // Native helpers keep their even size; spread from the main word's first letter to its last, like English.
      const natural = inkWidth + Math.max(16, size * .34) * (helpers.length - 1);
      const spread = native ? Math.max(columnWidth, natural) : columnWidth;
      if (native) column = Math.max(column, spread + 4);
      const gap = helpers.length > 1 ? (spread - inkWidth) / (helpers.length - 1) : 0;
      const ascent = Math.max(...measured.map(item => item.ascent));
      const mainBottom = mainBaseline + Math.max(main.descent, 0);
      const mainHeight = main.ascent + Math.max(main.descent, 0);
      const baseline = mainBottom - mainHeight * .34 + ascent;
      // Align visible glyph edges, rather than invisible font advance boxes.
      let cursor = 360 - (helpers.length > 1 ? spread : inkWidth) / 2;
      measured.forEach(item => {
        items.push({ ...item, x: cursor + item.left, y: baseline });
        cursor += item.left + item.right + gap;
      });
    }
    const top = Math.min(...items.map(item => item.y - item.ascent));
    const bottom = Math.max(...items.map(item => item.y + item.descent));
    const shift = Math.max(height * .08 - top, Math.min(height * .89 - bottom, height * positionY - (top + bottom) / 2));
    return { ...cue, column, items: items.map(item => ({ ...item, y: item.y + shift })), top: top + shift, bottom: bottom + shift };
  });
};

export const GlowAnchor: React.FC<GlowAnchorProps> = ({ sourceConfig = SOURCE, styleConfig, reducedMotion = false, presentationConfig }) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps; const canvasHeight = height * 720 / width;
  const id = `anchor-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const words = useMemo(() => normalizeWords(sourceConfig).words, [sourceConfig]);
  const needsHindi = useMemo(() => words.some(word => hindi(word.text)), [words]);
  const [ready, setReady] = useState<boolean | null>(null);
  const parts = presentationConfig?.parts;
  const { faces, ready: facesReady } = usePartFonts(parts);
  const sizes = usePartSizes(presentationConfig);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    setReady(null);
    const handle = delayRender("Loading GlowAnchor fonts");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void loadFonts(needsHindi).then(() => { if (!disposed) setReady(needsHindi); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [needsHindi, delayRender, continueRender, cancelRender]);
  const tracking = presentationConfig?.tracking ?? 0;
  // The accent is only painted, so picking a color keeps the measured layout.
  const { maxWidth: fitWidth, fontSize: fitSize, helperSize: fitHelper, positionY: fitY } = styleConfig ?? {};
  const layouts = useMemo(() => {
    if (ready !== needsHindi || !facesReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("GlowAnchor needs a canvas to measure its typography.");
    return layout(words, ctx, canvasHeight, { maxWidth: fitWidth, fontSize: fitSize, helperSize: fitHelper, positionY: fitY }, faces, sizes, tracking);
  }, [ready, needsHindi, facesReady, faces, sizes, words, canvasHeight, fitWidth, fitSize, fitHelper, fitY, tracking]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => {
    if (layouts.length) onLayout?.((Math.max(...layouts.map(l => l.bottom - l.top)) + 36) * width / 720);
  }, [layouts, onLayout, width]);
  const cue = activeCue(layouts, now);
  useCueMotion(cue?.startMs, cue?.endMs);
  const main = cue?.items.find(item => item.main);
  const mainLook = parts?.main;
  const stops = mainLook?.gradient?.stops;
  const accent = stops?.[0]?.color ?? mainLook?.color ?? styleConfig?.accent ?? "#a870ff";
  const chosen = !!mainLook?.color;
  const motion = useContext(CueMotionContext)?.animation;
  // The lower fade seats the helper line, so a caption with no helper keeps its word whole.
  const seated = (cue?.items.length ?? 0) > 1;
  // Gradients stay in the headline's native coordinates, then stretch with its glyphs.
  // A native main word fades less, so the letters under its headline stay readable.
  const soft = !!main && isComplexScript(main.text);
  const at = (offset: number) => soft ? .3 + offset * .7 : offset;
  const mainTop = main ? main.y - main.ascent / main.scaleY : 0;
  const mainBottom = main ? main.y + Math.max(0, main.descent) / main.scaleY : 0;
  const mainLeft = main ? main.x - main.left : 0;
  const mainWidth = main ? main.left + main.right : 1;
  const mainAge = main ? now - main.word.startMs : 0;
  const shineProgress = reducedMotion ? -1 : clamp((mainAge - 80) / 1050);
  const shineX = mainLeft - mainWidth * .5 + shineProgress * mainWidth * 2;
  const spokenEnd = cue ? Math.max(...cue.words.map(word => word.endMs)) : 0;
  const exitMs = cue ? Math.min(100, Math.max(0, cue.endMs - spokenEnd)) : 0;
  const exit = cue && exitMs > 0 && !reducedMotion ? ease((cue.endMs - now) / exitMs) : 1;
  const background = sourceConfig.background;
  return <AbsoluteFill style={{ backgroundColor: presentationConfig?.backgroundColor ?? "#121118", overflow: "hidden", pointerEvents: "none" }}>
    {background?.src ? background.kind === "image" ? <Img src={asset(background.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(background.src)} muted={background.muted ?? false}
        volume={setting(background.volume, 1, 0, 1)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {!presentationConfig?.onLayout && background?.src && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,.62) 0%, rgba(0,0,0,.34) 20%, rgba(0,0,0,.10) 39%, transparent 56%)" }} />}
    {cue && main ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`}
      role="img" aria-label={cue.words.map(word => word.text).join(" ")}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <clipPath id={`${id}-helper-column`} clipPathUnits="userSpaceOnUse">
          <rect x={360 - cue.column / 2} y={cue.top - 60} width={cue.column} height={cue.bottom - cue.top + 120} />
        </clipPath>
        {stops ? (() => {
          const line = gradientLine(mainLook?.gradient?.angle ?? 90);
          return <linearGradient id={`${id}-ink`} gradientUnits="userSpaceOnUse"
            x1={mainLeft + line.x1 * mainWidth} y1={mainTop + line.y1 * (mainBottom - mainTop)}
            x2={mainLeft + line.x2 * mainWidth} y2={mainTop + line.y2 * (mainBottom - mainTop)}>
            {stops.map((stop, index) => <stop key={index} offset={stop.position / 100} stopColor={stop.color} />)}
          </linearGradient>;
        })() : <linearGradient id={`${id}-ink`} gradientUnits="userSpaceOnUse" x1="0" y1={mainTop} x2="0" y2={mainBottom}>
          <stop offset="0" stopColor={chosen ? lighten(accent, .32) : "#d096ff"} />
          <stop offset=".38" stopColor={accent} />
          <stop offset="1" stopColor={!seated ? accent : chosen ? darken(accent, .42) : "#6326a8"} />
        </linearGradient>}
        <linearGradient id={`${id}-shine`} gradientUnits="userSpaceOnUse"
          x1={shineX - mainWidth * .2} y1={mainTop} x2={shineX + mainWidth * .2} y2={mainBottom}>
          <stop offset="0" stopColor={chosen || stops ? lighten(accent, .45) : "#df9dff"} stopOpacity="0" />
          <stop offset=".5" stopColor={chosen || stops ? lighten(accent, .45) : "#df9dff"} stopOpacity=".85" />
          <stop offset="1" stopColor={chosen || stops ? lighten(accent, .45) : "#df9dff"} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1="0" y1={mainTop} x2="0" y2={mainBottom}>
          <stop offset={at(0)} stopColor="white" /><stop offset={at(.2)} stopColor="white" />
          <stop offset={at(.4)} stopColor="#dddddd" /><stop offset={at(.6)} stopColor="#888888" />
          <stop offset={at(.78)} stopColor={soft ? "#777777" : "#303030"} /><stop offset={at(.94)} stopColor={soft ? "#666666" : "#080808"} />
          <stop offset={at(1)} stopColor={soft ? "#5a5a5a" : "black"} />
        </linearGradient>
        <linearGradient id={`${id}-sharpness`} gradientUnits="userSpaceOnUse" x1="0" y1={mainTop} x2="0" y2={mainBottom}>
          <stop offset={at(0)} stopColor="white" /><stop offset={at(.25)} stopColor="white" />
          <stop offset={at(.45)} stopColor="#aaaaaa" /><stop offset={at(.72)} stopColor="black" />
          <stop offset={at(1)} stopColor="black" />
        </linearGradient>
        <linearGradient id={`${id}-softness`} gradientUnits="userSpaceOnUse" x1="0" y1={mainTop} x2="0" y2={mainBottom}>
          <stop offset={at(0)} stopColor="black" /><stop offset={at(.25)} stopColor="black" />
          <stop offset={at(.45)} stopColor="#555555" /><stop offset={at(.72)} stopColor="white" />
          <stop offset={at(1)} stopColor="white" />
        </linearGradient>
        {["fade", "sharpness", "softness"].map(name => <mask key={name} id={`${id}-${name}-mask`}
          maskUnits="userSpaceOnUse" x="0" y={mainTop - 60} width="720" height={mainBottom - mainTop + 120}
          style={{ maskType: "luminance" }}>
          <rect x="0" y={mainTop - 60} width="720" height={mainBottom - mainTop + 120} fill={`url(#${id}-${name})`} />
        </mask>)}
        <filter id={`${id}-bottom-blur`} x="-50%" y="-150%" width="200%" height="400%">
          <feGaussianBlur stdDeviation={soft ? 3.5 : 8.4} />
        </filter>
        <filter id={`${id}-glow`} x="-35%" y="-100%" width="170%" height="300%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="wide" />
          <feFlood floodColor={accent} floodOpacity=".6" /><feComposite in2="wide" operator="in" result="halo" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="tight" />
          <feFlood floodColor={accent} floodOpacity=".5" /><feComposite in2="tight" operator="in" result="core" />
          <feMerge><feMergeNode in="halo" /><feMergeNode in="core" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g opacity={exit}>
        {cue.items.map(item => {
          const age = now - item.word.startMs;
          if (age < 0) return null;
          const available = Math.max(1, Math.min(item.word.endMs, cue.endMs) - item.word.startMs);
          const still = reducedMotion || chosenEntrance(motion, item.main, item.word.id);
          // Default entrance: the main word slides up, helpers slide in towards the right.
          const p = still ? 1 : ease((age + 1000 / fps * .3) / Math.max(1, Math.min(240, available * .85)));
          const opacity = still ? 1 : ease((age + 1000 / fps * .3) / Math.max(1, Math.min(item.main ? 160 : 120, available * .85)));
          const textProps = { x: item.x, y: item.y, fontFamily: `"${item.family}"`, fontWeight: item.weight,
            fontStyle: item.italic ? "italic" : "normal", fontSize: item.size, letterSpacing: item.tracking, stroke: "none",
            style: { whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal", textRendering: "geometricPrecision" } as React.CSSProperties };
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main={item.main}><g opacity={opacity} transform={item.main ? `translate(0 ${(1 - p) * 34})` : `translate(${(p - 1) * 30} 0)`}>
            {item.main ? <g transform={`translate(0 ${item.y}) scale(1 ${item.scaleY}) translate(0 ${-item.y})`}
              mask={seated ? `url(#${id}-fade-mask)` : undefined}>
              <g filter={`url(#${id}-glow)`}>
                <text {...textProps} fill={`url(#${id}-ink)`} mask={seated ? `url(#${id}-sharpness-mask)` : undefined}>{item.text}</text>
                {seated ? <g mask={`url(#${id}-softness-mask)`}>
                  <text {...textProps} fill={`url(#${id}-ink)`} filter={`url(#${id}-bottom-blur)`}>{item.text}</text>
                </g> : null}
                {shineProgress > 0 && shineProgress < 1 ? <text {...textProps} fill={`url(#${id}-shine)`}
                  mask={seated ? `url(#${id}-sharpness-mask)` : undefined}>{item.text}</text> : null}
              </g>
            </g> : <g clipPath={`url(#${id}-helper-column)`}><text {...textProps} fill={parts?.helper?.color ?? "#f8f5f0"}>{item.text}</text></g>}
          </g></MotionWord>;
        })}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolveGlowAnchorMetadata = ({ props }: { props: GlowAnchorProps }) => {
  const source = props.sourceConfig ?? SOURCE;
  const { words } = normalizeWords(source);
  const duration = words.reduce((end, word) => Math.max(end, word.endMs + 180),
    setting(source.durationMs, 1000, 1000, 86400000));
  return { fps: 30, durationInFrames: Math.max(1, Math.ceil(duration * 30 / 1000)) };
};
