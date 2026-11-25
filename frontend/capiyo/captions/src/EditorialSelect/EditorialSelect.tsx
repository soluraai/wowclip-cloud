import { MotionWord } from "../Standard/MotionWord";
import { compactInk, isComplexScript } from "../Script/scripts";
import React, { useId, useLayoutEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { useChosenEntrance, useCueMotion } from "../BasicCaption/cueMotion";
import { clamp, finite } from "../CaptionEngine/types";
import {
  compileEditorialSelect,
  EDITORIAL_HANDOFF_MS,
  nearbyEditorialCues,
  type CompileEditorialSelectOptions,
  type EditorialCue,
  type EditorialSource,
} from "./engine";
import { editorialSelectSource } from "./source";
import { captionFontFamily } from "../BasicCaption/fonts";
import { EDITORIAL_POP_LIFT, editorialRowFlow, editorialWordMotion } from "./motion";
import { SourceVideo } from "../SourceVideo";

export type EditorialSelectProps = {
  sourceConfig?: EditorialSource;
  styleConfig?: {
    positionY?: number;
    fontSize?: number;
    maxWidth?: number;
    tone?: "dark" | "light";
    topScrimOpacity?: number;
    selectionColor?: string;
    /** The box's tint inside the frame; the frame color when missing. */
    boxColor?: string;
    showSelection?: boolean;
    selectionStrokeWidth?: number;
    positionX?: number;
    fontSrc?: string;
    fontFamily?: string;
    fontWeight?: number;
    fontItalic?: boolean;
    textColor?: string;
    letterSpacing?: number;
    lineHeight?: number;
    backgroundColor?: string;
    opticalHeight?: number;
    naturalWrap?: boolean;
    emphasisScale?: number;
    quietScale?: number;
    glowStrength?: number;
    /** Custom phrase limits, mainly so card previews show one short beat. */
    phrasing?: CompileEditorialSelectOptions;
    reducedMotion?: boolean;
    onLayout?: (height: number) => void;
    /** The framed word's own font and size against the rest. */
    keyFont?: { family: string; src: string; weight: number; italic: boolean };
    keyScale?: number;
    /** The frame drawn in a gradient instead of its one color. */
    frameGradient?: BoxGradient;
    box?: BoxLook;
  };
};
type BoxGradient = { stops: { color: string; position: number }[]; angle: number };
/** Everything about the box: fill (color, gradient, opacity), frame width, corners, padding, handles, glow and draw-on time. */
type BoxLook = {
  color?: string; gradient?: BoxGradient; opacity?: number; frameWidth?: number; radius?: number;
  padding?: number; handles?: boolean; glow?: number; drawMs?: number;
};
type KeyFace = { family: string; weight: number; italic: boolean; scale: number };
/** A gradient as SVG stops, along its angle across the box. */
const SvgGradient: React.FC<{ id: string; gradient: BoxGradient }> = ({ id, gradient }) => {
  const radians = ((gradient.angle - 90) * Math.PI) / 180;
  const x = Math.cos(radians) / 2, y = Math.sin(radians) / 2;
  return <linearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
    {[...gradient.stops].sort((a, b) => a.position - b.position).map((stop, index) =>
      <stop key={index} offset={`${stop.position}%`} stopColor={stop.color} />)}
  </linearGradient>;
};

type WordInk = {
  advance: number;
  inkLeft: number;
  inkRight: number;
  ascent: number;
  descent: number;
};
type MeasuredWord = {
  word: EditorialCue["words"][number]; width: number; line: number;
  states: WordInk[]; selection: boolean;
};

type CueLayout = {
  words: MeasuredWord[]; size: number; gap: number; lines: number;
  tracking: number; baseline: number; unit: number;
};

const fontPromises = new Map<string, Promise<void>>();
const loadFont = (family: string, src: string, italic: boolean, weightRange: string) => {
  const key = `${family}:${src}:${italic}:${weightRange}`;
  const cached = fontPromises.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const face = new FontFace(
      family,
      `url(${JSON.stringify(asset(src))})`,
      { weight: weightRange, style: italic ? "italic" : "normal" },
    );
    await face.load();
    document.fonts.add(face);
  })();
  fontPromises.set(key, promise);
  void promise.catch(() => fontPromises.delete(key));
  return promise;
};

const asset = (src: string) =>
  /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

const ease = (value: number) => {
  const p = clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const TEXT_WEIGHT = 650;
const QUIET_WEIGHT = 400;
const scaleInk = (ink: WordInk, scale: number): WordInk => ({
  advance: ink.advance * scale, inkLeft: ink.inkLeft * scale, inkRight: ink.inkRight * scale,
  ascent: ink.ascent * scale, descent: ink.descent * scale,
});
const inkWidth = (ink: WordInk) => ink.advance + 2 * Math.max(0, -ink.inkLeft, ink.inkRight - ink.advance);
// Reserve only the ink and decoration that face the adjacent row.
const cueRows = (layout: CueLayout, spacing: number, peakScale: number, stroke: number) => {
  const framePadding = layout.size * 3.5 / 48 + (3.2 + stroke / 2) * layout.unit;
  const bounds = Array.from({ length: layout.lines }, (_, line) => {
    const words = layout.words.filter(word => word.line === line);
    return {
      ascent: Math.max(0, ...words.flatMap(word => word.states.map(ink =>
        ink.ascent + (word.selection ? framePadding : 0)))) * peakScale,
      descent: Math.max(0, ...words.flatMap(word => word.states.map(ink =>
        ink.descent + (word.selection ? framePadding : 0)))) * peakScale,
    };
  });
  const baselines = [0];
  for (let line = 1; line < bounds.length; line++) {
    baselines.push(baselines[line - 1] + Math.max(layout.size * spacing,
      bounds[line - 1].descent + bounds[line].ascent + layout.size * .06));
  }
  return { baselines, firstAscent: bounds[0].ascent,
    height: bounds[0].ascent + baselines[baselines.length - 1] + bounds[bounds.length - 1].descent };
};
const interpolateInk = (states: WordInk[], focus: number): WordInk => {
  const position = clamp(focus, 0, 1) * (states.length - 1);
  const lower = Math.floor(position), upper = Math.min(states.length - 1, lower + 1);
  const t = position - lower;
  return {
    advance: mix(states[lower].advance, states[upper].advance, t),
    inkLeft: mix(states[lower].inkLeft, states[upper].inkLeft, t),
    inkRight: mix(states[lower].inkRight, states[upper].inkRight, t),
    ascent: mix(states[lower].ascent, states[upper].ascent, t),
    descent: mix(states[lower].descent, states[upper].descent, t),
  };
};

const measureCue = (
  cue: EditorialCue,
  context: CanvasRenderingContext2D | null,
  width: number,
  nominalSize: number,
  maxWidth: number,
  family: string,
  activeWeight: number,
  quietWeight: number,
  italic: boolean,
  peakScale: number,
  selectionClearance: number,
  showSelection: boolean,
  letterSpacing?: number,
  naturalWrap = false,
  key?: KeyFace,
): CueLayout => {
  const fontSize = nominalSize * width / 720;
  const gap = fontSize * (naturalWrap ? 0.28 : 0.2);
  const tracking = (letterSpacing ?? -0.45) * width / 720;
  if (context) {
    context.font = `${italic ? "italic " : ""}${activeWeight} ${fontSize}px ${JSON.stringify(family)}, Arial, sans-serif`;
    context.letterSpacing = `${tracking}px`;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fontKerning = "normal";
  }
  const measured = cue.words.map(word => {
    const own = key && word.id === cue.selectedWordId ? key : undefined;
    const size = fontSize * (own?.scale ?? 1);
    // Joined scripts (Hindi) keep their letters touching: tight tracking breaks the headline stroke.
    const joined = isComplexScript(word.text);
    const spacing = joined ? 0 : tracking;
    const states = Array.from({ length: 6 }, (_, index) => mix(quietWeight, activeWeight, index / 5)).map(weight => {
      if (context) context.font = own
        ? `${own.italic ? "italic " : ""}${own.weight} ${size}px ${JSON.stringify(own.family)}, Arial, sans-serif`
        : `${italic ? "italic " : ""}${weight} ${fontSize}px ${JSON.stringify(family)}, Arial, sans-serif`;
      if (context) context.letterSpacing = `${spacing * (own?.scale ?? 1)}px`;
      const metrics = context?.measureText(word.text);
      const advance = metrics?.width ?? word.text.length * size * .55;
      const rawAscent = Math.max(0, metrics?.actualBoundingBoxAscent ?? size * .74);
      const rawDescent = Math.max(0, metrics?.actualBoundingBoxDescent ?? size * .2);
      // Vowel signs hang partly into the line gap, so Hindi rows sit as close as English ones. The framed word keeps its full ink.
      const ink = joined && context && word.id !== cue.selectedWordId ? compactInk(context, word.text, rawAscent, rawDescent)
        : { ascent: rawAscent, descent: rawDescent };
      return { advance, inkLeft: -(metrics?.actualBoundingBoxLeft ?? 0),
        inkRight: metrics?.actualBoundingBoxRight ?? advance, ...ink };
    });
    if (context) context.letterSpacing = `${tracking}px`;
    const frameSpace = showSelection && word.id === cue.selectedWordId
      ? 2 * (fontSize * 5 / 48 + selectionClearance) : 0;
    return { states, width: (Math.max(fontSize * .3, ...states.map(inkWidth)) + frameSpace) * peakScale };
  });
  const widths = measured.map(word => word.width);
  if (context) context.font = `${italic ? "italic " : ""}${activeWeight} ${fontSize}px ${JSON.stringify(family)}, Arial, sans-serif`;
  const fontMetrics = context?.measureText("Hg");
  const fontAscent = Math.max(fontMetrics?.actualBoundingBoxAscent ?? fontSize * .74,
    ...measured.flatMap(word => word.states.map(state => state.ascent)));
  const fontDescent = Math.max(0, fontMetrics?.actualBoundingBoxDescent ?? fontSize * .2,
    ...measured.flatMap(word => word.states.map(state => state.descent)));
  const limit = width * maxWidth - 12 * width / 720;
  const reservedGap = gap * peakScale;
  const total = widths.reduce((sum, item) => sum + item, 0) + reservedGap * (widths.length - 1);
  if (naturalWrap) {
    let line = 0, used = 0;
    const rows = widths.map(wordWidth => {
      if (used > 0 && used + reservedGap + wordWidth > limit) { line++; used = 0; }
      used += (used > 0 ? reservedGap : 0) + wordWidth;
      return line;
    });
    return {
      words: cue.words.map((word, index) => ({ word, width: widths[index], line: rows[index], states: measured[index].states,
        selection: showSelection && word.id === cue.selectedWordId })),
      size: fontSize, gap, tracking, unit: width / 720,
      baseline: (fontSize * 1.18 - fontAscent - fontDescent) / 2 + fontAscent,
      lines: line + 1,
    };
  }
  let split = cue.words.length;
  if (total > limit && cue.words.length > 1) {
    let best = Infinity;
    for (let candidate = 1; candidate < cue.words.length; candidate++) {
      const first = widths.slice(0, candidate).reduce((sum, item) => sum + item, 0) + reservedGap * (candidate - 1);
      const second = widths.slice(candidate).reduce((sum, item) => sum + item, 0) + reservedGap * (widths.length - candidate - 1);
      const cost = Math.max(first, second) + Math.abs(first - second) * 0.17;
      if (cost < best) { best = cost; split = candidate; }
    }
  }
  const firstWidth = widths.slice(0, split).reduce((sum, item) => sum + item, 0) + reservedGap * Math.max(0, split - 1);
  const secondWidth = widths.slice(split).reduce((sum, item) => sum + item, 0) + reservedGap * Math.max(0, widths.length - split - 1);
  const fit = Math.min(1, limit / Math.max(1, firstWidth, secondWidth));
  return {
    words: cue.words.map((word, index) => ({ word, width: widths[index] * fit, line: index < split ? 0 : 1,
      selection: showSelection && word.id === cue.selectedWordId,
      states: measured[index].states.map(state => ({ advance: state.advance * fit,
        inkLeft: state.inkLeft * fit, inkRight: state.inkRight * fit,
        ascent: state.ascent * fit, descent: state.descent * fit })) })),
    size: fontSize * fit,
    unit: width / 720 * fit,
    gap: gap * fit,
    tracking: tracking * fit,
    baseline: ((fontSize * 1.18 - fontAscent - fontDescent) / 2 + fontAscent) * fit,
    lines: split === cue.words.length ? 1 : 2,
  };
};

const CueText: React.FC<{
  cue: EditorialCue;
  layout: CueLayout;
  now: number;
  nextStart: number;
  previousEnd: number;
  width: number;
  height: number;
  positionY: number;
  tone: "dark" | "light";
  selectionColor: string;
  boxColor?: string;
  showSelection: boolean;
  selectionStrokeWidth: number;
  positionX: number;
  family: string;
  activeWeight: number;
  quietWeight: number;
  italic: boolean;
  textColor?: string;
  lineHeight: number;
  reducedMotion: boolean;
  naturalWrap?: boolean;
  emphasisScale: number;
  quietScale: number;
  peakScale: number;
  glowStrength: number;
  keyFace?: KeyFace;
  frameGradient?: BoxGradient;
  box?: BoxLook;
}> = ({ cue, layout, now, nextStart, previousEnd, width, height, positionY, tone, selectionColor, boxColor, showSelection, selectionStrokeWidth,
  positionX, family, activeWeight, quietWeight, italic, textColor, lineHeight: lineSpacing, reducedMotion, naturalWrap,
  emphasisScale, quietScale, peakScale, glowStrength, keyFace, frameGradient, box }) => {
  const uid = useId().replace(/:/g, "");
  const drawMs = clamp(finite(box?.drawMs, 160), 0, 1200);
  const padding = clamp(finite(box?.padding, 1), 0, 3);
  const chosen = useChosenEntrance();
  const incomingMs = Math.min(EDITORIAL_HANDOFF_MS, Math.max(0, previousEnd - cue.startMs));
  const intro = reducedMotion ? 1 : incomingMs > 0 ? ease((now - cue.startMs) / incomingMs) : 1;
  const outroStart = Math.min(cue.endMs - EDITORIAL_HANDOFF_MS, nextStart);
  const outro = 1 - ease((now - outroStart) / Math.max(1, cue.endMs - outroStart));
  const opacity = reducedMotion ? 1 : outro;
  const unit = layout.unit;
  const rowLayout = cueRows(layout, lineSpacing, peakScale, selectionStrokeWidth);
  const firstTop = height * positionY - rowLayout.height / 2 + rowLayout.firstAscent - layout.baseline;
  const palette = tone === "dark"
    ? { active: [247, 247, 248], quiet: [164, 165, 170] }
    : { active: [14, 15, 17], quiet: [128, 129, 133] };
  if (textColor && /^#[a-f0-9]{6}$/i.test(textColor))
    palette.active = [1, 3, 5].map(start => parseInt(textColor.slice(start, start + 2), 16));
  const color = (focus: number) =>
    `rgb(${palette.quiet.map((channel, index) => Math.round(mix(channel, palette.active[index], focus))).join(",")})`;

  const rows = Array.from({ length: layout.lines }, (_, line) => line).map((line) => {
    const items = layout.words.filter(item => item.line === line).map(item => {
      const next = cue.words[cue.words.findIndex(word => word.id === item.word.id) + 1];
      const selected = showSelection && item.word.id === cue.selectedWordId;
      const focus = now < item.word.startMs ? 0 : selected || !next ? 1 :
        1 - ease((now - next.startMs) / 150);
      const elapsed = now - item.word.startMs;
      const settled = naturalWrap || reducedMotion || chosen(item.word.id);
      const enterProgress = settled ? 1 : elapsed < 0 ? 0 : easeOut(clamp(elapsed / 130, 0, 1));
      const reveal = settled ? 1 : elapsed < 0 ? 0 : easeOut(clamp(elapsed / 90, 0, 1));
      const motion = editorialWordMotion({ now, startMs: item.word.startMs, endMs: item.word.endMs,
        nextStartMs: next?.startMs, emphasisScale, quietScale, reducedMotion: settled });
      const ink = scaleInk(interpolateInk(item.states, focus), motion.scale);
      const frameSpace = selected ? 2 * (layout.size * 5 / 48 + (3.2 + selectionStrokeWidth / 2) * unit) * motion.scale : 0;
      const wordWidth = Math.max(layout.size * .2 * motion.scale, inkWidth(ink)) + frameSpace;
      return { ...item, ink, wordWidth, focus, selected, elapsed, enterProgress, reveal, settled, ...motion };
    });
    // Lock word slots to the settled row width so words reveal in-place without swimming or shifting earlier text.
    const row = editorialRowFlow(items.map(item => ({ width: item.wordWidth, scale: item.scale,
      presence: 1, started: true })), layout.gap, width * positionX);
    return items.map((item, index) => {
      const { reveal, focus, selected, settled, enterProgress } = item;
      const slot = row.words[index];
      const scale = item.scale * slot.flow;
      const ink = scaleInk(item.ink, slot.flow);
      if (reveal <= 0 && !naturalWrap) return null;
      const top = firstTop + rowLayout.baselines[line];
      const blur = settled ? 0 : (1 - enterProgress) * layout.size * 2.8 / 48;
      const travelY = settled ? 0 : (1 - enterProgress) * 14 * unit;

      const frameElapsed = now - item.word.startMs;
      const frameProgress = selected ? (settled || drawMs === 0 ? 1 : easeOut(clamp((frameElapsed - 30) / drawMs, 0, 1))) : 0;
      const frameOpacity = selected ? (settled || drawMs === 0 ? 1 : clamp((frameElapsed - 25) / Math.max(1, drawMs * 0.375), 0, 1)) : 0;
      const stroke = selectionStrokeWidth * unit * scale;
      const padX = layout.size * 5 / 48 * scale * padding, padY = layout.size * 3.5 / 48 * scale * padding;
      const own = selected ? keyFace : undefined;
      const radius = finite(box?.radius, 1.5) * unit * scale;
      const fillId = `${uid}-fill-${item.word.id}`, frameId = `${uid}-frame-${item.word.id}`;
      const fillOpacity = box?.opacity !== undefined ? clamp(box.opacity / 100, 0, 1) : boxColor || box?.gradient ? .38 : tone === "dark" ? .22 : .12;
      const glow = clamp(finite(box?.glow, 40), 0, 100) / 100;
      const boxLeft = (slot.width - ink.advance) / 2 + ink.inkLeft - padX;
      const boxTop = layout.baseline - ink.ascent - padY;
      const boxWidth = Math.max(1, ink.inkRight - ink.inkLeft + 2 * padX);
      const boxHeight = Math.max(1, ink.ascent + ink.descent + 2 * padY);
      const perimeter = 2 * (boxWidth + boxHeight);
      const strokeDashoffset = settled ? 0 : (1 - frameProgress) * perimeter;
      return (
        <div
          key={item.word.id}
          style={{
            position: "absolute", left: slot.left, top, width: slot.width,
            height: layout.size * 1.18 * peakScale,
            opacity: (settled ? mix(.88, 1, focus) : reveal * mix(.88, 1, focus)) * intro,
            filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
            transform: settled ? undefined : `translateY(${travelY.toFixed(3)}px)`,
            whiteSpace: "nowrap",
          }}
        >
          <MotionWord html id={item.word.id} startMs={item.word.startMs} size={layout.size}>
          {frameOpacity > 0 ? (
            <svg width={boxWidth} height={boxHeight} aria-hidden style={{
              position: "absolute", left: boxLeft, top: boxTop,
              overflow: "visible", pointerEvents: "none",
              opacity: frameOpacity,
              transform: `scale(${(0.96 + frameProgress * 0.04).toFixed(5)})`,
              transformOrigin: "center",
              filter: glow > 0 ? `drop-shadow(0 0 ${(10 * glow * unit).toFixed(1)}px ${selectionColor}${Math.round(glow * 255).toString(16).padStart(2, "0")})` : undefined,
            }}>
              <defs>
                {box?.gradient ? <SvgGradient id={fillId} gradient={box.gradient} /> : null}
                {frameGradient ? <SvgGradient id={frameId} gradient={frameGradient} /> : null}
              </defs>
              {/* Translucent tinted interior */}
              <rect x={0} y={0} width={boxWidth} height={boxHeight}
                rx={radius} fill={box?.gradient ? `url(#${fillId})` : boxColor ?? selectionColor} fillOpacity={fillOpacity} />
              {/* Trim-path stroke draw-on */}
              {stroke > 0 ? <rect x={0} y={0} width={boxWidth} height={boxHeight}
                rx={radius} fill="none"
                stroke={frameGradient ? `url(#${frameId})` : selectionColor} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={perimeter} strokeDashoffset={strokeDashoffset} /> : null}
              {/* 4 Precision Control Handles */}
              {box?.handles === false ? null : [[0, 0], [boxWidth, 0], [boxWidth, boxHeight], [0, boxHeight]].map(([cx, cy], dotIndex) => {
                const dotProgress = settled ? 1 : clamp((frameProgress - 0.2 - dotIndex * 0.08) / 0.45, 0, 1);
                const dotScale = settled ? 1 : easeOut(dotProgress);
                if (dotScale <= 0) return null;
                return (
                  <g key={dotIndex} transform={`translate(${cx}, ${cy}) scale(${dotScale})`}>
                    <circle r={3.2 * unit * scale} fill={selectionColor} />
                    <circle r={1.6 * unit * scale} fill={tone === "dark" ? "#ffffff" : "#f0f4ff"} />
                  </g>
                );
              })}
            </svg>
          ) : null}
          <svg width={slot.width} height={layout.size * 1.18 * peakScale} aria-hidden style={{
            position: "relative", display: "block", width: "100%",
            overflow: "visible",
          }}>
            <text x={slot.width / 2} y={layout.baseline} textAnchor="middle"
              fontFamily={`${JSON.stringify(own?.family ?? family)}, Arial, sans-serif`} fontWeight={own ? own.weight : mix(quietWeight, activeWeight, focus)}
              fontStyle={(own ? own.italic : italic) ? "italic" : "normal"}
              fontSize={layout.size * scale * (own?.scale ?? 1)} letterSpacing={isComplexScript(item.word.text) ? 0 : layout.tracking * scale * (own?.scale ?? 1)} fill={color(focus)}
              style={{ whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal",
                filter: focus > 0.35 && glowStrength > 0 && tone === "dark"
                  ? `drop-shadow(0 0 ${(layout.size * 0.22 * scale).toFixed(1)}px rgba(${palette.active.join(",")}, ${(focus * glowStrength * 0.35).toFixed(3)}))`
                  : undefined }}>
              {item.word.text}
            </text>
          </svg>
          </MotionWord>
        </div>
      );
    });
  });

  return <div role="img" aria-label={cue.words.map(word => word.text).join(" ")} style={{
    position: "absolute", inset: 0,
    opacity,
    filter: reducedMotion ? undefined : `blur(${((1 - outro) * 3 * unit).toFixed(3)}px)`,
    transform: reducedMotion ? undefined : `translateY(${(-(1 - outro) * 10 * unit).toFixed(3)}px)`,
  }}>{rows}</div>;
};

export const EditorialSelect: React.FC<EditorialSelectProps> = ({
  sourceConfig = editorialSelectSource,
  styleConfig,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const now = frame * 1000 / fps;
  const naturalWrap = styleConfig?.naturalWrap === true;
  const wrapPhrasing = naturalWrap ? styleConfig?.phrasing : undefined;
  const compiled = useMemo(() => compileEditorialSelect(sourceConfig, wrapPhrasing ? {
    maxWords: clamp(Math.round(finite(wrapPhrasing.maxWords, 24)), 1, 24),
    maxCharacters: clamp(Math.round(finite(wrapPhrasing.maxCharacters, 180)), 12, 180),
    maxDurationMs: clamp(finite(wrapPhrasing.maxDurationMs, 12000), 500, 12000),
  } : undefined), [sourceConfig, wrapPhrasing]);
  const fontSrc = styleConfig?.fontSrc ?? "style-two/fonts/instrument-sans-variable.ttf";
  const activeWeight = clamp(finite(styleConfig?.fontWeight, TEXT_WEIGHT), 100, 900);
  const quietWeight = Math.min(activeWeight, QUIET_WEIGHT);
  const italic = styleConfig?.fontItalic === true;
  const fontName = styleConfig?.fontFamily ?? "Instrument Sans";
  const weightRange = fontName === "Instrument Sans" ? "400 700" : "100 900";
  const family = captionFontFamily(asset(fontSrc), fontName, activeWeight, italic);
  const keyFont = styleConfig?.keyFont;
  const keyFamily = keyFont ? captionFontFamily(asset(keyFont.src), keyFont.family, keyFont.weight, keyFont.italic) : "";
  const keyScale = clamp(finite(styleConfig?.keyScale, 1), 0.5, 2.5);
  const keyFace = useMemo<KeyFace | undefined>(() => keyFont || keyScale !== 1
    ? { family: keyFont ? keyFamily : family, weight: keyFont?.weight ?? activeWeight, italic: keyFont ? keyFont.italic : italic, scale: keyScale }
    : undefined, [keyFont, keyFamily, family, activeWeight, italic, keyScale]);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [loadedFont, setLoadedFont] = useState("");
  const fontReady = loadedFont === `${family}|${keyFamily}`;
  useLayoutEffect(() => {
    let cancelled = false;
    let released = false;
    const handle = delayRender("Loading Editorial Select font");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    void Promise.all([loadFont(family, fontSrc, italic, weightRange),
      keyFont ? loadFont(keyFamily, asset(keyFont.src), keyFont.italic, "100 900").catch(() => undefined) : undefined]).then(() => {
      if (!cancelled) setLoadedFont(`${family}|${keyFamily}`);
    }).catch((error: unknown) => { if (!cancelled) cancelRender(error); }).finally(release);
    return () => { cancelled = true; release(); };
  }, [delayRender, continueRender, cancelRender, family, fontSrc, italic, weightRange, keyFont, keyFamily]);

  const maxWidth = clamp(finite(styleConfig?.maxWidth, 0.78), 0.5, 0.94);
  const opticalHeight = styleConfig?.opticalHeight;
  const requestedSize = styleConfig?.fontSize;
  const fontSize = useMemo(() => {
    if (!opticalHeight || !fontReady) return clamp(finite(requestedSize, 48), 26, 160);
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return clamp(finite(requestedSize, 48), 26, 160);
    context.font = `${italic ? "italic " : ""}${activeWeight} 100px ${JSON.stringify(family)}, sans-serif`;
    return opticalHeight * 100 / Math.max(40, context.measureText("H").actualBoundingBoxAscent || 72) * 720 / width;
  }, [opticalHeight, fontReady, requestedSize, italic, activeWeight, family, width]);
  const positionY = clamp(finite(styleConfig?.positionY, 0.82), 0.1, 0.9);
  const positionX = clamp(finite(styleConfig?.positionX, 0.5), 0.1, 0.9);
  const lineHeight = clamp(finite(styleConfig?.lineHeight, 1.13), 0.9, 3);
  const letterSpacing = styleConfig?.letterSpacing;
  const reducedMotion = styleConfig?.reducedMotion === true;
  const emphasisScale = clamp(finite(styleConfig?.emphasisScale, 1.12), 1, 1.3);
  const quietScale = clamp(finite(styleConfig?.quietScale, .96), .85, 1);
  const peakScale = reducedMotion || naturalWrap ? 1 : emphasisScale + EDITORIAL_POP_LIFT;
  const glowStrength = clamp(finite(styleConfig?.glowStrength, .65), 0, 1);
  const showSelection = styleConfig?.showSelection ?? true;
  const frameWidth = styleConfig?.box?.frameWidth;
  // A frame width picked in the editor is in the caption's own units, so it holds at any size.
  const selectionStrokeWidth = frameWidth !== undefined
    ? clamp(frameWidth, 0, 8) * (naturalWrap ? finite(styleConfig?.selectionStrokeWidth, 1.8) / 1.8 : 1)
    : clamp(finite(styleConfig?.selectionStrokeWidth, 1.8), 1, naturalWrap ? 12 : 3);
  const tone = styleConfig?.tone ?? "dark";
  const layouts = useMemo(() => {
    if (!fontReady) return new Map<string, CueLayout>();
    const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    return new Map(compiled.cues.map((cue) => [cue.id, measureCue(cue, context, width, fontSize, maxWidth,
      family, activeWeight, quietWeight, italic, peakScale, (3.2 + selectionStrokeWidth / 2) * width / 720,
      showSelection, letterSpacing, naturalWrap, keyFace)]));
  }, [compiled, fontReady, width, fontSize, maxWidth, family, activeWeight, quietWeight, italic,
    peakScale, selectionStrokeWidth, showSelection, letterSpacing, naturalWrap, keyFace]);
  const onLayout = styleConfig?.onLayout;
  useLayoutEffect(() => {
    if (!fontReady || !onLayout || !layouts.size) return;
    onLayout(Math.max(...Array.from(layouts.values(), layout =>
      cueRows(layout, lineHeight, peakScale, selectionStrokeWidth).height)));
  }, [fontReady, onLayout, layouts, lineHeight, peakScale, selectionStrokeWidth]);
  const nearby = nearbyEditorialCues(compiled.cues, now);
  const current = reducedMotion ? nearby.slice(-1) : nearby;
  const latest = current[current.length - 1];
  useCueMotion(latest?.startMs, latest?.endMs);

  return (
    <AbsoluteFill style={{ backgroundColor: styleConfig?.backgroundColor ?? (tone === "dark" ? "#101011" : "#f9f9f8"), overflow: "hidden" }}>
      {sourceConfig.background?.src ? <SourceVideo
        src={asset(sourceConfig.background.src)}
        muted={sourceConfig.background.muted ?? false}
        volume={sourceConfig.background.volume ?? 1}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      /> : null}
      {fontReady && current.map((cue) => {
        const layout = layouts.get(cue.id);
        if (!layout) return null;
        const index = compiled.cues.findIndex((item) => item.id === cue.id);
        return <CueText
          key={cue.id} cue={cue} layout={layout} now={now}
          nextStart={compiled.cues[index + 1]?.startMs ?? Infinity}
          previousEnd={compiled.cues[index - 1]?.endMs ?? -Infinity}
          width={width} height={height} positionY={positionY}
          positionX={positionX} family={family} activeWeight={activeWeight} quietWeight={quietWeight}
          italic={italic} textColor={styleConfig?.textColor} lineHeight={lineHeight} reducedMotion={reducedMotion}
          tone={tone} selectionColor={styleConfig?.selectionColor ?? "#4777df"} boxColor={styleConfig?.boxColor}
          showSelection={showSelection}
          selectionStrokeWidth={selectionStrokeWidth}
          naturalWrap={naturalWrap}
          emphasisScale={emphasisScale} quietScale={quietScale} peakScale={peakScale} glowStrength={glowStrength}
          keyFace={keyFace} frameGradient={styleConfig?.frameGradient} box={styleConfig?.box}
        />;
      })}
    </AbsoluteFill>
  );
};

export const resolveEditorialSelectMetadata = ({ props }: { props: EditorialSelectProps }) => ({
  fps: 30,
  durationInFrames: Math.max(1, Math.ceil(compileEditorialSelect(props.sourceConfig ?? editorialSelectSource).durationMs * 30 / 1000)),
});
