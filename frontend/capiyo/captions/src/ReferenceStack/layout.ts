import { clamp, finite } from "../CaptionEngine/types";
import { letterPieces } from "../Script/scripts";
import type {
  CompiledStackCue,
  StackConfig,
  StackFontConfig,
  StackRoleName,
  StackWord,
} from "./engine";

export type StackFont = StackFontConfig;

export type StackGlyph = {
  text: string;
  x: number;
  offset: number;
};

export type StackToken = {
  wordId: string;
  text: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  size: number;
  tracking: number;
  scaleX: number;
  scaleY: number;
  character: boolean;
  font: StackFont;
  role: StackRoleName;
  lineIndex: number;
  glyphs: StackGlyph[];
};

export type StackPage = {
  startMs: number;
  endMs: number;
  centerX: number;
  baseline: number;
  inkTop: number;
  inkBottom: number;
  words: StackWord[];
  tokens: StackToken[];
  depthEnabled: boolean;
  readabilityLimited?: boolean;
};

export const stackFontFamily = (font: StackFont): string =>
  font.src
    ? `ReferenceStack-${font.family.replace(/[^a-zA-Z0-9]/g, "")}-${font.weight}-${font.style}`
    : font.family;

const NON_LATIN_REGEX = /[^\p{Script=Latin}\p{N}\p{P}\p{Zs}]/u;

let sharedCanvasContext: CanvasRenderingContext2D | null = null;
const getMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === "undefined") return null;
  if (!sharedCanvasContext) {
    const canvas = document.createElement("canvas");
    sharedCanvasContext = canvas.getContext("2d");
  }
  return sharedCanvasContext;
};

const measureWordAdvance = (
  text: string,
  font: StackFont,
  size: number,
  tracking: number,
  scaleX: number,
): {
  width: number;
  ascent: number;
  descent: number;
  charX: number[];
  left: number;
  right: number;
} => {
  const ctx = getMeasureContext();
  const chars = letterPieces(text);
  const trackingPx = tracking * size;

  if (!ctx) {
    const charX = chars.map((_, i) => i * (size * 0.52 + trackingPx) * scaleX);
    const width =
      chars.length > 0
        ? (chars.length * size * 0.52 + (chars.length - 1) * trackingPx) *
          scaleX
        : 0;
    return {
      width,
      ascent: size * 0.74,
      descent: size * 0.18,
      charX,
      left: 0,
      right: width,
    };
  }

  ctx.font = `${font.style} ${font.weight} ${size}px ${JSON.stringify(stackFontFamily(font))}, "${font.family}", Arial, sans-serif`;

  const charX: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const prefix = chars.slice(0, i).join("");
    // Include the following glyph when measuring its origin, preserving pair kerning.
    const prefixWidth =
      i === 0
        ? 0
        : ctx.measureText(prefix + chars[i]).width -
          ctx.measureText(chars[i]).width;
    charX.push((prefixWidth + i * trackingPx) * scaleX);
  }

  const fullMetrics = ctx.measureText(text);
  const rawWidth =
    fullMetrics.width + Math.max(0, chars.length - 1) * trackingPx;
  const ascent = fullMetrics.actualBoundingBoxAscent ?? size * 0.74;
  const descent = fullMetrics.actualBoundingBoxDescent ?? size * 0.18;

  return {
    width: rawWidth * scaleX,
    left: -(fullMetrics.actualBoundingBoxLeft ?? 0) * scaleX,
    right:
      ((fullMetrics.actualBoundingBoxRight ?? fullMetrics.width) +
        Math.max(0, chars.length - 1) * trackingPx) *
      scaleX,
    ascent,
    descent,
    charX,
  };
};

export const layoutReferenceStack = (
  cues: CompiledStackCue[],
  settings: StackConfig,
  width: number,
  height: number,
): StackPage[] => {
  const unit = width / 720;
  const heightScale = clamp(finite(settings.layout.heightScale, 1.28), 1, 1.6);
  const safeMarginPx =
    clamp(finite(settings.layout.safeMargin, 0.06), 0.02, 0.25) * width;
  const maxAllowedWidth = Math.min(
    clamp(finite(settings.layout.maxWidth, 0.84), 0.4, 0.96) * width,
    width - safeMarginPx * 2,
  );
  const overlapFactor = clamp(
    finite(settings.layout.overlapFactor, 0.82),
    0.65,
    1.15,
  );

  return cues.map((cue) => {
    const baseCenterX =
      clamp(finite(settings.layout.positionX, 0.5), 0.1, 0.9) * width;
    const anchorBaselineY =
      clamp(finite(settings.layout.baselineY, 0.86), 0.15, 0.9) * height;

    type MeasuredLine = {
      lineIndex: number;
      role: StackRoleName;
      offsetX: number;
      baselineY: number;
      totalWidth: number;
      inkLeft: number;
      inkRight: number;
      gap: number;
      ascent: number;
      descent: number;
      items: Array<{
        word: StackWord;
        font: StackFont;
        size: number;
        tracking: number;
        scaleX: number;
        character: boolean;
        width: number;
        charX: number[];
        left: number;
        right: number;
      }>;
    };

    const measuredLines: MeasuredLine[] = [];
    let autoCursorY = 0;

    for (let lineIdx = 0; lineIdx < cue.lines.length; lineIdx++) {
      const line = cue.lines[lineIdx];
      const roleCfg = settings.roles[line.role] ?? settings.roles.body;
      const font = settings.fonts[roleCfg.font] ?? settings.fonts.sans;
      const size = clamp(finite(line.size, roleCfg.size), 16, 200) * unit;
      const tracking = finite(roleCfg.tracking, -0.035);
      const scaleX = clamp(finite(roleCfg.widthScale, 1), 0.7, 1.3);
      const spaceGap = Math.max(
        size * 0.12,
        measureWordAdvance(" ", font, size, 0, scaleX).width +
          tracking * size * scaleX,
      );

      let lineMaxAscent = 0;
      let lineMaxDescent = 0;
      const items: MeasuredLine["items"] = [];

      for (const word of line.words) {
        const canSplitChars =
          line.reveal === "character" && !NON_LATIN_REGEX.test(word.text);
        const m = measureWordAdvance(word.text, font, size, tracking, scaleX);
        lineMaxAscent = Math.max(lineMaxAscent, m.ascent * heightScale);
        lineMaxDescent = Math.max(lineMaxDescent, m.descent * heightScale);
        items.push({
          word,
          font,
          size,
          tracking,
          scaleX,
          character: canSplitChars,
          width: m.width,
          charX: m.charX,
          left: m.left,
          right: m.right,
        });
      }

      const totalWidth =
        items.reduce((acc, it) => acc + it.width, 0) +
        Math.max(0, items.length - 1) * spaceGap;

      let baselineOffsetPx: number;
      if (lineIdx > 0 && cue.depthEnabled) {
        // Every line overlaps the one behind it by the same share of its capitals, whatever
        // letters either holds: tails simply pass behind the line in front.
        const capital = measureWordAdvance("H", font, size, 0, scaleX).ascent * heightScale;
        autoCursorY += capital * (1 - clamp(finite(settings.depth.overlap, .18), 0, .3));
        baselineOffsetPx = autoCursorY;
      } else if (typeof line.baseline === "number") {
        baselineOffsetPx = line.baseline * unit * heightScale;
        autoCursorY = baselineOffsetPx;
      } else if (lineIdx === 0) {
        baselineOffsetPx = 0;
        autoCursorY = 0;
      } else {
        const prev = measuredLines[lineIdx - 1];
        // Consistent, predictable editorial stack overlap.
        // Ascenders nest gently into the previous line's baseline zone without cutting into word bodies.
        const fullStep = prev.descent + lineMaxAscent;
        const targetOverlap = Math.min(6 * unit * heightScale, fullStep * (1 - overlapFactor));
        // Keep baseline-to-baseline distance consistent and bounded so lower lines never bury the upper line
        const minStep = lineMaxAscent * 0.74;
        const consistentStep = Math.max(minStep, fullStep - targetOverlap);
        autoCursorY += consistentStep;
        baselineOffsetPx = autoCursorY;
      }

      let advance = 0;
      let inkLeft = Infinity;
      let inkRight = -Infinity;
      for (const item of items) {
        inkLeft = Math.min(inkLeft, advance + item.left);
        inkRight = Math.max(inkRight, advance + item.right);
        advance += item.width + spaceGap;
      }
      measuredLines.push({
        lineIndex: lineIdx,
        role: line.role,
        offsetX: finite(line.offsetX, 0) * width,
        baselineY: anchorBaselineY + baselineOffsetPx,
        totalWidth,
        inkLeft,
        inkRight,
        gap: spaceGap,
        ascent: lineMaxAscent,
        descent: lineMaxDescent,
        items,
      });
    }

    // A short line stays over the same column as the rest of its 3D stack.
    if (cue.depthEnabled && measuredLines.length > 1) {
      const nudge = Math.min(width * 0.03,
        Math.min(...measuredLines.map(line => Math.max(0, line.inkRight - line.inkLeft))) * 0.12);
      for (const line of measuredLines) line.offsetX = clamp(line.offsetX, -nudge, nudge);
    }

    // Check bounds across all lines and scale uniformly if needed to stay within safe area
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;

    for (const mLine of measuredLines) {
      const lineCenter = baseCenterX + mLine.offsetX;
      const left = lineCenter - (mLine.inkRight - mLine.inkLeft) / 2;
      const right = lineCenter + (mLine.inkRight - mLine.inkLeft) / 2;
      minLeft = Math.min(minLeft, left);
      maxRight = Math.max(maxRight, right);
      minTop = Math.min(minTop, mLine.baselineY - mLine.ascent);
      maxBottom = Math.max(maxBottom, mLine.baselineY + mLine.descent);
    }

    const spanWidth = Math.max(1, maxRight - minLeft);
    const safeY =
      height * clamp(finite(settings.layout.safeMargin, 0.06), 0.02, 0.25);
    const fitScale = Math.min(
      1,
      maxAllowedWidth / spanWidth,
      (height - 2 * safeY) / Math.max(1, maxBottom - minTop),
    );
    const readabilityLimited = fitScale < 0.72;
    const fittedLeft = baseCenterX + (minLeft - baseCenterX) * fitScale;
    const fittedRight = baseCenterX + (maxRight - baseCenterX) * fitScale;
    const horizontalShift =
      Math.max(0, safeMarginPx - fittedLeft) -
      Math.max(0, fittedRight - width + safeMarginPx);
    const stackVisualHeight = Math.max(0, maxBottom - minTop);
    const balanceShift = -(stackVisualHeight * 0.28);
    const fittedTop =
      anchorBaselineY + (minTop - anchorBaselineY) * fitScale + balanceShift;
    const fittedBottom =
      anchorBaselineY + (maxBottom - anchorBaselineY) * fitScale + balanceShift;
    const verticalShift =
      balanceShift +
      Math.max(0, safeY - fittedTop) -
      Math.max(0, fittedBottom - height + safeY);

    const tokens: StackToken[] = [];

    for (const mLine of measuredLines) {
      const lineCenterX =
        baseCenterX + mLine.offsetX * fitScale + horizontalShift;
      const lineY =
        anchorBaselineY +
        (mLine.baselineY - anchorBaselineY) * fitScale +
        verticalShift;

      let cursorX =
        lineCenterX - ((mLine.inkLeft + mLine.inkRight) * fitScale) / 2;

      for (let i = 0; i < mLine.items.length; i++) {
        const item = mLine.items[i];
        const scaledSize = item.size * fitScale;
        const scaledWordWidth = item.width * fitScale;
        const spaceGap = mLine.gap * fitScale;

        const chars = Array.from(item.word.text);
        const availableMs = Math.max(
          1,
          Math.min(cue.endMs, item.word.endMs) - item.word.startMs,
        );
        const staggerMs = item.character
          ? Math.min(
              settings.motion.letterStaggerMs,
              Math.max(0, (availableMs * 0.35) / Math.max(1, chars.length - 1)),
            )
          : 0;

        const glyphs: StackGlyph[] = item.character
          ? chars.map((ch, idx) => ({
              text: ch,
              x: (item.charX[idx] ?? 0) * fitScale,
              offset: idx * staggerMs,
            }))
          : [{ text: item.word.text, x: 0, offset: 0 }];

        tokens.push({
          wordId: item.word.id,
          text: item.word.text,
          startMs: item.word.startMs,
          endMs: item.word.endMs,
          x: cursorX,
          y: lineY,
          size: scaledSize,
          tracking: item.tracking,
          scaleX: item.scaleX,
          scaleY: heightScale,
          character: item.character,
          font: item.font,
          role: mLine.role,
          lineIndex: mLine.lineIndex,
          glyphs,
        });

        cursorX += scaledWordWidth + spaceGap;
      }
    }

    return {
      startMs: cue.startMs,
      endMs: cue.endMs,
      centerX: baseCenterX,
      baseline: anchorBaselineY,
      inkTop: anchorBaselineY + (minTop - anchorBaselineY) * fitScale + verticalShift,
      inkBottom: anchorBaselineY + (maxBottom - anchorBaselineY) * fitScale + verticalShift,
      words: cue.words,
      tokens,
      depthEnabled: Boolean(cue.depthEnabled),
      readabilityLimited,
    };
  });
};
