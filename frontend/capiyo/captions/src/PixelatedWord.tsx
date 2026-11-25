import { MotionWord } from "./Standard/MotionWord";
import { useChosenEntrance, useCueMotion } from "./BasicCaption/cueMotion";
import React, { useContext, useLayoutEffect, useMemo, useState } from "react";
import { PartSizesContext } from "./Premium/parts";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { activeCue, normalizeWords } from "./LaunchCaptionPack/timeline";
import type { CaptionSource, Word } from "./LaunchCaptionPack/types";
import transcript from "./StyleTwo/demo.transcript.json";
import { SourceVideo } from "./SourceVideo";

// Kalakar's selected Pixelated Word template uses VPPixel at weight 500.
// Exact public font-face source: https://app.kalakar.io/fonts/VPPixel-Simplified.otf
// The pixel shapes belong to the font itself, rather than a blur or mosaic filter.
export type PixelatedWordProps = {
  sourceConfig?: CaptionSource;
  styleConfig?: {
    fontSize?: number;
    positionY?: number;
    maxWidth?: number;
    naturalWrap?: boolean;
    onLayout?: (height: number) => void;
  };
  presentationConfig?: {
    onLayout?: (height: number) => void;
    backgroundColor?: string;
    reducedMotion?: boolean;
  };
  reducedMotion?: boolean;
};
const SOURCE: CaptionSource = { transcript, durationMs: 44044, background: { src: "why_not_you_hq.mp4" } };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const numeric = (value: number | undefined, fallback: number, min: number, max: number) =>
  clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
/** Hindi stays in the pixel family; Script/ScriptFonts draws its letters in square Sarpanch. */
const familyFor = (_text: string) => "Pixel Word VP";
let fonts: Promise<void> | undefined;
const loadFonts = () => {
  if (!fonts) {
    fonts = Promise.all([
      { family: "Pixel Word VP", src: "kalakar-reference/VPPixel-Simplified.otf", weight: "500" },
      { family: "Pixel Word Hindi", src: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", weight: "100 900" },
    ].map(async font => {
      const url = asset(font.src);
      const face = new FontFace(font.family, `url(${JSON.stringify(url)})`, { weight: font.weight });
      document.fonts.add(await face.load());
    })).then(() => undefined);
    void fonts.catch(() => { fonts = undefined; });
  }
  return fonts;
};

type PixelCue = { id: string; words: Word[]; startMs: number; endMs: number };
const compileCues = (source: CaptionSource): PixelCue[] => {
  const { words } = normalizeWords(source); const groups: Word[][] = []; let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of words) {
    const previous = group[group.length - 1];
    if (previous && word.startMs > previous.startMs && (previous.pageBreakAfter || previous.speaker !== word.speaker ||
      previous.event !== word.event || /[.!?।॥]["'”’)]?$/u.test(previous.text) || word.startMs - previous.endMs > 340 ||
      group.length >= 4 || [...group, word].map(w => w.text).join(" ").length > 29 || word.endMs - group[0].startMs > 2200)) flush();
    group.push(word);
  }
  flush();
  return groups.map((entries, i) => ({ id: `pixel-${entries[0].id}`, words: entries, startMs: entries[0].startMs,
    endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 240, groups[i + 1]?.[0].startMs ?? Infinity) }));
};
type PixelItem = { word: Word; family: string; size: number; width: number; inkOffset: number;
  ascent: number; descent: number; x: number; baseline: number };
type PixelLayout = PixelCue & { items: PixelItem[] };
const layoutCues = (cues: PixelCue[], ctx: CanvasRenderingContext2D, fontSize: number,
  canvasHeight: number, positionY: number, maxWidth: number, naturalWrap = false, picks: Record<string, number> = {}): PixelLayout[] => cues.map(cue => {
  const capacity = 720 * maxWidth;
  const build = (size: number) => {
    const measured = cue.words.map(word => {
      const family = familyFor(word.text);
      const own = Math.round(size * (picks[word.id] ?? 1));
      ctx.font = `500 ${own}px "${family}"`; ctx.letterSpacing = "0px";
      const m = ctx.measureText(word.text);
      const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
      const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
      return { word, family, size: own, inkOffset: left + .5, width: Math.ceil(Math.max(m.width, left + right)) + 1,
        ascent: Math.ceil(Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * .8),
        descent: Math.ceil(Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * .2) };
    });
    const gap = Math.round(size * .25);
    const lines: typeof measured[] = [[]]; let used = 0;
    measured.forEach(item => {
      if (used && used + gap + item.width > capacity) { lines.push([]); used = 0; }
      const line = lines[lines.length - 1]; line.push(item); used += item.width + (line.length > 1 ? gap : 0);
    });
    const widths = lines.map(line => line.reduce((sum, item) => sum + item.width, 0) + Math.max(0, line.length - 1) * gap);
    const metrics = lines.map(line => ({ a: Math.max(...line.map(item => item.ascent)), d: Math.max(...line.map(item => item.descent)) }));
    const lineGap = Math.round(size * .3);
    const blockHeight = metrics.reduce((sum, m) => sum + m.a + m.d, 0) + Math.max(0, lines.length - 1) * lineGap;
    let top = naturalWrap
      ? Math.round((canvasHeight - blockHeight) / 2)
      : Math.round(clamp(canvasHeight * positionY - blockHeight / 2, canvasHeight * .12,
          Math.max(canvasHeight * .12, canvasHeight * .85 - blockHeight - 12)));
    const items: PixelItem[] = [];
    lines.forEach((line, i) => {
      let x = Math.round((720 - widths[i]) / 2); const baseline = top + metrics[i].a;
      line.forEach(item => { items.push({ ...item, x, baseline }); x += item.width + gap; });
      top += metrics[i].a + metrics[i].d + lineGap;
    });
    return { items, fits: lines.length <= 2 && Math.max(...widths) <= capacity && (naturalWrap || blockHeight < canvasHeight * .45) };
  };
  let size = Math.round(fontSize * (cue.words.length === 1 ? 1.12 : 1)); let layout = build(size);
  while (!layout.fits && size > 5) { size -= 1; layout = build(size); }
  return { ...cue, items: layout.items };
});

export const PixelatedWord: React.FC<PixelatedWordProps> = ({ sourceConfig = SOURCE, styleConfig, presentationConfig, reducedMotion = false }) => {
  const frame = useCurrentFrame(); const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps; const canvasHeight = height * 720 / width;
  const onLayout = presentationConfig?.onLayout ?? styleConfig?.onLayout;
  // An explicit styleConfig value wins so the preview card can run the real
  // word animation while onLayout keeps reporting the settled height.
  const naturalWrap = styleConfig?.naturalWrap ?? !!presentationConfig?.onLayout;
  const fontSize = numeric(styleConfig?.fontSize, 56, 28, 100);
  const positionY = numeric(styleConfig?.positionY, naturalWrap ? .5 : .73, .2, .82);
  const maxWidth = numeric(styleConfig?.maxWidth, .84, .5, .9);
  const [ready, setReady] = useState(false);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    const handle = delayRender("Loading the VPPixel caption font");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void loadFonts().then(() => { if (!disposed) setReady(true); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [delayRender, continueRender, cancelRender]);
  const cues = useMemo(() => compileCues(sourceConfig), [sourceConfig]);
  const sizes = useContext(PartSizesContext);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Pixelated Word requires a 2D text-measurement canvas.");
    return layoutCues(cues, ctx, fontSize, canvasHeight, positionY, maxWidth, naturalWrap, sizes.words);
  }, [ready, cues, fontSize, canvasHeight, positionY, maxWidth, naturalWrap, sizes]);
  useLayoutEffect(() => {
    if (!ready || !onLayout || !layouts.length) return;
    const maxHeight = Math.max(...layouts.map(l => {
      const tops = l.items.map(it => it.baseline - it.ascent);
      const bots = l.items.map(it => it.baseline + it.descent);
      return Math.max(...bots) - Math.min(...tops);
    }));
    onLayout(maxHeight * width / 720);
  }, [ready, onLayout, layouts, width]);
  const cue = activeCue(layouts, now) ?? (naturalWrap ? layouts[0] : undefined); const next = cue ? layouts[layouts.indexOf(cue) + 1] : undefined;
  useCueMotion(cue?.startMs, cue?.endMs);
  const chosen = useChosenEntrance();
  const exit = cue && (!next || next.startMs > cue.endMs + 30) && !reducedMotion ? ease((cue.endMs - now) / 100) : 1;
  const background = sourceConfig.background;
  return <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", backgroundColor: presentationConfig?.backgroundColor ?? "#202624" }}>
    {background?.src ? background.kind === "image" ? <Img src={asset(background.src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
      <SourceVideo src={asset(background.src)} muted={background.muted ?? false} volume={numeric(background.volume, 1, 0, 1)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
    {background?.src ? <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,.34) 0%, rgba(0,0,0,.12) 35%, transparent 65%)" }} /> : null}
    {cue ? <svg width={width} height={height} viewBox={`0 0 720 ${canvasHeight}`} role="img"
      aria-label={cue.words.map(word => word.text).join(" ")} style={{ position: "absolute", inset: 0 }}>
      <g opacity={exit}>
        {cue.items.map(item => {
          const duration = Math.max(1, Math.min(140, item.word.endMs - item.word.startMs, cue.endMs - item.word.startMs));
          const enter = naturalWrap || reducedMotion || chosen(item.word.id) ? 1 : ease((now - item.word.startMs) / duration);
          if (enter <= 0 && !naturalWrap) return null;
          return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size}><text data-pixel-word={item.word.id} opacity={enter}
            x={Math.round(item.x + item.inkOffset)} y={item.baseline} fontFamily={`"${item.family}"`}
            fontWeight={500} fontSize={item.size} fill="#ffffff"
            style={{ whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal", textRendering: "geometricPrecision" }}>{item.word.text}</text></MotionWord>;
        })}
      </g>
    </svg> : null}
  </AbsoluteFill>;
};

export const resolvePixelatedWordMetadata = ({ props }: { props: PixelatedWordProps }) => {
  const source = props.sourceConfig ?? SOURCE; const { words } = normalizeWords(source);
  const duration = words.reduce((end, word) => Math.max(end, word.endMs + 240), numeric(source.durationMs, 1000, 1000, 86400000));
  return { fps: 30, durationInFrames: Math.max(1, Math.ceil(duration * 30 / 1000)) };
};
