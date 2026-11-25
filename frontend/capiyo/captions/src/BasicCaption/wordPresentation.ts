export type Gradient = {
  stops: { color: string; position: number }[];
  angle: number;
  scope: "word" | "character";
};
export type Highlight = {
  color: string;
  backgroundColor: string;
  mode: "text" | "fill";
  scale: number;
};
export type BasicWordPresentation = {
  /** A Premium word's size against the rest of its part. */
  sizeScale?: number;
  font?: {
    family: string;
    src: string;
    weight: number;
    italic: boolean;
    size: number;
    color: string;
    letterSpacing: number;
    lineHeight: number;
  };
  gradient?: Gradient | null;
  keyGradient?: Gradient;
  shadow?: number;
  overrideColor?: boolean;
  /** The word chose its own font, size or case; `font` also carries the shared values. */
  ownFont?: boolean;
  ownSize?: boolean;
  ownSpacing?: boolean;
  textCase?: string;
  /** The word's own Design effects; they replace the caption's for this word. */
  effects?: {
    opacity?: number;
    blend?: string;
    stroke?: { color: string; width: number };
    shadow?: { color: string; blur: number; x: number; y: number };
    glow?: { color: string; blur: number };
    depth?: { color: string; length: number; angle: number };
  };
  highlighted?: boolean;
  /** Set while a blended key word is drawn on a layer of its own: hidden on the caption, shown on its layer. */
  blendPass?: "hidden" | "visible";
  /** Key word chosen by the user or the AI. Works even when the style's active-word effect is off. */
  emphasized?: boolean;
  highlight?: Partial<Highlight>;
};
export function resolveWordPresentation({
  frame,
  fps,
  startMs,
  endMs,
  activeWord,
  highlights,
  edit,
  gradient: sharedGradient,
  color: baseColor,
  legacyColor,
}: {
  frame: number;
  fps: number;
  startMs: number;
  endMs: number;
  activeWord?: boolean;
  highlights?: Highlight & { enabled: boolean };
  edit?: BasicWordPresentation;
  gradient?: Gradient;
  color: string;
  legacyColor?: string;
}) {
  const spoken =
    frame >= Math.ceil((startMs * fps) / 1000 - 1e-7) &&
    frame < Math.ceil((endMs * fps) / 1000 - 1e-7);
  const highlighted =
    (!!highlights && edit?.emphasized === true) ||
    (!!highlights?.enabled &&
      edit?.highlighted !== false &&
      (edit?.highlighted === true || (activeWord === true && spoken)));
  const appearance = highlights
    ? { ...highlights, ...edit?.highlight }
    : undefined;
  let gradient = edit?.gradient === undefined ? sharedGradient : edit.gradient;
  let color = edit?.font?.color ?? baseColor;
  if (legacyColor) {
    color = legacyColor;
    gradient = undefined;
  }
  if (highlighted && appearance) {
    if (edit?.highlight?.color) {
      color = edit.highlight.color;
      gradient = undefined;
    } else if (!edit?.overrideColor && !legacyColor) {
      color = appearance.color;
      gradient = undefined;
    }
  }
  if (highlighted && edit?.keyGradient) gradient = edit.keyGradient;
  return { highlighted, appearance, gradient, color };
}

/** An outline built from four hard drop-shadows: it follows any shape, so it works on a whole layer too. */
export function strokeFilter(stroke: { color: string; width: number } | undefined, unit: number) {
  if (!stroke || stroke.width <= 0) return undefined;
  const w = (stroke.width * unit).toFixed(2);
  return [`${w}px 0`, `-${w}px 0`, `0 ${w}px`, `0 -${w}px`].map((at) => `drop-shadow(${at} 0 ${stroke.color})`).join(" ");
}

/** Every Design effect as one filter chain: outline first, then depth, glow and shadow. */
export function effectsFilter(
  fx: { stroke?: { color: string; width: number }; shadow?: { color: string; blur: number; x: number; y: number };
    glow?: { color: string; blur: number }; depth?: { color: string; length: number; angle: number } } | undefined,
  unit: number,
) {
  return [strokeFilter(fx?.stroke, unit), textEffectFilter(fx, unit)].filter(Boolean).join(" ") || undefined;
}

/**
 * Filters follow the glyph silhouette, so they work on gradient text (text-shadow would paint over it).
 * Order: depth (built from stacked 1-step shadows so it stays solid), then glow, then the drop shadow.
 */
export function textEffectFilter(
  fx:
    | {
        shadow?: { color: string; blur: number; x: number; y: number };
        glow?: { color: string; blur: number };
        depth?: { color: string; length: number; angle: number };
      }
    | undefined,
  unit: number,
) {
  if (!fx) return undefined;
  const parts: string[] = [];
  if (fx.depth && fx.depth.length > 0) {
    // Each drop-shadow copies everything before it, so offsets of 1, 2, 4, 8... step give 2^k - 1 solid copies
    // from only k filters: copies sit at most ~1px apart (no gaps on thin glyphs like commas) and stay cheap.
    const total = fx.depth.length * unit;
    const passes = Math.min(8, Math.max(1, Math.ceil(Math.log2(total + 1))));
    const step = total / (2 ** passes - 1);
    const radians = (fx.depth.angle * Math.PI) / 180;
    for (let i = 0; i < passes; i++) {
      const reach = step * 2 ** i;
      parts.push(`drop-shadow(${(Math.cos(radians) * reach).toFixed(2)}px ${(Math.sin(radians) * reach).toFixed(2)}px 0 ${fx.depth.color})`);
    }
  }
  if (fx.glow) {
    const glow = `drop-shadow(0 0 ${fx.glow.blur * unit}px ${fx.glow.color})`;
    parts.push(glow, glow);
  }
  if (fx.shadow)
    parts.push(`drop-shadow(${fx.shadow.x * unit}px ${fx.shadow.y * unit}px ${fx.shadow.blur * unit}px ${fx.shadow.color})`);
  return parts.length ? parts.join(" ") : undefined;
}

/**
 * A word blends only inside its caption's layer, so blended words are drawn twice: hidden in the caption,
 * then alone on a full-frame layer that blends with the video. Returns the word styles of both passes.
 */
export function blendPasses<W extends { effects?: { blend?: string } }>(wordStyles: Record<string, W> | undefined) {
  const blended = Object.entries(wordStyles ?? {}).filter(([, word]) => word.effects?.blend && word.effects.blend !== "normal");
  if (!blended.length || !wordStyles) return undefined;
  const pass = (blendPass: "hidden" | "visible") =>
    ({ ...wordStyles, ...Object.fromEntries(blended.map(([id, word]) => [id, { ...word, blendPass }])) }) as Record<string, W & { blendPass?: "hidden" | "visible" }>;
  return { blend: blended[0][1].effects!.blend as import("react").CSSProperties["mixBlendMode"], caption: pass("hidden"), layer: pass("visible") };
}
