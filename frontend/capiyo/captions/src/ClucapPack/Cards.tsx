import { MotionWord } from "../Standard/MotionWord";
import { useChosenEntrance } from "../BasicCaption/cueMotion";
import React from "react";
import { clamp, ease, out, wordProgress } from "./types";
import type { ClucapLayout, ClucapScene, ClucapWord } from "./types";

type Rect = { x: number; y: number; width: number; height: number; opacity: number };

const activeIndex = (items: ClucapWord[], now: number, spokenMs?: Record<string, number>) => {
  let index = -1;
  for (let i = 0; i < items.length; i++) {
    if ((spokenMs?.[items[i].word.id] ?? items[i].word.startMs) <= now) index = i;
  }
  return index;
};

const wordRect = (item: ClucapWord, box: ClucapLayout["box"], items: ClucapWord[], centerInk = false): Rect => {
  const inset = 3;
  const line = items.filter(other => other.line === item.line);
  const ascent = centerInk ? item.ascent : Math.max(...line.map(other => other.ascent));
  const descent = centerInk ? item.descent : Math.max(...line.map(other => other.descent));
  const size = centerInk ? item.size : Math.max(...line.map(other => other.size));
  const width = Math.min(item.width + item.size * .24, Math.max(1, box.width - inset * 2));
  const height = Math.min(ascent + descent + size * .24, Math.max(1, box.height - inset * 2));
  return {
    x: clamp(item.x - item.size * .12, box.x + inset, box.x + box.width - inset - width),
    y: clamp(item.baseline - ascent - size * .12, box.y + inset, box.y + box.height - inset - height),
    width, height, opacity: 1,
  };
};

// Analytic damped motion preserves position and velocity when rapid words
// interrupt a transition. No timer, persistent playback state, or frame randomness.
const movingRect = (cue: ClucapLayout, index: number, now: number, centerInk = false): Rect => {
  const current = cue.items[index];
  let first = index;
  while (first > 0 && cue.items[first - 1].line === current.line) first--;
  let target = wordRect(cue.items[first], cue.box, cue.items, centerInk);
  const state = { ...target };
  const velocity = { x: 0, y: 0, width: 0, height: 0 };
  let time = cue.items[first].word.startMs;
  const advance = (nextTime: number) => {
    const seconds = Math.max(0, nextTime - time) / 1000;
    const omega = 30; const decay = Math.exp(-omega * seconds);
    for (const key of ["x", "y", "width", "height"] as const) {
      const error = state[key] - target[key];
      const motion = velocity[key] + omega * error;
      state[key] = target[key] + (error + motion * seconds) * decay;
      velocity[key] = (velocity[key] - omega * motion * seconds) * decay;
    }
    time = nextTime;
  };
  for (let i = first + 1; i <= index; i++) {
    advance(cue.items[i].word.startMs);
    target = wordRect(cue.items[i], cue.box, cue.items, centerInk);
  }
  advance(now);
  const width = clamp(state.width, 1, cue.box.width - 6);
  const height = clamp(state.height, 1, cue.box.height - 6);
  return { x: clamp(state.x, cue.box.x + 3, cue.box.x + cue.box.width - 3 - width),
    y: clamp(state.y, cue.box.y + 3, cue.box.y + cue.box.height - 3 - height), width, height, opacity: 1 };
};

// The text stays fixed. Crossfade between lines instead of dragging a highlight
// diagonally through other words, and keep the latest word marked during pauses.
const spokenRects = ({ cue, now, reducedMotion, settled, styleId, spokenMs }: ClucapScene): Rect[] => {
  const centerInk = styleId === "redline-word-box";
  if (settled) {
    const selected = cue.items.find(item => item.word.id === cue.accentWordId) ?? cue.items[0];
    return selected ? [wordRect(selected, cue.box, cue.items, centerInk)] : [];
  }
  const index = activeIndex(cue.items, now, spokenMs);
  if (index < 0) return [];
  const current = cue.items[index];
  if (reducedMotion) return [wordRect(current, cue.box, cue.items, centerInk)];
  const target = movingRect(cue, index, now, centerInk);
  let first = index;
  while (first > 0 && cue.items[first - 1].line === current.line) first--;
  if (first === 0) return [{ ...target, opacity: ease((now - cue.startMs) / 160) }];
  const lineStart = cue.items[first].word.startMs;
  const progress = ease((now - lineStart) / 150);
  if (progress < 1) {
    const previous = movingRect(cue, first - 1, lineStart, centerInk);
    return [{ ...previous, opacity: 1 - progress }, { ...target, opacity: progress }];
  }
  return [target];
};

type WordsProps = {
  scene: ClucapScene;
  fill: string;
  variant: "redline" | "purple" | "filler";
  highlights?: Rect[];
};

const Words: React.FC<WordsProps> = ({ scene, fill, variant, highlights = [] }) => {
  const { cue, now, reducedMotion, settled } = scene;
  const chosen = useChosenEntrance();
  return <>{cue.items.map(item => {
    const entry = settled || variant === "redline" ? 1 : variant === "filler" ? reducedMotion ? 1 : out((now - cue.startMs) / 140) :
      wordProgress(item.word, now, reducedMotion || chosen(item.word.id), 155);
    const duration = Math.max(1, item.word.endMs - item.word.startMs);
    const attack = Math.min(90, duration * .45);
    const releaseStart = item.word.endMs - Math.min(80, duration * .35);
    const pulse = !settled && !reducedMotion && variant === "purple" && now >= item.word.startMs
      ? out((now - item.word.startMs) / attack) * (1 - ease((now - releaseStart) / 130)) : 0;
    const scale = 1 + pulse * .05;
    const centerX = item.x + item.width / 2;
    const centerY = item.baseline - item.ascent * .42;
    // Change the whole word's color only as the highlight covers its ink.
    // A single text layer keeps moving clip edges from slicing through letters.
    const darkAmount = variant === "redline" ? highlights.reduce((amount, rect) => {
      const overlapX = Math.max(0, Math.min(item.x + item.width, rect.x + rect.width) - Math.max(item.x, rect.x));
      const top = item.baseline - item.ascent;
      const bottom = item.baseline + item.descent;
      const overlapY = Math.max(0, Math.min(bottom, rect.y + rect.height) - Math.max(top, rect.y));
      const coverage = Math.min(overlapX / Math.max(1, item.width), overlapY / Math.max(1, bottom - top));
      return Math.max(amount, ease((coverage - .92) / .08) * ease((rect.opacity - .5) / .5));
    }, 0) : 0;
    const wordFill = variant === "redline"
      ? `rgb(${[255, 242, 233].map((channel, i) => Math.round(channel + ([16, 16, 15][i] - channel) * darkAmount)).join(",")})`
      : fill;
    return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size}><text x={item.x + item.inkOffset} y={item.baseline}
      fill={wordFill} fontFamily={item.family} fontSize={item.size} fontWeight={item.weight} fontStyle={item.italic ? "italic" : undefined}
      stroke={variant === "filler" && item.emphasized ? fill : undefined}
      strokeWidth={variant === "filler" && item.emphasized ? .5 : 0} paintOrder="stroke fill"
      letterSpacing={item.tracking} opacity={entry}
      transform={scale !== 1 ? `translate(${centerX} ${centerY}) scale(${scale}) translate(${-centerX} ${-centerY})` : undefined}
      style={{ fontKerning: "normal", fontVariantLigatures: "normal", fontSynthesis: "none", whiteSpace: "pre" }}>
      {item.text}
    </text></MotionWord>;
  })}</>;
};

const Redline: React.FC<ClucapScene> = scene => {
  const { cue, now, reducedMotion } = scene;
  const enter = scene.settled || scene.continuousEntry || reducedMotion ? 1 : out((now - cue.startMs) / 160);
  const { box } = cue;
  const highlights = spokenRects(scene);
  return <g data-clucap-style="redline-word-box" opacity={enter}>
    <rect x={box.x} y={box.y} width={box.width} height={box.height}
      fill="#10100f" fillOpacity={.96} stroke="#b23e29" strokeWidth={1.6} />
    {highlights.map((rect, i) => <rect key={i} x={rect.x} y={rect.y}
      width={rect.width} height={rect.height} rx={4} fill="#df4b24" opacity={rect.opacity} />)}
    <Words scene={scene} fill="#fff2e9" variant="redline" highlights={highlights} />
  </g>;
};

const Purple: React.FC<ClucapScene> = scene => {
  const { cue, now, reducedMotion } = scene;
  const highlights = spokenRects(scene);
  // Overlapping smooth pulses keep the wave continuous when speech is rapid.
  const wave = reducedMotion ? 0 : cue.items.reduce((offset, item) =>
    offset - 1.4 * Math.pow(Math.sin(Math.PI * ease((now - item.word.startMs) / 240)), 2), 0);
  return <g data-clucap-style="purple-voice-blink">
    {highlights.map((rect, i) => <g key={i} opacity={rect.opacity} transform={`translate(0 ${wave})`}>
      <rect x={rect.x} y={rect.y + 4} width={rect.width} height={rect.height} rx={8}
        fill="#210641" opacity={.48} />
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={8} fill="#7028f5" />
      <rect x={rect.x + .75} y={rect.y + .75} width={Math.max(1, rect.width - 1.5)}
        height={Math.max(1, rect.height - 1.5)} rx={7.25} fill="none" stroke="#ae7aff" strokeOpacity={.22}
        strokeWidth={1.5} />
    </g>)}
    <Words scene={scene} fill="#fffaff" variant="purple" />
  </g>;
};

// A stable marker silhouette: softly uneven edges and angled ends, with no
// per-frame noise. Its outline changes continuously as the spoken word changes.
const markerPath = ({ x, y, width: w, height: h }: Rect) => {
  const edge = Math.min(2.2, h * .045);
  return `M ${x + 2} ${y + edge}
    C ${x + w * .23} ${y - edge * .4} ${x + w * .62} ${y + edge * .8} ${x + w - 1} ${y}
    L ${x + w + 1} ${y + h * .46}
    L ${x + w - 2} ${y + h - edge * .4}
    C ${x + w * .72} ${y + h + edge * .5} ${x + w * .36} ${y + h - edge * .6} ${x - 1} ${y + h}
    L ${x + 1} ${y + h * .52} Z`;
};

const Filler: React.FC<ClucapScene> = scene => {
  const highlights = spokenRects(scene);
  return <g data-clucap-style="filler">
    {highlights.map((rect, i) => <g key={i} opacity={rect.opacity}>
      <path d={markerPath(rect)} fill="#9d00ff" />
      <path d={`M ${rect.x + 3} ${rect.y + rect.height - 2} Q ${rect.x + rect.width * .55} ${rect.y + rect.height + .5} ${rect.x + rect.width - 3} ${rect.y + rect.height - 2.5}`}
        fill="none" stroke="#c16aff" strokeWidth={1.4} strokeOpacity={.22} strokeLinecap="round" />
    </g>)}
    <Words scene={scene} fill="#fffdf9" variant="filler" />
  </g>;
};

export const Cards: React.FC<ClucapScene> = scene => {
  if (scene.styleId === "redline-word-box") return <Redline {...scene} />;
  if (scene.styleId === "purple-voice-blink") return <Purple {...scene} />;
  if (scene.styleId === "filler") return <Filler {...scene} />;
  return null;
};
