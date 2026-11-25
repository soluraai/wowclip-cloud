import React, { useId, useLayoutEffect, useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { useChosenEntrance } from "../BasicCaption/cueMotion";
import { evenSizeCap } from "../CaptionEngine/evenSize";
import { inkProps, keepInside, setRow, useCaptionFaces, useCaptionStage, type StageProps } from "../Premium/captionStage";
import { signatureEase, type SignatureCue } from "../Premium/Signature/engine";
import type { SignatureFace } from "../Premium/Signature/fonts";
import type { PartSizes } from "../Premium/sizes";
import { MotionWord } from "../Standard/MotionWord";
import { usePickedFaces } from "../Premium/parts";

const FACES = {
  main: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 800 },
  helper: { family: "Inter", src: "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf", weight: 450 },
};
const MAIN_SIZE = 66, HELPER_SIZE = 50, BAR_WIDTH = 7, BAR_GAP = 16, ROW_GAP = 10;
const BAR_MS = 280, ROW_MS = 620;

type Faces = Record<keyof typeof FACES | "hindi", SignatureFace>;

const letters = (words: { text: string }[]) => words.reduce((sum, word) => sum + word.text.length + 1, 0);

const layoutBar = (cue: SignatureCue, ctx: CanvasRenderingContext2D, faces: Faces, limit: number, cap: number, sizes: PartSizes) => {
  let split = Math.max(1, Math.ceil(cue.words.length / 2)), even = Infinity;
  for (let at = 1; at < cue.words.length; at++) {
    const gap = Math.abs(letters(cue.words.slice(0, at)) * MAIN_SIZE - letters(cue.words.slice(at)) * HELPER_SIZE);
    if (gap < even) { even = gap; split = at; }
  }
  const room = limit - BAR_WIDTH - BAR_GAP;
  const rows = [cue.words.slice(0, split), cue.words.slice(split)].filter(words => words.length).map((words, index) => {
    const size = index ? HELPER_SIZE * sizes.helper : MAIN_SIZE * sizes.main;
    return { index, ...setRow(ctx, words, faces.hindi, Infinity, word => ({ text: word.text, face: index ? faces.helper : faces.main,
      size: size * (sizes.words[word.id] ?? 1) * cap, tracking: index ? 0 : size * cap * -.015 })) };
  });
  const fit = Math.min(1, room / Math.max(1, ...rows.map(row => row.width)));
  return { rows, fit, width: Math.max(...rows.map(row => row.width)) + BAR_WIDTH + BAR_GAP,
    height: rows.reduce((sum, row) => sum + row.ascent + row.descent, 0) + ROW_GAP * (rows.length - 1) };
};

/** Each row slides out from behind a bar that grows first, like a title card being pulled into view. */
export const RevealBar: React.FC<StageProps> = props => {
  const { presentationConfig } = props;
  const stage = useCaptionStage(props, 6, 34);
  const { now, unit, width, height, canvasWidth, canvasHeight, x, y, cue, cues, maxWidth, sizes, settled, reduced, needsHindi } = stage;
  // First line and second line each take the font picked for them.
  const picked = usePickedFaces(FACES, presentationConfig?.parts, { main: "main", helper: "helper" });
  const { faces, ready } = useCaptionFaces(picked, needsHindi);
  const layouts = useMemo(() => {
    if (!ready) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Caption layout requires canvas text measurement.");
    const limit = Math.max(maxWidth, Math.min(676, maxWidth * Math.max(sizes.main, sizes.helper)));
    const cap = evenSizeCap(cues.map(item => layoutBar(item, ctx, faces, limit, 1, sizes).fit));
    return cues.map(item => {
      const even = layoutBar(item, ctx, faces, limit, cap, sizes);
      return even.fit < 1 ? layoutBar(item, ctx, faces, limit, cap * even.fit, sizes) : even;
    });
  }, [ready, cues, faces, maxWidth, sizes]);
  const onLayout = presentationConfig?.onLayout;
  useLayoutEffect(() => { if (layouts.length) onLayout?.((Math.max(...layouts.map(item => item.height)) + 38) * unit); }, [layouts, onLayout, unit]);
  const chosen = useChosenEntrance();
  const uid = `bar-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const layout = cue && layouts[cue.index];
  if (!cue || !layout) return null;
  const parts = presentationConfig?.parts, wordColors = presentationConfig?.wordColors;
  const accent = presentationConfig?.highlights?.color ?? "#ffcf33";
  const still = settled || reduced;
  const left = -layout.width / 2, textLeft = left + BAR_WIDTH + BAR_GAP, top = -layout.height / 2;
  const grow = still ? 1 : signatureEase((now - cue.startMs) / BAR_MS);
  let cursor = top;
  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", background: presentationConfig?.backgroundColor ?? "transparent" }}>
    <svg width={width} height={height} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} data-reveal-bar={cue.id}
      aria-label={cue.words.map(word => word.text).join(" ")} style={{ position: "absolute", inset: 0, display: "block" }}>
      <defs><clipPath id={`${uid}-clip`}><rect x={textLeft - 4} y={-canvasHeight} width={canvasWidth * 2} height={canvasHeight * 2} /></clipPath></defs>
      <g transform={`translate(${keepInside(x, layout.width, canvasWidth)} ${keepInside(y, layout.height, canvasHeight)})`}>
        <rect data-reveal-bar-line="" aria-hidden="true" x={left} y={-layout.height / 2 * grow - 5} width={BAR_WIDTH} height={layout.height * grow + 10} fill={accent} />
        <g clipPath={`url(#${uid}-clip)`}>
          {layout.rows.map(row => {
            const baseline = cursor + row.ascent;
            cursor += row.ascent + row.descent + ROW_GAP;
            const main = row.index === 0, first = row.runs[0].word;
            const held = settled || row.runs.every(run => chosen(run.word.id, main));
            const p = held ? 1 : reduced ? Number(now >= first.startMs) : signatureEase((now - first.startMs) / ROW_MS);
            const fill = parts?.[main ? "main" : "helper"]?.color ?? "#ffffff";
            return <g key={row.index} transform={`translate(${(p - 1) * (row.width + 20)} 0)`}>
              {row.runs.map(run => settled || now >= first.startMs ? <MotionWord key={run.word.id} id={run.word.id} startMs={first.startMs} size={run.size} main={main}>
                <text x={textLeft + run.x} y={baseline} fill={wordColors?.[run.word.id] ?? fill} {...inkProps(run.face, run.size, run.tracking)}>{run.text}</text>
              </MotionWord> : null)}
            </g>;
          })}
        </g>
      </g>
    </svg>
  </AbsoluteFill>;
};
