"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { PreviewRenderer } from "../remotion/PreviewRenderer";
import { MOTION_MS } from "../remotion/adapter";
import { StyleCardSkeleton } from "./Skeleton";
import { basicPreviewSource, styleTwoPreviewSource, BASIC_PREVIEW_FPS, BASIC_PREVIEW_FRAMES, BASIC_PREVIEW_STILL_FRAME } from "@caption-basic-demo";
import { basicMotion, isSignatureStyleId, BASIC_STYLES } from "@caption-basic-catalog";
import { compileEditorialSelect } from "@caption-editorial-engine";
import { compileBasicCaption } from "@caption-basic-engine";
import { premiumPreviewSource, PREMIUM_PREVIEW_STILL_FRAME, PREMIUM_PREVIEW_FRAMES, PREMIUM_PREVIEW_SPEED } from "../../../captions/src/Premium/story";
import s from "./StyleLibrary.module.css";
import recorded from "./stylePreviewVideos.json";
import type { CAPTION_STYLES } from "./styleCatalog";

type Style = (typeof CAPTION_STYLES)[number];

// Every template card renders the exact same mini frame, so all captions share
// one size and the list scrolls with no re-measuring and no card height jumps.
const PREVIEW_WIDTH = 720;
const PREVIEW_HEIGHT = 406;
// Text measures ~4% of the frame width for every style (cap height), keeping
// Basic and Standard types visually equal and slightly small in the list.
const PREVIEW_OPTICAL_HEIGHT = 44;
// Basic styles keep their per-style phrase caps (that is how their real
// captions group words). Standard styles render with the engines' own default
// chunking, the exact grouping the real captions use.
const previewPhrasing = (maxWords: number) => ({
  maxWords,
  maxCharacters: 44,
  maxDurationMs: 2800,
  maxGapMs: 320,
  lingerMs: 120,
});

const previewLoops = new Map<string, { still: number; duration: number }>();
const previewTiming = (style: Style): { still: number; duration: number } => {
  if (style.category === "Premium") return { still: PREMIUM_PREVIEW_STILL_FRAME, duration: PREMIUM_PREVIEW_FRAMES };
  if (style.id === "captions-dot") return { still: BASIC_PREVIEW_FRAMES - 3, duration: BASIC_PREVIEW_FRAMES };
  let timing = previewLoops.get(style.id);
  if (!timing) {
    const previewSource = style.id === "style-two" ? styleTwoPreviewSource : basicPreviewSource;
    const basic = style.category === "Basic"
      ? compileBasicCaption(previewSource, BASIC_PREVIEW_FPS, { phrasing: previewPhrasing(style.maxWords) })
      : null;
    const editorial = basic ? null : compileEditorialSelect(basicPreviewSource);
    const duration = basic
      ? Math.max(BASIC_PREVIEW_FPS, basic.captions.durationInFrames)
      // Engines have different linger durations. End the shared loop at the
      // last spoken word so shorter engines never show an empty trailing beat.
      : BASIC_PREVIEW_FRAMES;
    // Rest shows the first chunk fully settled; hovering plays the real
    // Remotion animation from the first word at real speed, then the same
    // chunk settles back when the pointer leaves.
    const first = basic?.captions.cues[0];
    const focusWords = style.id === "editorial-select" ? editorial?.cues[0]?.words : undefined;
    const focusEnd = focusWords?.[focusWords.length - 1]?.endMs;
    timing = {
      // Focus Frame rests on the completed first phrase: the first word is
      // boxed and the final spoken word is still emphasized, as in the reference.
      still: focusEnd !== undefined
        ? Math.max(0, Math.min(duration - 1, Math.ceil(focusEnd * BASIC_PREVIEW_FPS / 1000) - 1))
        : style.id === "creator-emoji" && first ? Math.max(0, Math.ceil(first.words[first.words.length - 1].endMs * BASIC_PREVIEW_FPS / 1000) - 1)
        : first ? Math.max(0, Math.min(duration - 1, first.endFrame - 1))
        : BASIC_PREVIEW_STILL_FRAME,
      duration,
    };
    previewLoops.set(style.id, timing);
  }
  return timing;
};

// A style's own backdrop in the list: a cool graphite lets white text and lime symbols read at a glance.
// Every card uses it, so the template list reads as one set.
const PREVIEW_BACKGROUND = "#1D1F24";

// Templates recorded by scripts/capture-previews.py (id → version). Their cards play a small video instead of
// drawing the caption live, so the list stays light; the rest keep the live preview.
const RECORDED: Record<string, number> = recorded;
/** Cards whose caption reads too big next to the rest, drawn smaller (recorded or live). */
const CARD_SHRINK: Record<string, number> = { "cursor-story": .68, "dynamic-simple": .68, "smart-text-caption": .68 };
const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };

function RecordedPreview({ id, version, playing }: { id: string; version: number; playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    if (playing) { node.currentTime = 0; void node.play().catch(() => undefined); return; }
    node.pause();
  }, [playing]);
  const file = `/style-previews/${id}`;
  return <>
    {/* Loaded on first hover only; H.264 MP4 plays (hardware-decoded) in every browser. */}
    <video ref={video} src={`${file}.mp4?v=${version}`} muted loop playsInline preload="none" style={fill}
      onPlaying={() => setMoving(true)} onPause={() => setMoving(false)} />
    {/* The card at rest, kept over the video until it actually moves. */}
    <img src={`${file}.webp?v=${version}`} alt="" decoding="async" style={{ ...fill, opacity: moving ? 0 : 1 }} />
  </>;
}

const noop = () => undefined;
/** A recorded hover video runs a few frames past the last word, so its entrance has finished. */
const CAPTURE_TAIL = 16;
/** Three of the four Premium scenes (3.2 s each), ending while the third one's last word is still up. */
const PREMIUM_CAPTURE_FRAMES = Math.round((2 * 3200 + 2300) * BASIC_PREVIEW_FPS / 1000);
/** The last word stays up longer, so the recorded video ends on the whole caption, fully in. */
const heldSources = new WeakMap<object, unknown>();
function held<T extends { transcript: { endMs: number }[]; durationMs: number }>(source: T): T {
  const known = heldSources.get(source) as T | undefined;
  if (known) return known;
  const last = source.transcript.length - 1;
  const next = { ...source, durationMs: source.durationMs + 600,
    transcript: source.transcript.map((word, i) => i === last ? { ...word, endMs: word.endMs + 600 } : word) };
  heldSources.set(source, next);
  return next;
}
const previewStyle: CSSProperties = { width: "100%", aspectRatio: `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}`, pointerEvents: "none" };

// Styles draw at very different sizes, so each card is scaled until its letters stand the same height
// (not until the caption fills the card, which blew one-word styles up). Long phrases only shrink to fit.
const LETTER_HEIGHT = .095, INK_WIDTH = .82, INK_HEIGHT = .6, SMALLEST = .2, LARGEST = 1;
const SETTLE_MS = 300, SETTLE_TRIES = 12;
// A card stays hidden until its fit holds still, and reopening the list reuses that fit.
const fits = new Map<string, string>();

// A lone word looks thin at the shared letter height, so a few cards stand a little taller.
const CARD_BOOST: Record<string, number> = { "captions-dot": 1.3, "clean-subtitles": 1.15, "style-two": 1.7 };
// Standard cards whose type reads smaller or larger than its em says (thin scripts, pixel fonts).
const STANDARD_BOOSTS: Record<string, number> = {
  "sunday-script": 1.75, creator: 1.1, "relay-flow": 1.1, "pocket-flow": 1.08, "prism-relay": 1.08, "golden-aura": 1.35, "crimson-rise": 1.45, og: 1.5, "blend-cursor": 1.45, "becomes-notes": 1.45,
  "mumbai-script": 1.2, "luma-script": 1.12, "serif-glow": 1.15, sara: 1.1, "reveal-bar": .9, "red-wipe": .92, "redline-word-box": .9,
};

// A Premium card is one designed lockup (a big main word with small text around it), so every card
// fills the same share of the frame: as wide as it can be, and no taller than the rest.
const LOCKUP_WIDTH = .6, LOCKUP_HEIGHT = .44;
// Lockups whose shape reads bigger or smaller than their box (a single tall word, a wide thin line).
const PREMIUM_BOOSTS: Record<string, number> = {};
const fitLockup = (box: HTMLElement, boost = 1) => {
  box.style.transform = "none";
  const frame = box.getBoundingClientRect();
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  box.querySelectorAll("text, textPath, span, div, p").forEach((node) => {
    if (![...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) return;
    if (getComputedStyle(node).visibility === "hidden") return;
    const ink = node.getBoundingClientRect();
    if (!ink.width || !ink.height) return;
    left = Math.min(left, ink.left); right = Math.max(right, ink.right);
    top = Math.min(top, ink.top); bottom = Math.max(bottom, ink.bottom);
  });
  if (!frame.width || left === Infinity) return "";
  const scale = Math.max(SMALLEST, Math.min(2.4, frame.width * LOCKUP_WIDTH * boost / (right - left), frame.height * LOCKUP_HEIGHT * boost / (bottom - top)));
  const x = (frame.left + frame.width / 2 - (left + right) / 2) * scale, y = (frame.top + frame.height / 2 - (top + bottom) / 2) * scale;
  const fit = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
  box.style.transform = fit;
  return fit;
};
// Standard cards are sized by the type's em as drawn on screen, weighted by how much of the caption
// each word covers, so a big key word counts more than a tiny helper line. All-caps reads larger
// than mixed case at the same em, so it counts a little taller. Every card lands at one size.
const STANDARD_EM = .104, CAPS = 1.14;
const fitStandard = (box: HTMLElement, boost = 1) => {
  box.style.transform = "none";
  const frame = box.getBoundingClientRect();
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, sum = 0, weight = 0;
  const take = (ink: DOMRect) => {
    left = Math.min(left, ink.left); right = Math.max(right, ink.right);
    top = Math.min(top, ink.top); bottom = Math.max(bottom, ink.bottom);
  };
  box.querySelectorAll("text, textPath, span, div, p").forEach((node) => {
    const own = [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent ?? "").join("").trim();
    if (!own) return;
    const ink = node.getBoundingClientRect();
    if (!ink.width || !ink.height) return;
    // Hidden copies (glows, shadows behind the text) are still the same words; they only add ink.
    take(ink);
    const css = parseFloat(getComputedStyle(node).fontSize);
    if (!Number.isFinite(css) || css <= 0) return;
    let drawn = 1;
    if (node instanceof SVGGraphicsElement) {
      const m = node.getScreenCTM();
      drawn = m ? Math.hypot(m.a, m.b) : 1;
    } else if (node instanceof HTMLElement && node.offsetWidth) drawn = ink.width / node.offsetWidth;
    const caps = /\p{Lu}/u.test(own) && own === own.toLocaleUpperCase() ? CAPS : 1;
    sum += css * drawn * caps * ink.width;
    weight += ink.width;
  });
  if (!weight) return fitCaption(box, boost, 1.6);
  if (!frame.width || left === Infinity) return "";
  const em = sum / weight;
  const scale = Math.max(SMALLEST, Math.min(2.4, frame.height * STANDARD_EM * boost / em,
    frame.width * INK_WIDTH / (right - left), frame.height * INK_HEIGHT / (bottom - top)));
  const x = (frame.left + frame.width / 2 - (left + right) / 2) * scale, y = (frame.top + frame.height / 2 - (top + bottom) / 2) * scale;
  const fit = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
  box.style.transform = fit;
  return fit;
};

const fitCaption = (box: HTMLElement, boost = 1, largest = LARGEST) => {
  box.style.transform = "none";
  const frame = box.getBoundingClientRect();
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  const heights: number[] = [];
  const take = (ink: DOMRect) => {
    left = Math.min(left, ink.left); right = Math.max(right, ink.right);
    top = Math.min(top, ink.top); bottom = Math.max(bottom, ink.bottom);
  };
  box.querySelectorAll("text, textPath, span, div, p").forEach((node) => {
    if (![...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) return;
    const ink = node.getBoundingClientRect();
    if (!ink.width || !ink.height) return;
    take(ink);
    // Font size as drawn on screen: fonts' line boxes differ a lot (Integral's is tall), their em does not.
    const css = parseFloat(getComputedStyle(node).fontSize);
    const drawn = node instanceof HTMLElement && node.offsetWidth ? ink.width / node.offsetWidth : 1;
    heights.push(node instanceof HTMLElement && Number.isFinite(css) && css > 0 ? css * drawn : ink.height);
  });
  // Pen-drawn styles have no text at all: each word is a path, about three quarters of an em tall.
  if (!heights.length) box.querySelectorAll("path").forEach((node) => {
    if (node.closest("defs, clipPath, mask")) return;
    const ink = node.getBoundingClientRect();
    if (!ink.width || !ink.height) return;
    take(ink);
    heights.push(ink.height * 1.3);
  });
  if (!frame.width || left === Infinity) return "";
  // The typical word's height stands for the type size; a lone multi-line block would read too tall, so take the median.
  heights.sort((a, b) => a - b);
  const letter = heights[Math.floor(heights.length / 2)];
  const scale = Math.max(SMALLEST, Math.min(largest, frame.height * LETTER_HEIGHT * boost / letter,
    frame.width * INK_WIDTH / (right - left), frame.height * INK_HEIGHT / (bottom - top)));
  const x = (frame.left + frame.width / 2 - (left + right) / 2) * scale, y = (frame.top + frame.height / 2 - (top + bottom) / 2) * scale;
  const fit = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
  box.style.transform = fit;
  return fit;
};

function LivePreview({ style, playing, reducedMotion, frame, capture, canvas }: {
  style: Style; playing: boolean; reducedMotion: boolean; frame?: number;
  /** Recording a hover video: play every chunk to its last word instead of the short hover loop. */
  capture?: boolean;
  /** The recorder's canvas color under the caption (black for blend templates). */
  canvas?: string;
}) {
  const player = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const timing = previewTiming(style);
  const previewScale = (BASIC_STYLES.find((b) => b.id === style.id) as { previewScale?: number } | undefined)?.previewScale ?? 1;
  // A short hover loop shows the style's main feature right away instead of waiting out the full clip.
  // Premium is the whole story, sped up, because its layouts change from scene to scene.
  const premium = style.category === "Premium";
  // A recorded Premium card keeps the first three scenes of the story.
  const loopFrames = premium ? (capture ? PREMIUM_CAPTURE_FRAMES : timing.duration) : capture ? timing.duration + CAPTURE_TAIL : Math.min(timing.duration, Math.max(Math.round(BASIC_PREVIEW_FPS * 3.4), timing.still + 1));
  const ownSource = style.id === "style-two" ? styleTwoPreviewSource : basicPreviewSource;
  const sourceConfig = premium ? premiumPreviewSource : capture ? held(ownSource) : ownSource;
  const inputProps = useMemo(() => {
    const motion = style.category === "Premium" ? undefined : basicMotion(style.id);
    const { reveal, ...entrance } = motion ?? {};
    return {
    styleId: style.id,
    sourceConfig,
    styleConfig: {
      font: { src: style.fontSrc },
      layout: { positionX: 0.5, positionY: 0.5, maxWidth: style.id === "editorial-select" ? 0.78 : 0.94, safeMargin: 0.04, reveal,
        // Style Two cards must fit the whole phrase on one page so users see every word.
        ...(style.id === "style-two" ? { fontSize: 46, minFontSize: 32 } : {}) },
      // Basic keeps its per-style phrase caps (that is how real captions
      // group for those styles). Standard passes an explicit naturalWrap:
      // settled chunk while idle, and on hover the exact real word-by-word
      // Remotion animation that real captions render.
      ...(style.category === "Basic"
        ? { phrasing: previewPhrasing(style.maxWords), ...(style.id === "style-two" || isSignatureStyleId(style.id) ? { naturalWrap: !playing } : {}) }
        : { naturalWrap: style.id === "editorial-select" ? false : !playing }),
    },
    presentationConfig: {
      backgroundColor: canvas ?? "transparent",
      // Stable no-op keeps the Standard styles in their compact card
      // presentation while the card height stays fixed to the shared frame.
      onLayout: noop,
      opticalHeight: PREVIEW_OPTICAL_HEIGHT * previewScale,
      reducedMotion,
      // A card at rest shows its settled chunk; the default motion plays only on hover.
      animation: playing && motion ? { ...(entrance as Required<Pick<NonNullable<typeof motion>, "unit" | "in">> & { keyIn?: typeof motion.keyIn }), out: "none" as const, durationMs: MOTION_MS } : undefined,
    },
  };
  }, [style.id, style.category, style.fontSrc, style.maxWords, playing, reducedMotion, sourceConfig, previewScale, canvas]);

  useEffect(() => {
    const current = player.current;
    if (!current) return;
    current.pause();
    // The preview-video capture page steps through the hover loop one frame at a time.
    if (frame !== undefined) { current.seekTo(frame); return; }
    current.seekTo(playing ? 0 : Math.min(timing.still, loopFrames - 1));
    if (playing) current.play();
  }, [playing, timing.still, loopFrames, frame]);

  // The fit is in pixels, so a card that changes width (the panel was dragged or the window resized) fits again.
  const [cardWidth, setCardWidth] = useState(0);
  useEffect(() => {
    const node = box.current?.parentElement;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setCardWidth(Math.round(entry.contentRect.width / 8) * 8));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  // Fonts arrive after the first paint, so the fit is taken again until two readings agree.
  useEffect(() => {
    const node = box.current;
    if (!node || !cardWidth) return;
    const fitKey = `${style.id}@${cardWidth}`;
    const known = fits.get(fitKey);
    if (known) { node.style.transform = known; node.style.opacity = "1"; return; }
    if (playing) return;
    let last = "", tries = 0, timer = 0;
    const measure = () => {
      // Some Standard engines draw small on the shared frame, so their cards may grow past it.
      const fit = style.category === "Premium" ? fitLockup(node, PREMIUM_BOOSTS[style.id])
        : style.category === "Standard" ? fitStandard(node, STANDARD_BOOSTS[style.id]) : fitCaption(node, CARD_BOOST[style.id] ?? 1, LARGEST);
      if (fit && fit === last) fits.set(fitKey, fit);
      if (fit && fit === last || ++tries >= SETTLE_TRIES) { node.style.opacity = "1"; return; }
      last = fit;
      timer = window.setTimeout(measure, SETTLE_MS);
    };
    timer = window.setTimeout(measure, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [playing, style.id, style.category, cardWidth]);

  return <div ref={box} className={s.previewFit} data-loop-frames={loopFrames} data-fps={BASIC_PREVIEW_FPS * (premium ? PREMIUM_PREVIEW_SPEED : 1)}><Player ref={player} component={PreviewRenderer} inputProps={inputProps}
    compositionWidth={PREVIEW_WIDTH} compositionHeight={PREVIEW_HEIGHT} fps={BASIC_PREVIEW_FPS}
    durationInFrames={loopFrames} initialFrame={Math.min(timing.still, loopFrames - 1)} playbackRate={premium ? PREMIUM_PREVIEW_SPEED : 1} loop controls={false} clickToPlay={false}
    doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false} numberOfSharedAudioTags={0}
    acknowledgeRemotionLicense style={previewStyle} renderLoading={() => <StyleCardSkeleton />} showPosterWhenBuffering
  /></div>;
}

function CaptionStylePreview({ style, playing, reducedMotion, frame, live, canvas }: {
  style: Style; playing: boolean; reducedMotion: boolean; frame?: number;
  /** Always draw the caption live (the capture page records from this). */
  live?: boolean;
  canvas?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = host.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === "undefined") { const id = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(id); }
    const root = node.closest("[data-style-scroll]");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { root, rootMargin: "400px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [visible]);
  const recordedCard = visible && !!RECORDED[style.id] && !live;
  // A recording already holds the smaller caption, so only live cards shrink.
  const shrink = recordedCard ? undefined : CARD_SHRINK[style.id] ?? (style.category === "Premium" ? .78 : undefined);
  return <div ref={host} className={s.previewFrame} style={{ background: PREVIEW_BACKGROUND }} aria-hidden="true">
    {(() => { const card = recordedCard
      ? <RecordedPreview id={style.id} version={RECORDED[style.id]} playing={playing && !reducedMotion} />
      : visible
      ? <LivePreview style={style} playing={playing && !reducedMotion} reducedMotion={reducedMotion} frame={frame} capture={live} canvas={canvas} />
      : <div style={{ ...previewStyle, position: "relative" }}><StyleCardSkeleton /></div>;
    // Only shrunk cards get a wrapper: the live fit measures the box around it, so it must keep its size.
    return shrink ? <div style={{ position: "relative", height: "100%", transform: `scale(${shrink})` }}>{card}</div> : card; })()}
  </div>;
}

export default memo(CaptionStylePreview);
