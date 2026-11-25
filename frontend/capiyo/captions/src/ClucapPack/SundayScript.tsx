import { MotionWord } from "../Standard/MotionWord";
import { isComplexScript, letterPieces } from "../Script/scripts";
import { topLineWord } from "../Script/mix";
import { useChosenEntrance } from "../BasicCaption/cueMotion";
import React from "react";
import { BecomesWordWriting, measureBecomesWord } from "../BecomesNotes";
import { clamp, ease, out } from "./types";
import type { ClucapLayout, ClucapScene, ClucapWord } from "./types";
import type { Word } from "../LaunchCaptionPack/types";
import { NO_SIZES, SAFE_WIDTH, sizeOf, type PartSizes } from "../Premium/sizes";
import type { PickedFaces } from "./engine";

type SundayCue = Pick<ClucapLayout, "id" | "words" | "startMs" | "endMs" | "accentWordId">;
type Options = { fontSize?: number; maxWidth?: number; positionY?: number; sizes?: PartSizes; picked?: PickedFaces };
type PickedFace = PickedFaces["main"];
type Measured = Omit<ClucapWord, "x" | "baseline" | "line">;
type Row = { words: Word[]; role: "script" | "title" };
/** Joined scripts (Hindi, Tamil…) are measured and drawn as whole words, never split into letters. */
const hindi = (text: string) => isComplexScript(text);
const numeric = (value: number | undefined, fallback: number, min: number, max: number) =>
  clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
const hash = (text: string) => { let value = 0; for (const letter of text) value = (value * 31 + letter.charCodeAt(0)) >>> 0; return value; };

const measureTitle = (word: Word, size: number, ctx: CanvasRenderingContext2D, pick?: PickedFace): Measured => {
  const text = word.text.toUpperCase();
  const own = pick;
  const family = own?.family ?? "Clucap Coolvetica";
  const weight = own?.weight ?? 400, italic = own?.italic === true;
  ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${family}"`; ctx.letterSpacing = "0px";
  if (hindi(text)) {
    const m = ctx.measureText(text);
    const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
    return { word, text, family, weight, size, width: Math.max(m.width, left + m.actualBoundingBoxRight),
      inkOffset: left, ascent: Math.max(1, m.actualBoundingBoxAscent), descent: Math.max(0, m.actualBoundingBoxDescent),
      tracking: 0, role: "title", letters: [{ text, x: left }] };
  }
  // Independent ink bearings ensure separate animated letters cannot collide.
  const tracking = size * .012; let cursor = 0; let ascent = 0; let descent = 0;
  const letters = letterPieces(text).map(character => {
    const m = ctx.measureText(character);
    const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
    const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
    const x = cursor + left;
    cursor += Math.max(m.width, left + right, size * .035) + tracking;
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || 0);
    descent = Math.max(descent, m.actualBoundingBoxDescent || 0);
    return { text: character, x };
  });
  return { word, text, family, weight, italic, size, width: Math.max(1, cursor - tracking), inkOffset: 0,
    ascent: Math.max(1, ascent), descent: Math.max(0, descent), tracking: 0, role: "title", letters };
};
const measureScript = (word: Word, size: number, ctx: CanvasRenderingContext2D, pick?: PickedFace): Measured => {
  const text = word.text.toLowerCase();
  if (pick) {
    const family = pick.family, weight = pick.weight;
    const italic = pick.italic === true;
    ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${family}"`; ctx.letterSpacing = "0px";
    const m = ctx.measureText(text);
    const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
    return { word, text, size, family, weight, italic, tracking: 0, role: "script", inkOffset: left,
      width: Math.max(m.width, left + m.actualBoundingBoxRight), ascent: Math.max(1, m.actualBoundingBoxAscent), descent: Math.max(0, m.actualBoundingBoxDescent) };
  }
  const ink = measureBecomesWord(text, size);
  return { word, text, size, family: "Clucap Becomes", weight: 400, tracking: 0, role: "script", inkOffset: 0,
    width: ink.width, ascent: ink.ascent, descent: ink.descent };
};

export const layoutSundayScript = (cues: SundayCue[], config: Options, canvasHeight: number,
  ctx: CanvasRenderingContext2D): ClucapLayout[] => {
  const sizes = config.sizes ?? NO_SIZES;
  const box = numeric(config.maxWidth, .84, .5, .9);
  const capacity = 720 * Math.max(box, Math.min(SAFE_WIDTH, box * Math.max(sizes.main, sizes.helper))) - 24;
  const position = numeric(config.positionY, .73, .2, .82);
  const initial = numeric(config.fontSize, 58, 30, 110);
  return cues.map(cue => {
    const build = (base: number) => {
      const gap = base * .2;
      const measureRow = (row: Row, solo = false) => row.words.map(word =>
        // Mix: the handwritten line reads in English letters, the title line in the speaker's script.
        row.role === "script" ? measureScript(topLineWord(word), base * (solo ? 1.25 : 1.17) * sizeOf(sizes, "main", word.id), ctx, config.picked?.main) :
          measureTitle(word, base * sizeOf(sizes, "helper", word.id), ctx, config.picked?.rest));
      const rowWidth = (items: Measured[]) => items.reduce((sum, item) => sum + item.width, 0) + Math.max(0, items.length - 1) * gap;
      let rows: Row[];
      const middle = cue.words.findIndex(word => word.id === cue.accentWordId);
      const threeLine = cue.words.length >= 4 && cue.endMs - cue.startMs >= 1300 &&
        cue.words.map(word => word.text).join(" ").length >= 22 && middle > 0 && middle < cue.words.length - 1 && hash(cue.id) % 3 === 0;
      if (cue.words.length === 1) rows = [{ words: cue.words, role: "script" }];
      else if (threeLine) rows = [{ words: cue.words.slice(0, middle), role: "title" },
        { words: cue.words.slice(middle, middle + 1), role: "script" },
        { words: cue.words.slice(middle + 1), role: "title" }];
      else {
        let best = 1; let bestScore = Infinity;
        for (let split = 1; split < cue.words.length; split++) {
          const a = rowWidth(measureRow({ words: cue.words.slice(0, split), role: "script" }));
          const b = rowWidth(measureRow({ words: cue.words.slice(split), role: "title" }));
          const tinyRow = cue.words.slice(0, split).map(word => word.text).join(" ").length < 3 ? base : 0;
          const score = Math.max(a, b) + Math.abs(a - b) * .16 + tinyRow;
          if (score < bestScore) { bestScore = score; best = split; }
        }
        rows = [{ words: cue.words.slice(0, best), role: "script" }, { words: cue.words.slice(best), role: "title" }];
      }
      const measured = rows.map(row => measureRow(row, rows.length === 1));
      const widths = measured.map(rowWidth);
      const metrics = measured.map(items => ({ a: Math.max(...items.map(item => item.ascent)), d: Math.max(...items.map(item => item.descent)) }));
      // Close-set lines use actual visible ink extents, including script descenders.
      const lineGap = Math.max(2, base * .045);
      const textHeight = metrics.reduce((sum, m) => sum + m.a + m.d, 0) + (rows.length - 1) * lineGap;
      const y = (config as any).naturalWrap ? (canvasHeight - textHeight) / 2 :
        clamp(canvasHeight * position - textHeight / 2, canvasHeight * .12,
          Math.max(canvasHeight * .12, canvasHeight * .85 - textHeight - 12));
      let top = y; const items: ClucapWord[] = [];
      measured.forEach((row, line) => {
        let x = (720 - widths[line]) / 2; const baseline = top + metrics[line].a;
        row.forEach(item => { items.push({ ...item, x, baseline, line }); x += item.width + gap; });
        top += metrics[line].a + metrics[line].d + lineGap;
      });
      const width = Math.max(...widths);
      return { items, box: { x: (720 - width) / 2 - 12, y: y - 10, width: width + 24, height: textHeight + 20 },
        fits: width <= capacity && textHeight < canvasHeight * .48 };
    };
    let size = initial; let layout = build(size);
    while (!layout.fits && size > 8) { size -= 1; layout = build(size); }
    return { ...cue, items: layout.items, box: layout.box, naturalWrap: (config as any).naturalWrap } as ClucapLayout;
  });
};

export const SundayScript: React.FC<ClucapScene> = ({ cue, uid, now, reducedMotion }) => {
  const resting = (cue as any).naturalWrap;
  const chosen = useChosenEntrance();
  return <>
  <defs><filter id={`${uid}-sunday-shadow`} x="-45%" y="-65%" width="190%" height="230%">
    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#21150e" floodOpacity="0.55" />
  </filter></defs>
  {cue.items.map((item, wordIndex) => {
    const duration = Math.max(1, Math.min(420, (item.word.endMs - item.word.startMs) * .9, cue.endMs - item.word.startMs - 35));
    const script = item.role === "script";
    const still = resting || reducedMotion || chosen(item.word.id, script);
    const progress = still ? 1 : clamp((now - item.word.startMs) / duration);
    if (progress <= 0 && !resting) return null;
    if (script) return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size} main><g fill="#efc5a4" filter={`url(#${uid}-sunday-shadow)`}>
      {item.family !== "Clucap Becomes" ? <>
        <defs><clipPath id={`${uid}-script-${wordIndex}`}><rect x={item.x - 2} y={item.baseline - item.ascent - 3}
          width={(item.width + 4) * ease(progress)} height={item.ascent + item.descent + 6} /></clipPath></defs>
        <text x={item.x + item.inkOffset} y={item.baseline} fontSize={item.size} fontWeight={item.weight} fontFamily={item.family}
          fontStyle={item.italic ? "italic" : undefined} clipPath={`url(#${uid}-script-${wordIndex})`}>{item.text}</text>
      </> : <BecomesWordWriting text={item.text} x={item.x} baseline={item.baseline} size={item.size} progress={progress}
        maskPrefix={`${uid}-script-${wordIndex}`} />}
    </g></MotionWord>;
    const letters = item.letters ?? [{ text: item.text, x: item.inkOffset }];
    const stagger = Math.min(24, duration * .38 / Math.max(1, letters.length - 1));
    const riseDuration = Math.max(1, duration - stagger * Math.max(0, letters.length - 1));
    return <MotionWord key={item.word.id} id={item.word.id} startMs={item.word.startMs} size={item.size}><g fill="#fff7ee">
      {letters.map((letter, index) => {
        const local = still ? 1 : out((now - item.word.startMs - index * stagger) / riseDuration);
        if (local <= 0 && !resting) return null;
        const blur = (1 - local) * 3;
        return <text key={index} x={item.x + letter.x} y={item.baseline + (1 - local) * 10} opacity={local}
          fontFamily={item.family} fontWeight={item.weight} fontStyle={item.italic ? "italic" : undefined} fontSize={item.size}
          style={{ fontSynthesis: "none", whiteSpace: "pre", filter: blur > .02 ? `blur(${blur}px)` : undefined }}>{letter.text}</text>;
      })}
    </g></MotionWord>;
  })}
</>;
};
