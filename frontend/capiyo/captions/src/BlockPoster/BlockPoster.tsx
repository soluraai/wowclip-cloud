import { keyGradient, SvgPaint } from "../Standard/paint";
import React, { useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { useChosenEntrance } from "../BasicCaption/cueMotion";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { faceFor, inkProps, keepInside, measureInk, useCaptionFaces, useCaptionStage, type StageProps } from "../Premium/captionStage";
import { signatureEase, type SignatureCue } from "../Premium/Signature/engine";
import type { SignatureFace } from "../Premium/Signature/fonts";
import type { PartSizes } from "../Premium/sizes";
import { MotionWord } from "../Standard/MotionWord";
import { usePickedFaces } from "../Premium/parts";

const ANTON = { family: "Anton", src: "launch-caption-pack/fonts/anton/Anton-Regular.ttf", weight: 400 };
const FACES = { block: ANTON, key: ANTON };
/** Dark ink on a light block, light ink on a dark one. */
const inkOn = (hex: string) => {
  if (!/^#[\da-f]{6}$/i.test(hex)) return "#0b0b0d";
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return .299 * r + .587 * g + .114 * b > 150 ? "#0b0b0d" : "#ffffff";
};
const SIZE = 74, PAD_X = .2, PAD_Y = .13, GAP = 9, STAMP_MS = 320;

type Faces = Record<keyof typeof FACES | "hindi", SignatureFace>;

const tilt = (id: string, key: boolean) => {
  const hash = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 11);
  return (hash % 2 ? 1 : -1) * ((hash >> 2) % 3 === 0 ? 0 : .8 + (hash >> 4) % 10 / 10) * (key ? 1.4 : 1);
};

const layoutPoster = (cue: SignatureCue, ctx: CanvasRenderingContext2D, faces: Faces, limit: number, cap: number, sizes: PartSizes) => {
  const chosenKeys = cue.words.some(word => word.emphasis);
  const blocks = cue.words.map(word => {
    const key = chosenKeys ? !!word.emphasis : word.id === cue.heroId;
    const text = word.text.toUpperCase(), face = faceFor(text, key ? faces.key : faces.block, faces.hindi);
    const size = SIZE * cap * (key ? sizes.main : sizes.helper) * (sizes.words[word.id] ?? 1), ink = measureInk(ctx, text, face, size);
    const padX = size * PAD_X, padY = size * PAD_Y;
    return { word, text, face, size, key, ink, width: ink.left + ink.right + padX * 2, height: size * .96 + padY * 2, padX };
  });
  const rows: (typeof blocks)[] = [];
  for (const block of blocks) {
    const row = rows[rows.length - 1];
    if (row && row.reduce((sum, item) => sum + item.width + GAP, block.width) <= limit) row.push(block);
    else rows.push([block]);
  }
  const widest = Math.max(...rows.map(row => row.reduce((sum, item) => sum + item.width + GAP, -GAP)));
  const placed = rows.flatMap((row, index) => {
    const height = Math.max(...row.map(item => item.height));
    const rowWidth = row.reduce((sum, item) => sum + item.width + GAP, -GAP);
    const top = rows.slice(0, index).reduce((sum, other) => sum + Math.max(...other.map(item => item.height)) + GAP, 0);
    let x = -rowWidth / 2;
    return row.map(item => { const at = { ...item, x, y: top + (height - item.height) / 2 }; x += item.width + GAP; return at; });
  });
  const height = Math.max(...placed.map(item => item.y + item.height));
  return { blocks: placed, width: widest, height, fit: Math.min(1, limit / Math.max(1, widest)) };
};

/** Every spoken word is pasted on as a solid block, slightly off straight, like a torn-paper headline. */
export const BlockPoster: React.FC<StageProps> = props => {
  const { presentationConfig } = props;
  const stage = useCaptionStage(props, 5, 26);
  const { now, unit, width, height, canvasWidth, canvasHeight, x, y, cue, cues, maxWidth, sizes, settled, reduced, needsHindi } = stage;
  // Normal blocks and key blocks each take the font picked for them.
  const picked = usePickedFaces(FACES, presentationConfig?.parts, { block: "helper", key: "main" });
  const { faces, ready } = useCaptionFaces(picked, needsHindi);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Caption layout requires canvas text measurement.");
    const limit = Math.max(maxWidth, Math.min(676, maxWidth * Math.max(sizes.main, sizes.helper)));
    const cap = evenSizeCap(cues.map(item => layoutPoster(item, ctx, faces, limit, 1, sizes).fit));
    return cues.map(item => {
      const even = layoutPoster(item, ctx, faces, limit, cap, sizes);
      return even.fit < 1 ? layoutPoster(item, ctx, faces, limit, cap * even.fit, sizes) : even;
    });
  }, [ready, cues, faces, maxWidth, sizes]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (layouts.length) onLayout?.((Math.max(...layouts.map(item => item.height)) + 38) * unit); }, [layouts, onLayout, unit]);
  const chosen = useChosenEntrance();
  const uid = `poster-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const layout = cue && layouts[cue.index];
  if (!cue || !layout) return null;
  const keyColor = presentationConfig?.highlights?.color ?? "#ff3b2f";
  const keysOn = presentationConfig?.highlights?.enabled !== false;
  const keyPaint = keyGradient(presentationConfig);
  const wordColors = presentationConfig?.wordColors;
  // The color picked for the normal blocks paints the block; its ink turns light or dark to stay readable.
  const rest = presentationConfig?.paints?.rest;
  const blockFill = rest?.gradient ? `url(#${uid}-rest)` : rest?.color ?? "#ffffff";
  const blockInk = inkOn(rest?.gradient ? rest.gradient.stops[0]?.color ?? "#ffffff" : rest?.color ?? "#ffffff");
  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", background: presentationConfig?.backgroundColor ?? "transparent" }}>
    <svg width={width} height={height} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} data-block-poster={cue.id}
      aria-label={cue.words.map(word => word.text).join(" ")} style={{ position: "absolute", inset: 0, display: "block" }}>
      {(keyPaint || rest?.gradient) && <defs>{keyPaint && <SvgPaint id={`${uid}-key`} paint={keyPaint} />}
        {rest?.gradient && <SvgPaint id={`${uid}-rest`} paint={rest.gradient} />}</defs>}
      <g transform={`translate(${keepInside(x, layout.width, canvasWidth)} ${keepInside(y, layout.height, canvasHeight) - layout.height / 2})`}>
        {layout.blocks.map((block) => {
          const { word } = block;
          if (!settled && now < word.startMs) return null;
          const key = keysOn && block.key;
          // Each block is stamped on: it comes down big, presses just under its size, then sits flat.
          const t = settled || chosen(word.id, block.key) || reduced ? 1 : Math.min(1, Math.max(0, (now - word.startMs) / STAMP_MS));
          const press = t < .55 ? 1.7 - .78 * signatureEase(t / .55) : .92 + .08 * signatureEase((t - .55) / .45);
          const p = t;
          const fill = key ? keyPaint ? `url(#${uid}-key)` : keyColor : blockFill, ink = wordColors?.[word.id] ?? (key ? inkOn(keyPaint ? keyPaint.stops[0]?.color ?? keyColor : keyColor) : blockInk);
          const centerX = block.x + block.width / 2, centerY = block.y + block.height / 2;
          return <MotionWord key={word.id} id={word.id} startMs={word.startMs} size={block.size} main={block.key}>
            <g transform={`rotate(${tilt(word.id, key) - 5 * (1 - p)} ${centerX} ${centerY}) translate(${centerX} ${centerY}) scale(${press}) translate(${-centerX} ${-centerY})`}
              opacity={Math.min(1, p * 5)}>
              <g>
                <rect x={block.x} y={block.y} width={block.width} height={block.height} fill={fill} />
                <text x={block.x + block.padX + block.ink.left} y={block.y + block.height / 2 + block.ink.ascent / 2} fill={ink}
                  {...inkProps(block.face, block.size)}>{block.text}</text>
              </g>
            </g>
          </MotionWord>;
        })}
      </g>
    </svg>
  </AbsoluteFill>;
};
