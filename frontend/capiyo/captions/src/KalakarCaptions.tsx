import { MotionWord } from "./Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "./BasicCaption/cueMotion";
import React, { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue, normalizeWords } from "./LaunchCaptionPack/timeline";
import { LineRevealContext, revealLines } from "./Standard/reveal";
import { PartSizesContext, usePartFonts, type PartFace, type PremiumParts } from "./Premium/parts";
import { NO_SIZES, SAFE_WIDTH, type PartSizes } from "./Premium/sizes";
import type { CaptionSource, Word } from "./LaunchCaptionPack/types";
import transcript from "./StyleTwo/demo.transcript.json";
import { SourceVideo } from "./SourceVideo";
import { isComplexScript, textLength, wordCount } from "./Script/scripts";
import { topLineWord } from "./Script/mix";

// Inspected in the user's selected Kalakar templates:
// Double Trouble: Montserrat 800 above Inter 300, both at the same nominal size.
// Shamani: native text runs follow one continuous animated baseline per row.
// The shared wave preserves shaping and spacing instead of moving isolated letters.
// Its public font-face source: https://app.kalakar.io/fonts/TheBoldFont.ttf
type Variant = "double-trouble" | "shamani";
export type KalakarCaptionProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: {
    fontSize?: number;
    positionY?: number;
    maxWidth?: number;
    glow?: number;
    waveAmplitude?: number;
    wavePeriod?: number;
    naturalWrap?: boolean;
    onLayout?: (height: number) => void;
    /** Words on the top and bottom line, picked in the editor; missing ones are left to the layout. */
    lineWords?: { top?: number; bottom?: number };
  };
  presentationConfig?: {
    onLayout?: (height: number) => void;
    backgroundColor?: string;
    reducedMotion?: boolean;
    parts?: PremiumParts;
  };
  reducedMotion?: boolean;
};
const SOURCE: CaptionSource = { transcript, durationMs: 44044, background: { src: "why_not_you_hq.mp4" } };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const numeric = (value: number | undefined, fallback: number, min: number, max: number) =>
  clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const out = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
const FONTS = [
  { family: "Reference Montserrat", src: "/api/caption-assets/montserrat-bold", fallbackSrc: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: "100 900" },
  { family: "Reference Inter", src: "/api/caption-assets/basic-inter", fallbackSrc: "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf", weight: "100 900" },
  { family: "Reference Bold", src: "/api/caption-assets/montserrat-bold", fallbackSrc: "kalakar-reference/TheBoldFont.ttf", weight: "900" },
  { family: "Reference Hindi", src: "/api/caption-assets/basic-devanagari", fallbackSrc: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", weight: "100 900" },
];
let fontPromise: Promise<void> | undefined;
const loadFonts = () => {
  if (!fontPromise) {
    fontPromise = Promise.all(FONTS.map(async font => {
      try {
        const url = typeof window !== "undefined" && window.location?.port === "3001" ? font.src : asset(font.fallbackSrc);
        const face = new FontFace(font.family, `url(${JSON.stringify(url)})`, { weight: font.weight });
        document.fonts.add(await face.load());
      } catch {
        try {
          const face = new FontFace(font.family, `url(${JSON.stringify(asset(font.fallbackSrc))})`, { weight: font.weight });
          document.fonts.add(await face.load());
        } catch {
          // Graceful fallback
        }
      }
    })).then(() => undefined);
    void fontPromise.catch(() => { fontPromise = undefined; });
  }
  return fontPromise;
};

type LineWords = { top?: number; bottom?: number };
type CaptionCue = { id: string; words: Word[]; startMs: number; endMs: number };
const compileCues = (source: CaptionSource, variant: Variant, lineWords: LineWords = {}): CaptionCue[] => {
  const picked = lineWords.top !== undefined || lineWords.bottom !== undefined;
  const most = picked ? (lineWords.top ?? 2) + (lineWords.bottom ?? 3) : variant === "shamani" ? 4 : 5;
  const { words } = normalizeWords(source); const groups: Word[][] = []; let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of words) {
    const previous = group[group.length - 1];
    // Native captions (Hindi…): Double Trouble holds 3-4 words a line, so a card takes up to 7 and a longer breath. English is unchanged.
    const native = variant === "double-trouble" && !picked && isComplexScript(word.text);
    if (previous && word.startMs > previous.startMs && (previous.pageBreakAfter || previous.speaker !== word.speaker ||
      previous.event !== word.event || /[.!?।॥]["'”’)]?$/u.test(previous.text) || word.startMs - previous.endMs > (native ? 520 : 340) ||
      wordCount(group) >= (native ? 7 : most) ||
      (!picked && textLength([...group, word].map(w => w.text).join(" ")) > (variant === "shamani" ? 26 : native ? 46 : 35)) ||
      word.endMs - group[0].startMs > (native ? 3600 : 2400))) flush();
    group.push(word);
  }
  flush();
  return groups.map((entries, i) => ({ id: `reference-${entries[0].id}`, words: entries, startMs: entries[0].startMs,
    endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 240, groups[i + 1]?.[0].startMs ?? Infinity) }));
};

type PlacedWord = { word: Word; text: string; x: number; baseline: number; size: number;
  family: string; weight: number; italic?: boolean; width: number; inkOffset: number; row: number };
/** Fonts picked in the editor: the top line's, and the rest's. */
type Picked = { top?: PartFace; bottom?: PartFace };
type PlacedCue = CaptionCue & { items: PlacedWord[]; top: number; bottom: number };

// Cubic Hermite segments follow a sine baseline. Arc-length offsets keep each
// word anchored to its measured horizontal position as the wave travels past.
const waveBaseline = (baseline: number, amplitude: number, phase: number) => {
  const frequency = 2 * Math.PI / 420;
  const y = (x: number) => baseline + amplitude * Math.sin(phase - (x - 360) * frequency);
  const slope = (x: number) => -amplitude * frequency * Math.cos(phase - (x - 360) * frequency);
  let d = `M -40 ${y(-40)}`;
  for (let x = -40; x < 760; x += 40) {
    d += ` C ${x + 40 / 3} ${y(x) + slope(x) * 40 / 3}, ${x + 80 / 3} ${y(x + 40) - slope(x + 40) * 40 / 3}, ${x + 40} ${y(x + 40)}`;
  }
  const offset = (targetX: number) => {
    const length = Math.max(0, targetX + 40);
    const steps = Math.max(2, Math.ceil(length / 10) * 2);
    const step = length / steps;
    let sum = 0;
    for (let i = 0; i <= steps; i++) {
      const derivative = slope(-40 + i * step);
      sum += Math.sqrt(1 + derivative * derivative) * (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2);
    }
    return sum * step / 3;
  };
  return { d, offset };
};
const layoutCues = (cues: CaptionCue[], variant: Variant, canvasHeight: number, fontSize: number,
  positionY: number, maxWidth: number, ctx: CanvasRenderingContext2D, naturalWrap = false, sizes: PartSizes = NO_SIZES, picked: Picked = {}, lineWords: LineWords = {}): PlacedCue[] => {
  const capacity = 720 * Math.max(maxWidth, Math.min(SAFE_WIDTH, maxWidth * Math.max(sizes.main, sizes.helper)));
  return cues.map(cue => {
    const measure = (entries: Word[], row: number, size: number) => {
      const weight = variant === "shamani" ? 900 : row === 0 ? 800 : 300;
      const tracking = variant === "shamani" ? size * .018 : 0;
      const items = entries.map(word => {
        const own = size * (variant === "double-trouble" ? row === 0 ? sizes.main : sizes.helper : 1) * (sizes.words[word.id] ?? 1);
        // Mix: Double Trouble's top line reads in English letters, its bottom line in the speaker's script.
        const shown = variant === "double-trouble" && row === 0 ? topLineWord(word).text : word.text;
        const text = variant === "shamani" ? shown.toUpperCase() : shown;
        // Hindi letters in any font come from Script/ScriptFonts.
        const pick = variant === "double-trouble" && row === 0 ? picked.top : picked.bottom;
        const family = pick?.family ?? (variant === "shamani" ? "Reference Bold" :
          row === 0 ? "Reference Montserrat" : "Reference Inter");
        const face = pick?.weight ?? weight, italic = pick?.italic === true;
        // Measured with the same font list it is drawn with, so words never run into each other.
        ctx.font = `${italic ? "italic " : ""}${face} ${own}px "${family}", "Montserrat", "Inter", sans-serif`; ctx.letterSpacing = `${tracking}px`;
        const m = ctx.measureText(text);
        const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
        const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
        const width = Math.max(m.width, left + right);
        // Render each word as a native text run so shaping and spacing agree.
        return { word, text, family, weight: face, italic, size: own, width, inkOffset: left,
          ascent: Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * .8,
          descent: Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * .2 };
      });
      const gap = Math.max(size, ...items.map(item => item.size)) * (variant === "shamani" ? .26 : .25);
      return { items, gap, width: items.reduce((sum, item) => sum + item.width, 0) + Math.max(0, items.length - 1) * gap };
    };
    const initial = fontSize * (cue.words.length === 1 ? 1.12 : 1);
    let size = initial; let split = cue.words.length;
    const chooseSplit = () => {
      if (cue.words.length < 2 || variant === "shamani" && measure(cue.words, 0, size).width <= capacity) return cue.words.length;
      // A picked word count for a line sets the split; with both picked, the top line's count wins.
      const last = cue.words.length - 1;
      if (lineWords.top !== undefined) return Math.max(1, Math.min(lineWords.top, last));
      if (lineWords.bottom !== undefined) return Math.max(1, cue.words.length - lineWords.bottom);
      let best = 1; let bestScore = Infinity;
      for (let i = 1; i < cue.words.length; i++) {
        const a = measure(cue.words.slice(0, i), 0, size).width;
        const b = measure(cue.words.slice(i), 1, size).width;
        const score = Math.max(a, b) + Math.abs(a - b) * .24;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      return best;
    };
    split = chooseSplit();
    let rows = [measure(cue.words.slice(0, split), 0, size),
      ...(split < cue.words.length ? [measure(cue.words.slice(split), 1, size)] : [])];
    while (Math.max(...rows.map(row => row.width)) > capacity && size > 5) {
      size -= 1; split = chooseSplit();
      rows = [measure(cue.words.slice(0, split), 0, size),
        ...(split < cue.words.length ? [measure(cue.words.slice(split), 1, size)] : [])];
    }
    const metrics = rows.map(row => ({ a: Math.max(...row.items.map(item => item.ascent)), d: Math.max(...row.items.map(item => item.descent)) }));
    const lineGap = size * (variant === "shamani" ? .24 : .15);
    const totalHeight = metrics.reduce((sum, m) => sum + m.a + m.d, 0) + Math.max(0, rows.length - 1) * lineGap;
    const top = naturalWrap
      ? Math.max(4, (canvasHeight - totalHeight) / 2)
      : clamp(canvasHeight * positionY - totalHeight / 2, canvasHeight * .12,
          Math.max(canvasHeight * .12, canvasHeight * .85 - totalHeight - 10));
    let y = top;
    const items = rows.flatMap((row, rowIndex) => {
      let x = (720 - row.width) / 2; const baseline = y + metrics[rowIndex].a;
      const result = row.items.map(item => {
        const placed = { ...item, x, baseline, row: rowIndex };
        x += item.width + row.gap; return placed;
      });
      y += metrics[rowIndex].a + metrics[rowIndex].d + lineGap;
      return result;
    });
    return { ...cue, items, top, bottom: top + totalHeight };
  });
};

const ReferenceCaptions: React.FC<KalakarCaptionProps & { variant: Variant }> = ({
  sourceConfig = SOURCE, styleConfig, presentationConfig, reducedMotion = false, variant,
}) => {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const now = frame * 1000 / fps; const seconds = frame / fps; const canvasHeight = height * 720 / width;
  const uid = `reference-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const fontSize = numeric(styleConfig?.fontSize, variant === "shamani" ? 55 : 53, 28, 100);
  const positionY = numeric(styleConfig?.positionY, .73, .2, .82);
  const maxWidth = numeric(styleConfig?.maxWidth, .84, .5, .9);
  const glow = numeric(styleConfig?.glow, variant === "shamani" ? .7 : 0, 0, 1);
  const waveAmplitude = numeric(styleConfig?.waveAmplitude, fontSize * .085, 0, 10);
  const wavePeriod = numeric(styleConfig?.wavePeriod, 2.4, 1.4, 6);
  const naturalWrap = styleConfig?.naturalWrap === true;
  const onLayout = styleConfig?.onLayout ?? presentationConfig?.onLayout;
  const [ready, setReady] = useState(false);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    const handle = delayRender("Loading the reference caption fonts");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void loadFonts().then(() => { if (!disposed) setReady(true); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [delayRender, continueRender, cancelRender]);
  const top = styleConfig?.lineWords?.top, bottom = styleConfig?.lineWords?.bottom;
  const lineWords = useMemo<LineWords>(() => ({ top, bottom }), [top, bottom]);
  const cues = useMemo(() => compileCues(sourceConfig, variant, lineWords), [sourceConfig, variant, lineWords]);
  const byLine = useContext(LineRevealContext);
  const sizes = useContext(PartSizesContext);
  // Double Trouble's top line takes the main font, its bottom line (and all of Shamani) the other one.
  const { faces: partFaces, ready: partsReady } = usePartFonts(presentationConfig?.parts);
  const picked = useMemo<Picked>(() => ({ top: partFaces.main, bottom: partFaces.helper }), [partFaces]);
  const layouts = useMemo(() => {
    if (!ready || !partsReady) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Caption layout requires a 2D canvas.");
    const placed = layoutCues(cues, variant, canvasHeight, fontSize, positionY, maxWidth, ctx, naturalWrap, sizes, picked, lineWords);
    return byLine ? placed.map(cue => ({ ...cue, items: revealLines(cue.items, item => item.row) })) : placed;
  }, [ready, partsReady, cues, variant, canvasHeight, fontSize, positionY, maxWidth, naturalWrap, byLine, sizes, picked, lineWords]);
  useLayoutEffect(() => {
    if (!ready || !onLayout || !layouts.length) return;
    const maxHeight = Math.max(...layouts.map(l => l.bottom - l.top));
    onLayout(maxHeight * width / 720);
  }, [ready, onLayout, layouts, width]);
  const cue = activeCue(layouts, now); const next = cue ? layouts[layouts.indexOf(cue) + 1] : undefined;
  useCueMotion(cue?.startMs, cue?.endMs);
  const chosen = useChosenEntrance();
  const exit = cue && (!next || next.startMs > cue.endMs + 30) && !reducedMotion ? ease((cue.endMs - now) / 120) : 1;
  const background = sourceConfig.background;
  const shimmer = reducedMotion ? 0 : Math.sin(seconds * .42) * 18;
  const waves = new Map<number, ReturnType<typeof waveBaseline>>();
  if (cue && variant === "shamani" && !reducedMotion && waveAmplitude > 0) {
    for (const item of cue.items) if (!waves.has(item.row)) waves.set(item.row,
      waveBaseline(item.baseline, waveAmplitude * item.size / fontSize,
        seconds * 2 * Math.PI / wavePeriod - item.row * .45));
  }
  return <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", backgroundColor: presentationConfig?.backgroundColor ?? "#202624" }}>
    {background?.src ? background.kind === "image" ? <Img src={asset(background.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(background.src)} muted={background.muted ?? false}
        volume={numeric(background.volume, 1, 0, 1)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {background?.src ? <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,.34) 0%, rgba(0,0,0,.12) 34%, transparent 65%)" }} /> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`} role="img"
      aria-label={cue.words.map(word => word.text).join(" ")} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        {[...waves.entries()].map(([row, wave]) => <path key={row} id={`${uid}-wave-${row}`} d={wave.d} />)}
        <linearGradient id={`${uid}-fill`} gradientUnits="userSpaceOnUse" x1={40 + shimmer} y1={cue.top}
          x2={680 + shimmer} y2={cue.bottom}>
          <stop offset="0%" stopColor="#ffffff" /><stop offset="38%" stopColor="#ffffff" />
          <stop offset="73%" stopColor="#e0e9ff" /><stop offset="100%" stopColor="#fff8e9" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-70%" y="-120%" width="240%" height="340%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation={fontSize * .13} result="wide" />
          <feFlood floodColor="#dae5ff" floodOpacity={glow * .48} /><feComposite in2="wide" operator="in" result="outerGlow" />
          <feGaussianBlur in="SourceAlpha" stdDeviation={fontSize * .038} result="tight" />
          <feFlood floodColor="#ffffff" floodOpacity={glow * .7} /><feComposite in2="tight" operator="in" result="innerGlow" />
          <feMerge><feMergeNode in="outerGlow" /><feMergeNode in="innerGlow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g opacity={exit}>
        {cue.items.map((item, wordIndex) => {
          const elapsed = now - item.word.startMs;
          const duration = Math.max(1, Math.min(200, Math.max(100, item.word.endMs - item.word.startMs), cue.endMs - item.word.startMs));
          const main = variant === "double-trouble" && item.row === 0;
          const enter = naturalWrap || reducedMotion || chosen(item.word.id, main) ? 1 : out(elapsed / duration);
          if (enter <= 0 && !naturalWrap) return null;
          const float = naturalWrap || reducedMotion || variant === "shamani" ? 0 : Math.sin(seconds * 1.35 + wordIndex * .36) * .65;
          const wave = waves.get(item.row);
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main={main}><g opacity={enter} data-reference-word={item.word.id}
            transform={`translate(0 ${(1 - enter) * (variant === "shamani" ? 3 : 9) + float})`} filter={glow > 0 ? `url(#${uid}-glow)` : undefined}>
            <text x={wave ? undefined : item.x + item.inkOffset} y={wave ? undefined : item.baseline} fontFamily={`"${item.family}", "Montserrat", "Inter", sans-serif`}
              fontWeight={item.weight} fontStyle={item.italic ? "italic" : undefined} fontSize={item.size} letterSpacing={variant === "shamani" ? item.size * .018 : 0}
              fill={variant === "shamani" ? `url(#${uid}-fill)` : item.row === 0 ? "#ffffff" : "#cfd3e0"}
              style={{ whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal", textRendering: "optimizeLegibility" }}>
              {wave ? <textPath href={`#${uid}-wave-${item.row}`} startOffset={wave.offset(item.x + item.inkOffset)}
                method="align" spacing="exact">{item.text}</textPath> : item.text}
            </text>
          </g></MotionWord>;
        })}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const DoubleTrouble: React.FC<KalakarCaptionProps> = props => <ReferenceCaptions {...props} variant="double-trouble" />;
export const Shamani: React.FC<KalakarCaptionProps> = props => <ReferenceCaptions {...props} variant="shamani" />;
export const resolveKalakarCaptionMetadata = ({ props }: { props: KalakarCaptionProps }) => {
  const source = props.sourceConfig ?? SOURCE;
  const { words } = normalizeWords(source);
  const durationMs = words.reduce((end, word) => Math.max(end, word.endMs + 240), numeric(source.durationMs, 1000, 1000, 86400000));
  return { fps: 30, durationInFrames: Math.max(1, Math.ceil(durationMs * 30 / 1000)) };
};
