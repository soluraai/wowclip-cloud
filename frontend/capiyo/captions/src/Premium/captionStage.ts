import { useSpacing } from "./sizes";
import { useLayoutEffect, useMemo, useState } from "react";
import { useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import type { BasicCaptionRendererProps } from "../BasicCaption/BasicCaptionRenderer";
import { useCueMotion } from "../BasicCaption/cueMotion";
import { captionFontFamily, loadCaptionFont } from "../BasicCaption/fonts";
import { isRecord } from "../CaptionEngine/types";
import { CURATED_FONTS } from "../Curated/fonts";
import { activeCue } from "../LaunchCaptionPack/timeline";
import type { Word } from "../LaunchCaptionPack/types";
import { usePartSizes } from "./parts";
import { compileSignature, type SignatureCue } from "./Signature/engine";
import { signatureAsset, type SignatureFace } from "./Signature/fonts";

/** Everything a caption drawn in one 720-wide SVG has in common. */
export type StageProps = Pick<BasicCaptionRendererProps, "sourceConfig" | "styleConfig" | "presentationConfig">;

const HINDI = /[ऀ-ॿ]/u;
const number = (value: unknown, fallback: number, lo: number, hi: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;

export const useCaptionFaces = <Role extends string>(originals: Record<Role, SignatureFace>, needsHindi: boolean) => {
  const key = JSON.stringify([originals, needsHindi]);
  const faces = useMemo(() => {
    const named = (face: SignatureFace) => ({ ...face, family: captionFontFamily(signatureAsset(face.src), face.family, face.weight, face.italic) });
    return { ...Object.fromEntries(Object.entries<SignatureFace>(originals).map(([role, face]) => [role, named(face)])), hindi: named(CURATED_FONTS.hindi) } as Record<Role | "hindi", SignatureFace>;
  }, [originals]);
  const [loaded, setLoaded] = useState("");
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false, released = false;
    const handle = delayRender("Loading caption fonts");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const wanted: SignatureFace[] = [...Object.values<SignatureFace>(originals), ...(needsHindi ? [CURATED_FONTS.hindi] : [])];
    void Promise.all(wanted
      .map(face => loadCaptionFont(signatureAsset(face.src), face.family, face.weight, face.italic)))
      .then(() => { if (!disposed) setLoaded(key); }).catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [originals, key, needsHindi, delayRender, continueRender, cancelRender]);
  return { faces, ready: loaded === key };
};

export const useCaptionStage = ({ sourceConfig, styleConfig, presentationConfig }: StageProps, maxWords: number, maxCharacters: number) => {
  const frame = useCurrentFrame(), { width, height, fps } = useVideoConfig();
  const input = isRecord(styleConfig) ? styleConfig : {}, position = isRecord(input.layout) ? input.layout : {};
  const preview = !!presentationConfig?.onLayout, settled = preview && input.naturalWrap === true;
  const unit = (preview ? width : Math.min(width, height)) / 720, canvasWidth = width / unit, canvasHeight = height / unit;
  const now = frame * 1000 / fps;
  const cues = useMemo(() => compileSignature(sourceConfig, maxWords, maxCharacters), [sourceConfig, maxWords, maxCharacters]);
  const needsHindi = useMemo(() => cues.some(cue => cue.words.some(word => HINDI.test(word.text))), [cues]);
  const cue = activeCue(cues, now);
  useCueMotion(cue?.startMs, cue?.endMs);
  return { width, height, unit, canvasWidth, canvasHeight, now, preview, settled, cues, cue, needsHindi,
    reduced: presentationConfig?.reducedMotion === true, sizes: usePartSizes(presentationConfig),
    tracking: useSpacing(presentationConfig),
    maxWidth: 720 * (preview ? .78 : number(position.maxWidth, .84, .3, .92)),
    x: canvasWidth * (preview ? .5 : number(position.positionX, .5, .1, .9)),
    y: canvasHeight * (preview ? .5 : number(position.positionY, .72, .1, .9)) };
};

const FRAME_MARGIN = 22;
/** Moves a block's center just far enough that all of it stays inside the frame. */
export const keepInside = (center: number, size: number, frame: number) =>
  size + FRAME_MARGIN * 2 >= frame ? frame / 2 : Math.max(size / 2 + FRAME_MARGIN, Math.min(frame - size / 2 - FRAME_MARGIN, center));

/** Once key words are chosen they lead; until then the cue's own strongest word does. */
export const heroOf = (cue: SignatureCue) =>
  cue.words.find(word => word.emphasis) ?? cue.words.find(word => word.id === cue.heroId) ?? cue.words[0];

/** The face a word is drawn in. Hindi and other scripts take the same face: Script/ScriptFonts pairs it with a matching face for their letters. */
export const faceFor = (_text: string, face: SignatureFace, _hindi?: SignatureFace) => face;

export const measureInk = (ctx: CanvasRenderingContext2D, text: string, face: SignatureFace, size: number, tracking = 0) => {
  ctx.font = `${face.italic ? "italic " : ""}${face.weight} ${size}px "${face.family}"`;
  ctx.letterSpacing = `${tracking}px`;
  const m = ctx.measureText(text);
  return { advance: m.width, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
    ascent: m.actualBoundingBoxAscent, descent: Math.max(0, m.actualBoundingBoxDescent) };
};

export const inkProps = (face: SignatureFace, size: number, tracking = 0) => ({
  fontFamily: `"${face.family}"`, fontSize: size, fontWeight: face.weight, fontStyle: face.italic ? "italic" : "normal", letterSpacing: tracking,
  style: { whiteSpace: "pre", fontSynthesis: "none", fontKerning: "normal" } as const,
});

export type StageRun = { word: Word; text: string; face: SignatureFace; size: number; tracking: number; x: number; advance: number; ascent: number };

/** One line of words from x = 0. A line wider than the limit tightens evenly instead of leaving the frame. */
export const setRow = (ctx: CanvasRenderingContext2D, words: Word[], hindi: SignatureFace, limit: number,
  look: (word: Word) => { text: string; face: SignatureFace; size: number; tracking?: number }, gapEm = .26) => {
  const lay = (scale: number) => {
    let x = 0, ascent = 0, descent = 0;
    const runs: StageRun[] = words.map(word => {
      const { text, face: wanted, size, tracking = 0 } = look(word);
      const face = faceFor(text, wanted, hindi), ink = measureInk(ctx, text, face, size * scale, tracking * scale);
      const run = { word, text, face, size: size * scale, tracking: tracking * scale, x, advance: ink.advance, ascent: ink.ascent };
      x += ink.advance + size * scale * gapEm;
      ascent = Math.max(ascent, ink.ascent); descent = Math.max(descent, ink.descent);
      return run;
    });
    const last = runs[runs.length - 1];
    return { runs, width: last ? last.x + last.advance : 0, ascent, descent };
  };
  const natural = lay(1);
  return natural.width > limit ? lay(limit / natural.width) : natural;
};
