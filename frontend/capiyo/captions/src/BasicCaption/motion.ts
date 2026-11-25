/**
 * Caption motion, as pure functions of time, so the editor preview and the final render
 * always draw the same frame. Offsets use em, so every effect scales with the text.
 */
export const MOTION_IN = [
  "none", "fade", "pop", "zoom", "rise", "drop", "left", "right", "blur", "bounce", "spin", "wipe", "flicker",
  "blurrise", "focus", "slam", "hookleft", "hookright", "wobble", "flip", "stretch", "glitch",
  "zoomin", "wipeleft", "wipemid", "cinema", "stamp", "spring", "elastic", "whip", "fold", "flipside", "jelly", "tada",
  "swing", "shake", "roll", "skew", "rgb", "neon", "snap",
  "trail", "glide", "punch", "slap", "typewriter", "lens", "heatwave",
] as const;
export const MOTION_OUT = [
  "none", "fade", "shrink", "float", "sink", "blur", "wipe", "blurup", "fall", "zoomout",
  "slideleft", "slideright", "popout", "spinout", "flipout", "glitch", "flicker",
] as const;
export type MotionIn = (typeof MOTION_IN)[number];
export type MotionOut = (typeof MOTION_OUT)[number];
export type MotionUnit = "caption" | "word" | "line";
export type CaptionAnimation = {
  unit: MotionUnit;
  /** Undefined keeps the style's own entrance. */
  in?: MotionIn;
  /** Key words enter on their own with this; undefined moves them with the rest. */
  keyIn?: MotionIn;
  /** Words with an entrance of their own, by word id. */
  wordIn?: Record<string, MotionIn>;
  out: MotionOut;
  /** Key words leave with this as the caption ends, on top of the caption's own exit. */
  keyOut?: MotionOut;
  durationMs: number;
};
export type MotionFrame = {
  opacity: number;
  transform: string;
  filter?: string;
  clipPath?: string;
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;
const overshoot = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const bounceOut = (t: number) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
};
const REST: MotionFrame = { opacity: 1, transform: "" };

/**
 * Heat haze: the text ripples like air above a flame, then settles. SVG displacement filters are
 * made once per strength and phase and shared by every caption on the page, so the effect is the
 * same in the editor and in the render.
 */
const HEAT_PHASES = 8;
const heatFilter = (strength: number, phase: number) => {
  const id = `capiyo-heat-${strength}-${phase}`;
  if (typeof document === "undefined" || document.getElementById(id)) return id;
  let host: Element | null = document.getElementById("capiyo-heat-filters");
  if (!host) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.id = "capiyo-heat-filters";
    svg.appendChild(defs);
    host = defs;
    document.body.appendChild(svg);
  }
  const ns = "http://www.w3.org/2000/svg";
  const filter = document.createElementNS(ns, "filter");
  filter.id = id;
  for (const [key, value] of [["x", "-20%"], ["y", "-60%"], ["width", "140%"], ["height", "220%"]]) filter.setAttribute(key, value);
  const noise = document.createElementNS(ns, "feTurbulence");
  noise.setAttribute("type", "fractalNoise");
  noise.setAttribute("baseFrequency", `${0.012 + phase * 0.0009} ${0.085 + phase * 0.004}`);
  noise.setAttribute("numOctaves", "2");
  noise.setAttribute("seed", String(phase + 1));
  noise.setAttribute("result", "noise");
  const shift = document.createElementNS(ns, "feDisplacementMap");
  shift.setAttribute("in", "SourceGraphic");
  shift.setAttribute("in2", "noise");
  shift.setAttribute("scale", String(strength * 2));
  shift.setAttribute("xChannelSelector", "R");
  shift.setAttribute("yChannelSelector", "G");
  filter.append(noise, shift);
  host!.appendChild(filter);
  return id;
};

/** t runs from 0 (hidden) to 1 (at rest). */
export function enterFrame(id: MotionIn, raw: number): MotionFrame {
  const t = clamp01(raw);
  if (t >= 1 || id === "none") return REST;
  const e = easeOut(t);
  const appear = clamp01(t * 3);
  switch (id) {
    case "fade":
      return { opacity: e, transform: "" };
    case "pop":
      return { opacity: appear, transform: `scale(${0.55 + 0.45 * overshoot(t)})` };
    case "zoom":
      return { opacity: appear, transform: `scale(${1.5 - 0.5 * e})` };
    case "rise":
      // A shorter lift with a slightly longer fade reads smoother than a quick pop-up.
      return { opacity: clamp01(t * 2), transform: `translateY(${0.4 * (1 - e)}em)` };
    case "drop":
      return { opacity: appear, transform: `translateY(${-0.6 * (1 - e)}em)` };
    case "left":
      return { opacity: clamp01(t * 2.2), transform: `translateX(${-0.9 * (1 - e)}em)`, filter: `blur(${0.1 * (1 - e)}em)` };
    case "right":
      return { opacity: clamp01(t * 2.2), transform: `translateX(${0.9 * (1 - e)}em)`, filter: `blur(${0.1 * (1 - e)}em)` };
    case "blur":
      return { opacity: e, transform: `scale(${1.06 - 0.06 * e})`, filter: `blur(${0.35 * (1 - e)}em)` };
    case "bounce":
      return { opacity: appear, transform: `translateY(${-0.8 * (1 - bounceOut(t))}em)` };
    case "spin":
      return { opacity: appear, transform: `rotate(${-16 * (1 - e)}deg) scale(${0.8 + 0.2 * e})` };
    case "wipe":
      return { opacity: 1, transform: "", clipPath: `inset(-30% ${(1 - e) * 130 - 15}% -30% -15%)` };
    case "flicker":
      return { opacity: [0, 0.8, 0.1, 1, 0.3, 1][Math.floor(t * 6)] ?? 1, transform: "" };
    case "blurrise":
      return { opacity: e, transform: `translateY(${0.5 * (1 - e)}em)`, filter: `blur(${0.3 * (1 - e)}em)` };
    case "focus":
      return { opacity: appear, transform: `scale(${1.25 - 0.25 * e})`, filter: `blur(${0.6 * (1 - e)}em)` };
    case "slam":
      return { opacity: clamp01(t * 4), transform: `scale(${1 + 1.4 * (1 - t) ** 3})` };
    case "hookleft":
      return { opacity: appear, transform: `translateX(${-1.2 * (1 - overshoot(t))}em)` };
    case "hookright":
      return { opacity: appear, transform: `translateX(${1.2 * (1 - overshoot(t))}em)` };
    case "wobble":
      return { opacity: appear, transform: `rotate(${12 * (1 - t) * Math.sin(t * Math.PI * 4)}deg)` };
    case "flip":
      return { opacity: appear, transform: `perspective(20em) rotateX(${90 * (1 - e)}deg)` };
    case "stretch":
      return { opacity: appear, transform: `scale(${0.3 + 0.7 * overshoot(t)}, ${1.2 - 0.2 * e})` };
    case "glitch": {
      const shift = [-0.12, 0.1, -0.07, 0.14, -0.04, 0.06, -0.02, 0][Math.floor(t * 8)] ?? 0;
      return { opacity: appear, transform: `translateX(${shift}em) skewX(${shift * 40}deg)` };
    }
    case "zoomin":
      return { opacity: appear, transform: `scale(${0.6 + 0.4 * e})` };
    case "wipeleft":
      return { opacity: 1, transform: "", clipPath: `inset(-30% -15% -30% ${(1 - e) * 130 - 15}%)` };
    case "wipemid": {
      const side = (1 - e) * 65 - 15;
      return { opacity: 1, transform: "", clipPath: `inset(-30% ${side}% -30% ${side}%)` };
    }
    case "snap": {
      // Lands a touch big and soft, dips just under size as it sharpens, then settles. Spoken words last
      // ~0.3 s, so the blur is gone in the first third and the word reads sharp for most of its time.
      const scale = t < 0.4 ? 1.18 - 0.21 * easeOut(t / 0.4) : 0.97 + 0.03 * easeOut((t - 0.4) / 0.6);
      return { opacity: clamp01(t * 6), transform: `translateY(${0.1 * (1 - e)}em) scale(${scale})`, filter: `blur(${0.12 * (1 - easeOut(clamp01(t / 0.3)))}em)` };
    }
    case "trail":
      // Slides on from where the word before it sits, so speech reads as one moving line.
      return { opacity: clamp01(t * 2.5), transform: `translateX(${-0.55 * (1 - e)}em)`, filter: `blur(${0.07 * (1 - e)}em)` };
    case "glide": {
      // Editor-style blur rise: lifts in soft and slightly small, sharpens well before it lands.
      const sharp = easeOut(clamp01(t / 0.7));
      return { opacity: clamp01(t * 2.2), transform: `translateY(${0.32 * (1 - e)}em) scale(${0.94 + 0.06 * e})`, filter: `blur(${0.16 * (1 - sharp)}em)` };
    }
    case "punch": {
      // A power word: lands from soft and small, overshoots a touch, then locks in sharp.
      const scale = t < 0.55 ? 0.7 + 0.38 * easeOut(t / 0.55) : 1.08 - 0.08 * easeOut((t - 0.55) / 0.45);
      return { opacity: clamp01(t * 4), transform: `scale(${scale})`, filter: `blur(${0.22 * (1 - easeOut(clamp01(t / 0.45)))}em)` };
    }
    case "slap": {
      // Hits like a label slapped on: tilted and big, a small recoil, then flat.
      const scale = t < 0.45 ? 1.3 - 0.33 * easeOut(t / 0.45) : 0.97 + 0.03 * easeOut((t - 0.45) / 0.55);
      return { opacity: clamp01(t * 5), transform: `rotate(${-5 * (1 - e)}deg) scale(${scale})`, filter: `blur(${0.1 * (1 - easeOut(clamp01(t / 0.3)))}em)` };
    }
    case "typewriter": {
      // Letters appear in steps, left to right, like keys being struck.
      const shown = Math.ceil(t * 7) / 7;
      return { opacity: 1, transform: "", clipPath: `inset(-30% ${(1 - shown) * 100}% -30% -5%)` };
    }
    case "heatwave": {
      // Ripples hard at first and calms as it lands; the phase steps so the haze keeps moving.
      const strength = Math.round(12 * (1 - e));
      const haze = strength > 0 ? `url(#${heatFilter(strength, Math.floor(t * 30) % HEAT_PHASES)}) ` : "";
      return { opacity: clamp01(t * 2.4), transform: `translateY(${0.18 * (1 - e)}em) scaleY(${1.05 - 0.05 * e})`,
        filter: `${haze}blur(${0.08 * (1 - e)}em)` };
    }
    case "lens":
      // Rack focus: starts big, bright and out of focus, then pulls sharp.
      return { opacity: clamp01(t * 2.5), transform: `scale(${1.3 - 0.3 * e})`, filter: `blur(${0.45 * (1 - e)}em) brightness(${1 + 0.8 * (1 - e)})` };
    case "cinema":
      return { opacity: e, transform: `scale(${1.14 - 0.14 * e})`, filter: `blur(${0.12 * (1 - e)}em)` };
    case "stamp": {
      const scale = t < 0.6 ? 2 - 1.08 * easeOut(t / 0.6) : 0.92 + 0.08 * easeOut((t - 0.6) / 0.4);
      return { opacity: clamp01(t * 5), transform: `scale(${scale})` };
    }
    case "spring":
      return { opacity: appear, transform: `translateY(${1 - overshoot(t)}em)` };
    case "elastic":
      return { opacity: appear, transform: `scale(${1 - (1 - t) ** 2 * Math.cos(t * Math.PI * 5)})` };
    case "whip":
      return { opacity: appear, transform: `translateX(${1.6 * (1 - e)}em) skewX(${-14 * (1 - e)}deg)`, filter: `blur(${0.22 * (1 - e)}em)` };
    case "fold":
      return { opacity: appear, transform: `perspective(20em) rotateX(${-90 * (1 - e)}deg)` };
    case "flipside":
      return { opacity: appear, transform: `perspective(20em) rotateY(${90 * (1 - e)}deg)` };
    case "jelly": {
      const squash = 0.28 * (1 - t) * Math.sin(t * Math.PI * 5);
      return { opacity: appear, transform: `scale(${1 + squash}, ${1 - squash})` };
    }
    case "tada":
      return { opacity: appear, transform: `scale(${0.9 + 0.1 * e + 0.14 * Math.sin(t * Math.PI)}) rotate(${8 * (1 - t) * Math.sin(t * Math.PI * 6)}deg)` };
    case "swing":
      return { opacity: appear, transform: `rotate(${20 * (1 - t) * Math.cos(t * Math.PI * 4)}deg)` };
    case "shake":
      return { opacity: appear, transform: `translateX(${0.22 * (1 - t) * Math.sin(t * Math.PI * 10)}em)` };
    case "roll":
      return { opacity: appear, transform: `translateX(${-1.6 * (1 - e)}em) rotate(${-40 * (1 - e)}deg)` };
    case "skew":
      return { opacity: appear, transform: `translateX(${-0.6 * (1 - e)}em) skewX(${22 * (1 - e)}deg)` };
    case "rgb": {
      const split = 0.12 * (1 - e);
      return { opacity: appear, transform: "", filter: `drop-shadow(${split}em 0 #ff2d55) drop-shadow(${-split}em 0 #22d3ee)` };
    }
    case "neon":
      return {
        opacity: [0, 0.8, 0.2, 1, 0.5, 1][Math.floor(t * 6)] ?? 1, transform: "",
        filter: `brightness(${1 + 1.6 * (1 - e)}) drop-shadow(0 0 ${0.3 * (1 - e)}em #ffffff)`,
      };
  }
}

/** t runs from 0 (at rest) to 1 (gone). */
export function exitFrame(id: MotionOut, raw: number): MotionFrame {
  const t = clamp01(raw);
  if (t <= 0 || id === "none") return REST;
  const e = easeIn(t);
  const fade = 1 - t;
  switch (id) {
    case "fade":
      return { opacity: fade, transform: "" };
    case "shrink":
      return { opacity: fade, transform: `scale(${1 - 0.3 * e})` };
    case "float":
      return { opacity: fade, transform: `translateY(${-0.5 * e}em)` };
    case "sink":
      return { opacity: fade, transform: `translateY(${0.5 * e}em)` };
    case "blur":
      return { opacity: fade, transform: "", filter: `blur(${0.3 * t}em)` };
    case "wipe":
      return { opacity: 1, transform: "", clipPath: `inset(-30% -15% -30% ${t * 130 - 15}%)` };
    case "blurup":
      return { opacity: fade, transform: `translateY(${-0.4 * e}em)`, filter: `blur(${0.3 * t}em)` };
    case "fall":
      return { opacity: fade, transform: `translateY(${0.8 * e}em) rotate(${6 * e}deg)` };
    case "zoomout":
      return { opacity: fade, transform: `scale(${1 + 0.5 * e})` };
    case "slideleft":
      return { opacity: fade, transform: `translateX(${-0.9 * e}em)` };
    case "slideright":
      return { opacity: fade, transform: `translateX(${0.9 * e}em)` };
    case "popout":
      return { opacity: fade, transform: `scale(${1 + 0.18 * Math.sin(t * Math.PI) - 0.6 * e})` };
    case "spinout":
      return { opacity: fade, transform: `rotate(${16 * e}deg) scale(${1 - 0.2 * e})` };
    case "flipout":
      return { opacity: fade, transform: `perspective(20em) rotateX(${90 * e}deg)` };
    case "glitch": {
      const shift = [0.04, -0.1, 0.14, -0.07, 0.1, -0.12][Math.floor(t * 6)] ?? 0;
      return { opacity: fade, transform: `translateX(${shift}em) skewX(${shift * 40}deg)` };
    }
    case "flicker":
      return { opacity: [1, 0.2, 0.9, 0.1, 0.6, 0][Math.floor(t * 6)] ?? 0, transform: "" };
  }
}

const join = (a: MotionFrame, b: MotionFrame): MotionFrame => ({
  opacity: a.opacity * b.opacity,
  transform: [a.transform, b.transform].filter(Boolean).join(" "),
  filter: [a.filter, b.filter].filter(Boolean).join(" ") || undefined,
  clipPath: b.clipPath ?? a.clipPath,
});

/** Short captions get shorter motion, so nothing is cut off or still moving when it ends. */
const fit = (durationMs: number, spanMs: number) => Math.max(1, Math.min(durationMs, spanMs * 0.45));

/** The frame for the whole caption: its entrance (when animated as one) and its exit. */
export function captionFrame(animation: CaptionAnimation, nowMs: number, startMs: number, endMs: number) {
  const duration = fit(animation.durationMs, endMs - startMs);
  // With no exit, a short caption (One Word) can spend most of its time on the entrance.
  const entrance = animation.out === "none"
    ? Math.max(1, Math.min(animation.durationMs, (endMs - startMs) * 0.85))
    : duration;
  const enter = animation.unit === "caption" && animation.in
    ? enterFrame(animation.in, (nowMs - startMs) / entrance) : REST;
  return join(enter, exitFrame(animation.out, (nowMs - (endMs - duration)) / duration));
}

const MIN_WORD_MS = 70;

/** The frame for one word, or undefined when words aren't animated on their own. */
export function wordFrame(animation: CaptionAnimation, nowMs: number, startMs: number, nextStartMs?: number) {
  if (!animation.in || animation.unit === "caption") return undefined;
  // The motion follows the speech: a long pause before the next word gives a long, easy entrance,
  // fast speech a short one that settles before the next word starts.
  const base = animation.durationMs * 0.8;
  const gap = nextStartMs === undefined ? base * 2 : nextStartMs - startMs;
  const length = Math.max(MIN_WORD_MS, Math.min(base * 2, gap * 0.9, Math.max(base, gap * 0.6)));
  return enterFrame(animation.in, (nowMs - startMs) / length);
}

/** One word of a style that draws its own: hidden until its turn, then its entrance, or at rest when paused. */
export function ownWordFrame(
  animation: CaptionAnimation,
  nowMs: number,
  id: string,
  startMs: number,
  nextStartMs: number | undefined,
  key: boolean,
  paused: boolean,
  endMs?: number,
): MotionFrame | undefined {
  return withKeyExit(animation, nowMs, startMs, endMs, key, paused, ownEntrance(animation, nowMs, id, startMs, nextStartMs, key, paused));
}
function ownEntrance(animation: CaptionAnimation, nowMs: number, id: string, startMs: number, nextStartMs: number | undefined, key: boolean, paused: boolean) {
  const entrance = animation.wordIn?.[id] ?? (key ? animation.keyIn : undefined) ?? (animation.unit === "caption" ? undefined : animation.in);
  if (!entrance) return undefined;
  if (nowMs < startMs) return { opacity: 0, transform: "" };
  return paused ? undefined : wordFrame({ ...animation, unit: "word", in: entrance }, nowMs, startMs, nextStartMs);
}

/** A key word's own exit, joined onto whatever its entrance pose is. */
function withKeyExit(
  animation: CaptionAnimation, nowMs: number, startMs: number, endMs: number | undefined,
  key: boolean, paused: boolean, frame: MotionFrame | undefined,
): MotionFrame | undefined {
  if (!key || paused || !animation.keyOut || animation.keyOut === "none" || endMs === undefined) return frame;
  const duration = fit(animation.durationMs, endMs - startMs);
  const exit = exitFrame(animation.keyOut, (nowMs - (endMs - duration)) / duration);
  return frame ? join(frame, exit) : exit;
}

/**
 * True when this word's entrance was chosen, so the style's own has to step aside and only the
 * chosen one plays. Clearing the choice brings the style's own entrance straight back.
 */
export const chosenEntrance = (animation: CaptionAnimation | undefined, main: boolean, id?: string) => {
  if (!animation) return false;
  if (id && animation.wordIn?.[id]) return true;
  if (animation.in && animation.unit === "caption") return true;
  return !!(main ? animation.keyIn : animation.in);
};

export type WordBox = { y: number; height: number };

/**
 * One word's pose, for play and pause alike: hidden until its turn, then its entrance, or at rest
 * when paused. Line motion runs from the first word on the row; undefined when nothing moves alone.
 */
export function poseOf(
  animation: CaptionAnimation,
  nowMs: number,
  words: { startMs: number; id?: string }[],
  index: number,
  paused: boolean,
  boxOf: (index: number) => WordBox | undefined = () => undefined,
  key = false,
  endMs?: number,
): MotionFrame | undefined {
  if (key && animation.keyOut && endMs !== undefined)
    return withKeyExit(animation, nowMs, words[index].startMs, endMs, key, paused,
      poseOf({ ...animation, keyOut: undefined }, nowMs, words, index, paused, boxOf, key));
  const own = animation.wordIn?.[words[index].id ?? ""] ?? (key ? animation.keyIn : undefined);
  if (own) return poseOf({ ...animation, unit: "word", in: own, keyIn: undefined, wordIn: undefined }, nowMs, words, index, paused);
  const sameRow = (other: number) => {
    const a = boxOf(index), b = boxOf(other);
    return !a || !b || Math.abs(b.y - a.y) < a.height / 2;
  };
  const line = animation.unit === "line";
  const startMs = line ? words[Math.max(0, words.findIndex((_, other) => sameRow(other)))].startMs : words[index].startMs;
  const next = line ? words.findIndex((_, other) => other > index && !sameRow(other)) : index + 1;
  const frame = wordFrame(animation, nowMs, startMs, words[next]?.startMs);
  if (!frame) return undefined;
  if (nowMs < startMs) return { ...frame, opacity: 0 };
  return paused ? undefined : frame;
}
