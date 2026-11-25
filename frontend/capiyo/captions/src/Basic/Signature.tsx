import React, { useContext, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isComplexScript, letterPieces, textLength } from "../Script/scripts";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { getActiveCueIndex } from "../CaptionEngine/compilePlan";
import { clamp, isRecord, type CaptionCue, type CaptionWord } from "../CaptionEngine/types";
import { compileStyleTwo } from "../StyleTwo/engine";
import { assetSource, ensureStyleTwoFonts, fontFamily } from "../StyleTwo/fonts";
import type { StyleTwoFont } from "../StyleTwo/config";
import type { SignatureStyleId } from "./catalog";
import { captionFrame, poseOf, type CaptionAnimation, type MotionFrame } from "../BasicCaption/motion";
import { SettledMotionContext, useWordBoxes } from "../BasicCaption/cueMotion";
import { useWordFonts, wordLook } from "../BasicCaption/wordLook";
import type { BasicWordPresentation, Gradient } from "../BasicCaption/wordPresentation";
import { SourceVideo } from "../SourceVideo";

/**
 * Signature layouts: five Basic styles that differ in structure (hero stack,
 * lyric focus, glass plate, hand-drawn callout, stickers), not just color or
 * font. Cues, emphasis words and timings come from the shared Style Two
 * engine (which derives an emphasis plan automatically when none is given),
 * so every transcript works and missed or mis-heard words are never dropped.
 * Word/line animation is intentionally minimal: it is a separate user control.
 */
export type SignatureProps = {
  styleId: SignatureStyleId;
  sourceConfig: unknown;
  font: { family: string; src?: string; weight: number; size: number; color: string; textCase?: string; letterSpacing?: number };
  layout: { positionX: number; positionY: number; maxWidth: number; rotation?: number };
  accent: string;
  /** Second color for styles with two (Glitch Split). */
  accent2?: string;
  /** Color of the key word itself. */
  keyColor?: string;
  /** Space-separated ids of the words the user or the AI chose. */
  keyWordIds?: string;
  /** What single words changed for themselves. */
  wordStyles?: Record<string, BasicWordPresentation>;
  /** The caption's text gradient, for the words that aren't key words. */
  gradient?: Gradient;
  /** A gradient for the shape drawn on the key word (marker, ring), in place of its one color. */
  shape?: { stops: { color: string; position: number }[]; angle: number };
  /** Chosen motion for the whole caption; undefined keeps the style's own. */
  animation?: CaptionAnimation;
  /** Settled = every word of the phrase is shown at rest (idle style cards). */
  settled?: boolean;
  /** Card previews: normalizes the cap height (composition px) so every style reads at one size. */
  opticalHeight?: number;
  reducedMotion?: boolean;
  backgroundColor?: string;
};

const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const alpha = (color: string, value: number) =>
  /^#[\da-f]{6}$/i.test(color)
    ? color + Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0")
    : color;
const STICKERS = [
  { bg: "#ff4d8d", fg: "#ffffff", rot: -2.4 },
  { bg: "#ffd60a", fg: "#111111", rot: 1.8 },
  { bg: "#35a7ff", fg: "#ffffff", rot: -1.3 },
  { bg: "#2ee6a6", fg: "#0b1f17", rot: 2.6 },
  { bg: "#a66bff", fg: "#ffffff", rot: -1.9 },
];

type Ctx = {
  frame: number;
  fps: number;
  now: number;
  px: number;
  unit: number;
  availableWidth: number;
  accent: string;
  accent2?: string;
  keyColor?: string;
  keyIds: Set<string>;
  settled: boolean;
  calm: boolean;
  /** A word's own entrance, when words or lines animate on their own. */
  pose: (word: CaptionWord) => MotionFrame | undefined;
  look: (word: CaptionWord) => React.CSSProperties;
  /**
   * How a word's text is painted: its own color, the key word gradient, or the caption gradient for the
   * other words. Empty when nothing was picked, so the layout's own color stays.
   */
  paint: (word: CaptionWord) => React.CSSProperties;
  /** Font stack for an exact weight; each weight is loaded as its own face. */
  fam: (weight: number) => string;
  shape?: { stops: { color: string; position: number }[]; angle: number };
  uid: string;
};

const css = (gradient: Gradient) =>
  `linear-gradient(${gradient.angle}deg, ${gradient.stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ")})`;
const clipText = (image: string): React.CSSProperties => ({
  backgroundImage: image, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent",
});
/** A gradient can't sit under a text-shadow (the shadow shows through the clear glyphs), so it becomes a drop shadow. */
const SOFT_DROP = "drop-shadow(0 .04em .12em rgba(0,0,0,.5))";
/** The word's paint, or the fallback color; a gradient drops the text-shadow for a filter. */
const painted = (word: CaptionWord, ctx: Ctx, fallback?: string, textShadow?: string): React.CSSProperties => {
  const paint = ctx.paint(word);
  if (paint.backgroundImage) return { ...paint, filter: textShadow ? SOFT_DROP : undefined };
  return { color: paint.color ?? fallback, textShadow };
};
/** Everything of a word's own look except its paint, which painted() decides. */
const lookOnly = (word: CaptionWord, ctx: Ctx): React.CSSProperties => {
  const { color: _color, backgroundImage: _image, WebkitBackgroundClip: _clip, backgroundClip: _bgClip, ...rest } = ctx.look(word);
  return rest;
};

const startFrame = (word: CaptionWord, fps: number) => Math.ceil((word.startMs * fps) / 1000);
const reveal = (word: CaptionWord, ctx: Ctx) =>
  ctx.settled ? 1 : clamp((ctx.frame - startFrame(word, ctx.fps) + 1) / 3, 0, 1);
/** Props for a word's outer element: its reveal or chosen entrance on top of its own look. */
const enter = (word: CaptionWord, ctx: Ctx, style: React.CSSProperties = {}) => {
  const pose = ctx.pose(word);
  const look = lookOnly(word, ctx);
  const paint = ctx.paint(word);
  const gradient = !!paint.backgroundImage;
  return {
    "data-word-id": word.id,
    style: {
      ...style,
      ...look,
      ...paint,
      // Gradient and hollow words paint their fill another way, so a chosen color has to replace it.
      ...(paint.color && !gradient ? { WebkitTextFillColor: paint.color, backgroundImage: "none" } : {}),
      ...(gradient && style.textShadow ? { textShadow: "none" } : {}),
      opacity: (pose ? pose.opacity : reveal(word, ctx)) * (typeof style.opacity === "number" ? style.opacity : 1) *
        (typeof look.opacity === "number" ? look.opacity : 1),
      transform: [pose?.transform, style.transform].filter(Boolean).join(" ") || undefined,
      filter: [pose?.filter, style.filter, look.filter, gradient && style.textShadow ? SOFT_DROP : undefined].filter(Boolean).join(" ") || undefined,
      clipPath: pose?.clipPath,
    },
  };
};
const text = (words: CaptionWord[]) => words.map((word) => word.text).join(" ");

type ShownCue = CaptionCue & { noKeyWord?: boolean; solo?: boolean };
const heroOf = (cue: ShownCue) =>
  cue.heroWords.length ? cue.heroWords : cue.noKeyWord ? [] : cue.words.slice(-1);
/**
 * Marker Swipe: a power word takes the screen alone, a little bigger, between the words around it.
 * The phrase is cut into parts (words before, the power word, words after); the part on screen is
 * the last one whose first word has started.
 */
const soloPart = (cue: ShownCue, nowMs: number, fps: number): ShownCue => {
  const power = new Set(cue.heroWords.filter((word) => word.text.replace(/[^\p{L}\p{M}\p{N}]/gu, "").length >= 3).map((word) => word.id));
  if (cue.words.length < 2 || !power.size) return cue;
  const parts: CaptionWord[][] = [];
  let open: CaptionWord[] = [];
  for (const word of cue.words) {
    if (power.has(word.id)) {
      if (open.length) parts.push(open);
      parts.push([word]);
      open = [];
    } else open.push(word);
  }
  if (open.length) parts.push(open);
  if (parts.length < 2) return cue;
  let at = 0;
  parts.forEach((part, i) => { if (nowMs >= part[0].startMs) at = i; });
  const frameOf = (ms: number) => Math.floor((ms * fps) / 1000);
  const words = parts[at];
  const ids = new Set(words.map((word) => word.id));
  return {
    ...cue,
    id: `${cue.id}:${at}`,
    words,
    heroWords: cue.heroWords.filter((word) => ids.has(word.id)),
    startFrame: at === 0 ? cue.startFrame : Math.max(cue.startFrame, frameOf(words[0].startMs)),
    endFrame: at === parts.length - 1 ? cue.endFrame : Math.min(cue.endFrame, Math.max(cue.startFrame + 1, frameOf(parts[at + 1][0].startMs))),
    solo: words.length === 1 && power.has(words[0].id),
  };
};

/** Layouts that work without a key word: once words are chosen, only those get the treatment. */
const OPTIONAL_HERO = new Set(["circle-callout", "marker-swipe", "sticker-words", "lower-third", "sport-slant", "glitch-split"]);
/** Layouts whose treatment only ever goes to a marked key word. */
const KEY_ONLY = new Set(["marker-swipe", "outline-hero"]);

/** Hero line over supporting lines: big gradient word with a cinematic glow. */
const CinematicStack = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const hero = heroOf(cue);
  const ids = new Set(hero.map((word) => word.id));
  const first = cue.words.findIndex((word) => ids.has(word.id));
  const before = first > 0 ? cue.words.slice(0, first) : [];
  const after = cue.words.slice(first + hero.length).filter((word) => !ids.has(word.id));
  // Native words (Hindi…): sized by their visible letters, capped lower, with room for vowel signs; helpers a bit larger.
  const native = isComplexScript(cue.words.map((word) => word.text).join(" "));
  const chars = Math.max(3, native ? textLength(text(hero)) : text(hero).length);
  const heroEm = clamp(ctx.availableWidth / (ctx.px * chars * 0.82), native ? 1 : 0.55, native ? 1.12 : 1.6);
  const row = (words: CaptionWord[]) =>
    words.length ? (
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: native ? ".05em .26em" : ".1em .55em",
        fontSize: ".5em", fontWeight: 700, fontFamily: ctx.fam(700), letterSpacing: native ? 0 : ".16em", textTransform: "uppercase", lineHeight: native ? 1.12 : 1.08 }}>
        {words.map((word) => (
          <span key={word.id} {...enter(word, ctx, { opacity: 0.95,
            textShadow: `0 ${0.05 * ctx.px}px ${0.2 * ctx.px}px rgba(0,0,0,.55)` })}>{word.text}</span>
        ))}
      </div>
    ) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      {row(before)}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 .2em",
        fontSize: `${heroEm}em`, lineHeight: native ? 1 : 0.84, textTransform: "uppercase" }}>
        {hero.map((word) => (
          <span key={word.id} {...enter(word, ctx, { display: "inline-block", padding: native ? ".1em .06em .04em" : ".05em .06em .02em", fontWeight: 900, fontFamily: ctx.fam(900),
            backgroundImage: `linear-gradient(180deg, #ffffff 8%, ${ctx.accent} 125%)`,
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            WebkitTextFillColor: "transparent",
            filter: `drop-shadow(0 0 .06em ${alpha(ctx.accent, 0.9)}) drop-shadow(0 0 .24em ${alpha(ctx.accent, 0.5)}) drop-shadow(0 .05em .1em rgba(0,0,0,.55))` })}>
            {word.text}
          </span>
        ))}
      </div>
      {row(after)}
    </div>
  );
};

/** Lyric-style focus: the spoken word glows, past words rest, upcoming words wait. */
const LyricFocus = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const heroIndex = cue.words.findIndex((word) => heroOf(cue).some((hero) => hero.id === word.id));
  const settledActive = heroIndex >= 0 ? heroIndex : Math.floor(cue.words.length / 2);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: ".08em .3em",
      lineHeight: 1.12, fontSize: ".92em" }}>
      {cue.words.map((word, index) => {
        let a: number, b: number;
        if (ctx.settled) {
          a = index <= settledActive ? 1 : 0;
          b = index < settledActive ? 1 : 0;
        } else {
          a = ease((ctx.now - word.startMs) / 150);
          b = ease((ctx.now - word.endMs) / 220);
        }
        const glow = a * (1 - b);
        const opacity = 0.36 + 0.64 * a - 0.2 * b;
        return (
          <span key={word.id} data-word-id={word.id} style={{ ...lookOnly(word, ctx), opacity: opacity * (typeof ctx.look(word).opacity === "number" ? ctx.look(word).opacity as number : 1), display: "inline-block",
            ...painted(word, ctx, ctx.keyIds.has(word.id) ? ctx.keyColor : undefined,
              `0 0 ${0.45 * glow}em ${alpha(ctx.accent, 0.95 * glow)}, 0 0 ${1.1 * glow}em ${alpha(ctx.accent, 0.55 * glow)}, 0 ${0.04 * ctx.px}px ${0.18 * ctx.px}px rgba(0,0,0,.5)`) }}>
            {word.text}
          </span>
        );
      })}
    </div>
  );
};

/** A hand-drawn ring circles the key word as it is spoken. */
const CircleCallout = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const heroIds = new Set(heroOf(cue).map((word) => word.id));
  const firstHero = heroOf(cue)[0];
  // The ring draws with an ease-in-out stroke just after the word lands, then the word gives a small settle.
  const age = !firstHero ? Infinity : ctx.now - firstHero.startMs;
  const raw = ctx.settled || ctx.calm || !firstHero ? 1 : clamp((age - 60) / 460, 0, 1);
  const progress = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
  const pulse = ctx.settled || ctx.calm || !firstHero ? 0 : Math.sin(Math.PI * clamp((age - 420) / 260, 0, 1));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center",
      gap: ".12em .32em", lineHeight: 1.15 }}>
      {cue.words.map((word) => {
        const hero = heroIds.has(word.id);
        const look = painted(word, ctx, hero ? ctx.keyColor : undefined, `0 ${0.04 * ctx.px}px ${0.18 * ctx.px}px rgba(0,0,0,.5)`);
        if (!hero) return <span key={word.id} {...enter(word, ctx, look)}>{word.text}</span>;
        return (
          <span key={word.id} {...enter(word, ctx, { position: "relative", display: "inline-block", padding: ".02em .14em", fontSize: "1.12em", fontWeight: 900, fontFamily: ctx.fam(900) })}>
            <span style={{ ...look, display: "inline-block", transform: pulse ? `scale(${1 + 0.045 * pulse})` : undefined }}>{word.text}</span>
            <svg viewBox="0 0 200 90" preserveAspectRatio="none" aria-hidden="true"
              style={{ position: "absolute", left: "-.3em", top: "-.22em", width: "calc(100% + .6em)", height: "calc(100% + .44em)",
                overflow: "visible", pointerEvents: "none",
                filter: `drop-shadow(0 0 ${0.22 + 0.12 * pulse}em ${alpha(ctx.accent, 0.95)}) drop-shadow(0 0 ${0.55 + 0.3 * pulse}em ${alpha(ctx.accent, 0.5)})` }}>
              {ctx.shape && <defs><linearGradient id={`${ctx.uid}-ring-${word.id}`} gradientTransform={`rotate(${ctx.shape.angle - 90} .5 .5)`}>
                {ctx.shape.stops.map((stop, i) => <stop key={i} offset={`${stop.position}%`} stopColor={stop.color} />)}</linearGradient></defs>}
              <path d="M 16 58 C 6 22 64 4 118 8 C 178 12 199 40 177 66 C 150 90 58 91 28 71 C 12 60 9 41 24 27"
                fill="none" stroke={ctx.shape ? `url(#${ctx.uid}-ring-${word.id})` : ctx.accent} strokeWidth={Math.max(2, 0.07 * ctx.px)} strokeLinecap="round"
                strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress}
                vectorEffect="non-scaling-stroke" />
            </svg>
          </span>
        );
      })}
    </div>
  );
};

/** Playful tilted stickers, with a larger one for the main word. */
const StickerWords = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const heroIds = new Set(heroOf(cue).map((word) => word.id));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: ".2em .16em", fontSize: ".72em", lineHeight: 1.1 }}>
      {cue.words.map((word, index) => {
        const hero = heroIds.has(word.id);
        const sticker = hero ? { bg: ctx.accent, fg: "#111111", rot: -3 } : STICKERS[index % STICKERS.length];
        return (
          <span key={word.id} {...enter(word, ctx, { display: "inline-block", padding: ".08em .28em", borderRadius: ".28em",
            background: sticker.bg, color: sticker.fg, fontWeight: 900, textTransform: "uppercase",
            border: `${Math.max(2, 0.06 * ctx.px)}px solid #ffffff`,
            transform: `rotate(${sticker.rot}deg) scale(${hero ? 1.22 : 1}) translateY(${(index % 2 ? 1 : -1) * 0.03}em)`,
            boxShadow: `0 ${0.1 * ctx.px}px 0 rgba(0,0,0,.35), 0 ${0.18 * ctx.px}px ${0.4 * ctx.px}px rgba(0,0,0,.25)` })}>
            {word.text}
          </span>
        );
      })}
    </div>
  );
};


const heroSet = (cue: CaptionCue) => new Set(heroOf(cue).map((word) => word.id));
const shadowSoft = (ctx: Ctx) => `0 ${0.04 * ctx.px}px ${0.18 * ctx.px}px rgba(0,0,0,.55)`;
const rowStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center" };

/** A thick hand-painted marker swipe sweeps in behind the key word. */
const MarkerSwipe = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  const first = heroOf(cue)[0];
  const progress = ctx.settled || ctx.calm || !first ? 1 : ease((ctx.now - first.startMs) / 260);
  return (
    <div style={{ ...rowStyle, gap: ".1em .3em", lineHeight: 1.3, fontSize: (cue as ShownCue).solo ? "1.3em" : undefined }}>
      {cue.words.map((word) => ids.has(word.id) ? (
        <span key={word.id} {...enter(word, ctx, { position: "relative", display: "inline-block", padding: ".02em .2em", fontWeight: 900, fontFamily: ctx.fam(900) })}>
          <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true"
            style={{ position: "absolute", left: 0, top: ".1em", width: "100%", height: "86%", zIndex: 0,
              transformOrigin: "left center", transform: `scaleX(${progress}) rotate(-1.5deg)`,
              filter: `drop-shadow(0 0 .3em ${alpha(ctx.accent, 0.55)})` }}>
            {ctx.shape && <defs><linearGradient id={`${ctx.uid}-marker-${word.id}`} gradientTransform={`rotate(${ctx.shape.angle - 90} .5 .5)`}>
              {ctx.shape.stops.map((stop, i) => <stop key={i} offset={`${stop.position}%`} stopColor={stop.color} />)}</linearGradient></defs>}
            <path d="M 3 14 C 40 3 120 11 197 5 C 200 30 195 52 198 74 C 130 81 60 71 2 77 C 7 56 -1 34 3 14 Z" fill={ctx.shape ? `url(#${ctx.uid}-marker-${word.id})` : ctx.accent} />
          </svg>
          <span style={{ position: "relative", zIndex: 1, ...painted(word, ctx, ctx.keyColor ?? "#111111") }}>{word.text}</span>
        </span>
      ) : (
        <span key={word.id} {...enter(word, ctx, { textShadow: shadowSoft(ctx) })}>{word.text}</span>
      ))}
    </div>
  );
};

/** RGB-split glitch: red and cyan channels drift apart, the key word is sliced. */
const GlitchSplit = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  const one = ctx.accent2 ?? "#ff2a5e", two = ctx.accent;
  return (
    <div style={{ ...rowStyle, gap: ".08em .3em", lineHeight: 1.1, letterSpacing: ".02em", fontSize: "1.3em" }}>
      {cue.words.map((word) => {
        const hero = ids.has(word.id);
        const jitter = ctx.settled || ctx.calm ? 0 : Math.max(0, 1 - (ctx.frame - startFrame(word, ctx.fps)) / 6);
        const d = (hero ? 0.06 : 0.035) + jitter * 0.05;
        const base: React.CSSProperties = { color: hero ? ctx.keyColor : undefined };
        if (!hero)
          return (
            <span key={word.id} {...enter(word, ctx, { ...base, textShadow: `${-d}em 0 0 ${alpha(one, 0.85)}, ${d}em 0 0 ${alpha(two, 0.85)}` })}>{word.text}</span>
          );
        const copy = (color: string, clip: string, dx: number) => (
          <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, color, clipPath: clip,
            transform: `translateX(${dx}em)`, opacity: 0.9 }}>{word.text}</span>
        );
        return (
          <span key={word.id} {...enter(word, ctx, { ...base, position: "relative", display: "inline-block", fontSize: "1.22em",
            textShadow: `${-d}em 0 0 ${alpha(one, 0.9)}, ${d}em 0 0 ${alpha(two, 0.9)}, 0 0 .5em ${alpha(two, 0.6)}` })}>
            {word.text}
            {copy(two, "inset(14% 0 60% 0)", 0.09 + jitter * 0.05)}
            {copy(one, "inset(62% 0 12% 0)", -0.09 - jitter * 0.05)}
          </span>
        );
      })}
    </div>
  );
};

/** One continuous aurora gradient flows through every word, with a soft color glow. */
const AuroraGradient = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  const n = cue.words.length;
  const stops = `linear-gradient(90deg, #8a5cff 0%, ${ctx.accent} 45%, #ffb347 100%)`;
  return (
    <div style={{ ...rowStyle, gap: ".06em .28em", lineHeight: 1.12 }}>
      {cue.words.map((word, i) => (
        <span key={word.id} {...enter(word, ctx, { display: "inline-block", padding: ".02em .04em", fontSize: ids.has(word.id) ? "1.16em" : "1em",
          backgroundImage: stops, backgroundSize: `${n * 100}% 100%`,
          backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 50}% 0`, WebkitBackgroundClip: "text", backgroundClip: "text",
          color: "transparent", WebkitTextFillColor: "transparent",
          filter: `drop-shadow(0 0 .14em ${alpha(ctx.accent, 0.75)}) drop-shadow(0 0 .5em ${alpha(ctx.accent, 0.4)}) drop-shadow(0 .04em .08em rgba(0,0,0,.5))` })}>
          {word.text}
        </span>
      ))}
    </div>
  );
};

/** Typed on a terminal bar with a blinking block cursor. */
const CHAR_MS = 38;
const TerminalType = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const still = ctx.settled || ctx.calm;
  const started = cue.words.filter((word) => still || ctx.now >= word.startMs);
  const typing = started[started.length - 1];
  // The bar slides open from the prompt first, then each word is struck key by key.
  const opened = still ? 1 : ease((ctx.frame - cue.startFrame) / Math.max(1, ctx.fps * 0.2));
  const typedOf = (word: CaptionWord) => {
    const chars = letterPieces(word.text);
    if (still) return chars.length;
    if (ctx.now < word.startMs) return 0;
    const perChar = Math.min(CHAR_MS, Math.max(12, ((word.endMs - word.startMs) * 0.9) / Math.max(1, chars.length)));
    return Math.min(chars.length, Math.floor((ctx.now - word.startMs) / perChar) + 1);
  };
  const typingDone = !typing || typedOf(typing) >= letterPieces(typing.text).length;
  // A solid caret while keys are struck; it blinks once the word is finished.
  const blink = still || !typingDone || Math.floor(ctx.frame / Math.max(1, Math.round(ctx.fps * 0.4))) % 2 === 0;
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "baseline", gap: ".05em .4em",
      fontSize: ".78em", lineHeight: 1.3, padding: ".38em .7em", textAlign: "left", background: "rgba(6,12,9,.8)",
      borderLeft: `${0.12 * ctx.px}px solid ${ctx.accent}`, borderRadius: ".12em",
      clipPath: opened < 1 ? `inset(-20% ${(1 - opened) * 100}% -20% -5%)` : undefined,
      boxShadow: `0 0 ${0.9 * ctx.px}px ${alpha(ctx.accent, 0.25)}, 0 ${0.2 * ctx.px}px ${0.6 * ctx.px}px rgba(0,0,0,.35)` }}>
      <span style={{ color: ctx.accent, textShadow: `0 0 .4em ${alpha(ctx.accent, 0.8)}` }}>&gt;</span>
      {cue.words.map((word) => {
        const chars = letterPieces(word.text);
        const shown = typedOf(word);
        return (
          <span key={word.id} data-word-id={word.id} style={{ ...lookOnly(word, ctx), whiteSpace: "pre", position: "relative" }}>
            <span style={{ position: "relative", ...painted(word, ctx, ctx.keyIds.has(word.id) ? ctx.keyColor : undefined) }}>
              {chars.slice(0, shown).join("")}
              {typing?.id === word.id && blink ? (
                <span style={{ position: "absolute", left: "100%", top: ".12em", width: ".55em", height: "1em", marginLeft: ".04em",
                  background: ctx.accent, boxShadow: `0 0 .4em ${alpha(ctx.accent, 0.9)}` }} />
              ) : null}
            </span>
            <span style={{ visibility: "hidden" }}>{chars.slice(shown).join("")}</span>
          </span>
        );
      })}
    </div>
  );
};

/** Broadcast lower-third: left accent bar, fading plate, key word in accent. */
const LowerThird = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", gap: ".05em .28em", textAlign: "left",
      fontSize: ".86em", lineHeight: 1.18, padding: ".3em 1.6em .3em .6em",
      background: "linear-gradient(90deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,.55) 65%, rgba(0,0,0,0) 100%)",
      borderLeft: `${0.13 * ctx.px}px solid ${ctx.accent}` }}>
      {cue.words.map((word) => {
        const hero = ids.has(word.id);
        return (
          <span key={word.id} {...enter(word, ctx, { fontWeight: hero ? 800 : 500, fontFamily: ctx.fam(hero ? 800 : 500),
            color: hero ? ctx.keyColor ?? ctx.accent : "inherit", textShadow: hero ? `0 0 .5em ${alpha(ctx.keyColor ?? ctx.accent, 0.55)}` : "none" })}>{word.text}</span>
        );
      })}
    </div>
  );
};

/** Message-bubble caption with a tail, like a chat reply. */
const ChatBubble = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  return (
    <div style={{ position: "relative", display: "inline-flex", flexWrap: "wrap", justifyContent: "center", gap: ".06em .28em",
      fontSize: ".8em", lineHeight: 1.22, padding: ".4em .85em", borderRadius: "1.05em", background: ctx.accent,
      boxShadow: `0 ${0.18 * ctx.px}px ${0.6 * ctx.px}px rgba(0,0,0,.35)` }}>
      <svg viewBox="0 0 12 10" aria-hidden="true" style={{ position: "absolute", left: "-.22em", bottom: 0, width: ".62em", height: ".52em" }}>
        <path d="M12 0 L12 10 L0 10 C6 9 9.5 6 10.5 0 Z" fill={ctx.accent} />
      </svg>
      {cue.words.map((word) => (
        <span key={word.id} {...enter(word, ctx, { fontWeight: ids.has(word.id) ? 800 : 500,
          color: ctx.keyIds.has(word.id) ? ctx.keyColor : undefined,
          fontFamily: ctx.fam(ids.has(word.id) ? 800 : 500) })}>{word.text}</span>
      ))}
    </div>
  );
};

/** Slanted sports look: extruded key word on a speed-stripe underline. */
const SportSlant = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  const extrude = [1, 2, 3, 4, 5].map((i) => `${0.025 * i}em ${0.025 * i}em 0 ${i < 4 ? ctx.accent : "#000000"}`).join(", ");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: "skewX(-10deg)" }}>
      <div style={{ ...rowStyle, gap: ".05em .26em", lineHeight: 1.1 }}>
        {cue.words.map((word) => ids.has(word.id) ? (
          <span key={word.id} {...enter(word, ctx, { fontSize: "1.25em", color: ctx.keyColor ?? "#ffffff", textShadow: extrude })}>{word.text}</span>
        ) : (
          <span key={word.id} {...enter(word, ctx, { textShadow: `${0.04}em ${0.04}em 0 rgba(0,0,0,.65)` })}>{word.text}</span>
        ))}
      </div>
      <div style={{ marginTop: ".08em", height: ".1em", width: "62%",
        transform: `scaleX(${ctx.settled || ctx.calm ? 1 : ease((ctx.frame - cue.startFrame) / Math.max(1, ctx.fps * 0.32))})`, background: `linear-gradient(90deg, transparent, ${ctx.accent} 18%, ${ctx.accent} 82%, transparent)`,
        boxShadow: `0 0 .4em ${alpha(ctx.accent, 0.7)}` }} />
    </div>
  );
};

/** Hollow, glowing outline key word over solid supporting words. */
const OutlineHero = ({ cue, ctx }: { cue: CaptionCue; ctx: Ctx }) => {
  const ids = heroSet(cue);
  const heroChars = Math.max(3, text(heroOf(cue)).length);
  const heroEm = clamp(ctx.availableWidth / (ctx.px * heroChars * 0.62), 0.9, 1.55);
  return (
    <div style={{ ...rowStyle, alignItems: "baseline", gap: ".04em .26em", lineHeight: 1.05 }}>
      {cue.words.map((word) => ids.has(word.id) ? (
        <span key={word.id} {...enter(word, ctx, { fontSize: `${heroEm}em`, color: "transparent",
          WebkitTextFillColor: "transparent", WebkitTextStroke: `${Math.max(2, 0.05 * ctx.px * heroEm)}px #ffffff`,
          filter: `drop-shadow(0 0 .12em ${alpha(ctx.accent, 0.95)}) drop-shadow(0 0 .45em ${alpha(ctx.accent, 0.6)})` })}>{word.text}</span>
      ) : (
        <span key={word.id} {...enter(word, ctx, { textShadow: shadowSoft(ctx) })}>{word.text}</span>
      ))}
    </div>
  );
};

// Per-layout correction so each card's dominant text reads at the same visual size
// (layouts wrap the key word, plates and support lines differently).
const CARD_SCALE: Record<string, number> = {
  "cinematic-stack": 0.78, "lyric-focus": 1.1, "circle-callout": 1, "sticker-words": 1.3,
  "marker-swipe": 1, "glitch-split": 0.8, "aurora-gradient": 1, "terminal-type": 1.2, "lower-third": 1.12,
  "chat-bubble": 1.2, "sport-slant": 0.95, "outline-hero": 1,
};

export const SignatureCaption: React.FC<SignatureProps> = ({
  styleId, sourceConfig, font, layout, accent, accent2, keyColor, keyWordIds = "", wordStyles, gradient, shape, animation, settled = false, reducedMotion = false, backgroundColor, opticalHeight,
}) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const compiled = useMemo(() => compileStyleTwo(sourceConfig, fps, {}), [sourceConfig, fps]);
  const face = useMemo<StyleTwoFont>(
    () => ({ family: font.family, src: font.src, weight: Math.round(font.weight), style: "normal" }),
    [font.family, font.src, font.weight],
  );
  const faceAt = (weight: number): StyleTwoFont => ({ ...face, weight: Math.round(clamp(weight, 100, 900)) });
  const fam = (weight: number) => `${JSON.stringify(fontFamily(faceAt(weight)))}, Inter, Arial, sans-serif`;
  const { delayRender, continueRender } = useDelayRender();
  const [ready, setReady] = useState(false);
  const [capRatio, setCapRatio] = useState(0.72);
  useLayoutEffect(() => {
    let off = false;
    const handle = delayRender("Loading caption font");
    const weights = [face.weight, Math.min(900, face.weight + 200), 600, 900];
    void Promise.all([
      ensureStyleTwoFonts({ body: faceAt(weights[0]), highlight: faceAt(weights[1]) }),
      ensureStyleTwoFonts({ body: faceAt(weights[2]), highlight: faceAt(weights[3]) }),
    ])
      .catch(() => [])
      .then(() => {
        if (!off) {
          try {
            const c = document.createElement("canvas").getContext("2d");
            if (c) {
              c.font = `${face.weight} 100px ${fam(face.weight)}`;
              const a = c.measureText("H").actualBoundingBoxAscent / 100;
              if (a > 0.4 && a < 1.1) setCapRatio(a);
            }
          } catch { /* keep default ratio */ }
          setReady(true);
        }
        continueRender(handle);
      });
    return () => { off = true; continueRender(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, delayRender, continueRender]);

  const cues = compiled.captions.cues;
  const index = getActiveCueIndex(cues, frame);
  const keyIds = useMemo(() => new Set(keyWordIds.split(" ").filter(Boolean)), [keyWordIds]);
  const planned = settled ? cues[0] : index >= 0 ? cues[index] : undefined;
  // Once key words exist, a line without one stays plain instead of decorating a guessed word.
  // Marker Swipe and Outline Hero decorate only words the user or the AI marked, never a guessed one
  // (the last word or a long word); the card thumbnail, which has no marks, keeps its showcase word.
  const keyOnly = KEY_ONLY.has(styleId) && !(settled && !keyIds.size);
  const marked: ShownCue | undefined = !planned ? undefined
    : keyOnly ? (() => {
      const heroWords = planned.heroWords.filter((word) => keyIds.has(word.id));
      const keyed = heroWords.length ? heroWords : planned.words.filter((word) => keyIds.has(word.id));
      return keyed.length ? { ...planned, heroWords: keyed } : { ...planned, heroWords: [], noKeyWord: true };
    })()
    : keyIds.size && OPTIONAL_HERO.has(styleId) && !planned.words.some((word) => keyIds.has(word.id))
      ? { ...planned, heroWords: [], noKeyWord: true } : planned;
  const cue = marked && styleId === "marker-swipe" && !settled && !reducedMotion ? soloPart(marked, (frame * 1000) / fps, fps) : marked;
  // Key-word motion goes to the word drawn as the key word (a chosen one, or the style's own pick).
  const heroIds = cue ? heroSet(cue) : new Set<string>();
  useWordFonts(wordStyles);
  const paused = useContext(SettledMotionContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxes = useWordBoxes(rootRef, animation?.unit === "line");
  const unit = width / 1080;
  const uid = useId().replace(/:/g, "");
  const px = opticalHeight ? (opticalHeight * unit * (CARD_SCALE[styleId] ?? 1)) / capRatio : font.size * unit;
  const maxWidth = clamp(layout.maxWidth, 0.3, 0.96);
  const ctx: Ctx = {
    frame, fps, now: (frame * 1000) / fps, px, unit, availableWidth: width * maxWidth * 0.96,
    accent, accent2, keyColor, keyIds, calm: reducedMotion, fam,
    // A chosen entrance moves the finished caption or line, so everything in it has to be there from the start.
    settled: settled || (!!animation?.in && animation.unit !== "word"),
    look: (word) => wordLook(wordStyles?.[word.id], unit),
    paint: (word) => {
      const look = wordLook(wordStyles?.[word.id], unit);
      if (look.backgroundImage) return clipText(String(look.backgroundImage));
      if (look.color) return { color: look.color };
      const edit = wordStyles?.[word.id];
      if (edit?.emphasized && edit.keyGradient) return clipText(css(edit.keyGradient));
      // Gradient text and hollow key words keep their own look; the caption gradient is for the plain words.
      if (gradient && !heroIds.has(word.id)) return clipText(css(gradient));
      return {};
    },
    shape, uid,
    pose: (word) => {
      if (!animation || settled || reducedMotion || !cue) return undefined;
      const index = cue.words.findIndex((other) => other.id === word.id);
      return poseOf(animation, (frame * 1000) / fps, cue.words, index, paused, (other) => boxes[cue.words[other].id], heroIds.has(word.id), (cue.endFrame * 1000) / fps);
    },
  };
  const motion = animation && !settled && !paused && !reducedMotion && cue
    ? captionFrame(animation, ctx.now, (cue.startFrame * 1000) / fps, (cue.endFrame * 1000) / fps)
    : undefined;
  // A chosen exit replaces the style's quick fade.
  const exit = motion ? motion.opacity : !settled && cue ? clamp((cue.endFrame - frame) / 4, 0, 1) : 1;
  const background = isRecord(compiled.background) ? compiled.background : {};
  const src = typeof background.src === "string" && background.src.trim() ? background.src : "";
  const upper = styleId === "cinematic-stack" || styleId === "sticker-words" || font.textCase === "uppercase";
  const family = fam(face.weight);
  const leftAligned = styleId === "lower-third";

  return (
    <AbsoluteFill style={{ backgroundColor: backgroundColor ?? "transparent", overflow: "hidden", pointerEvents: "none" }}>
      {src ? (
        <Sequence name="Caption footage" premountFor={fps}>
          <SourceVideo src={assetSource(src)} muted={background.muted === true}
            volume={clamp(typeof background.volume === "number" ? background.volume : 1, 0, 1)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Sequence>
      ) : null}
      {cue && ready ? (
        <div ref={rootRef} data-signature-style={styleId} data-cue-id={cue.id}
          // Anchored at the same fraction it sits at across the frame (left edge at 0%, center at 50%,
          // right edge at 100%), so it never runs off the frame. The box keeps its full width, so lines stay long.
          style={{ position: "absolute", left: leftAligned ? `${((1 - maxWidth) / 2) * 100}%` : `${clamp(layout.positionX, 0, 1) * 100}%`,
            top: `${layout.positionY * 100}%`,
            width: `${maxWidth * 100}%`,
            transform: `${leftAligned ? "translate(0, -50%)" : "translate(-50%, -50%)"}${layout.rotation ? ` rotate(${layout.rotation}deg)` : ""} ${motion?.transform ?? ""}`,
            filter: motion?.filter, clipPath: motion?.clipPath, display: "flex",
            flexDirection: "column", alignItems: leftAligned ? "flex-start" : "center", justifyContent: "center",
            textAlign: leftAligned ? "left" : "center",
            fontFamily: family, fontSize: px, fontWeight: font.weight, color: font.color, opacity: exit,
            letterSpacing: font.letterSpacing ? font.letterSpacing * unit : undefined,
            textTransform: upper ? "uppercase" : font.textCase === "lowercase" ? "lowercase" : "none",
            fontKerning: "normal", fontSynthesis: "none", overflowWrap: "normal" }}>
          {styleId === "cinematic-stack" ? <CinematicStack cue={cue} ctx={ctx} />
            : styleId === "lyric-focus" ? <LyricFocus cue={cue} ctx={ctx} />
            : styleId === "circle-callout" ? <CircleCallout cue={cue} ctx={ctx} />
            : styleId === "marker-swipe" ? <MarkerSwipe cue={cue} ctx={ctx} />
            : styleId === "glitch-split" ? <GlitchSplit cue={cue} ctx={ctx} />
            : styleId === "aurora-gradient" ? <AuroraGradient cue={cue} ctx={ctx} />
            : styleId === "terminal-type" ? <TerminalType cue={cue} ctx={ctx} />
            : styleId === "lower-third" ? <LowerThird cue={cue} ctx={ctx} />
            : styleId === "chat-bubble" ? <ChatBubble cue={cue} ctx={ctx} />
            : styleId === "sport-slant" ? <SportSlant cue={cue} ctx={ctx} />
            : styleId === "outline-hero" ? <OutlineHero cue={cue} ctx={ctx} />
            : <StickerWords cue={cue} ctx={ctx} />}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export default SignatureCaption;
