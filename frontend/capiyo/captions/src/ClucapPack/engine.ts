import { staticFile } from "remotion";
import { normalizeWords } from "../LaunchCaptionPack/timeline";
import type { CaptionSource, Word } from "../LaunchCaptionPack/types";
import type { ClucapStyleId, ClucapLayout, ClucapWord } from "./types";
import { clamp } from "./types";
import { scribbleMark, scribblePadding } from "./scribbleGeometry";
import { layoutSundayScript } from "./SundayScript";
import type { PartSizes } from "../Premium/sizes";
import { textLength, wordCount } from "../Script/scripts";

/** Fonts picked in the editor: main for a script or key line, rest for the other words. */
export type PickedFaces = { main?: { family: string; weight: number; italic: boolean }; rest?: { family: string; weight: number; italic: boolean } };
export type ClucapConfig = { fontSize?: number; positionY?: number; maxWidth?: number; naturalWrap?: boolean; sizes?: PartSizes; picked?: PickedFaces };
type Font = { family: string; path: string; weight: string };
const FONT = {
  // The user-supplied ZIP contains this static face, not a Gorvain variant.
  gorva: { family: "Clucap Gorva", path: "clucap-reference/Gorva-Regular-Demo.otf", weight: "400" },
  koch: { family: "Clucap Koch", path: "clucap-reference/Koch-Schrift-Reduced.ttf", weight: "400" },
  instrument: { family: "Clucap Instrument", path: "clucap-reference/InstrumentSans-700.ttf", weight: "700" },
  caveat: { family: "Clucap Caveat", path: "clucap-reference/Caveat-600.ttf", weight: "600" },
  caveatBold: { family: "Clucap Caveat", path: "clucap-reference/Caveat-700.ttf", weight: "700" },
  becomes: { family: "Clucap Becomes", path: "becomes-notes/Becomes Notes.ttf", weight: "400" },
  coolvetica: { family: "Clucap Coolvetica", path: "reference-stack/Coolvetica-Regular.otf", weight: "400" },
  bold: { family: "Clucap Bold", path: "clucap-reference/THEBOLDFONT-FREEVERSION.ttf", weight: "700" },
  montserrat: { family: "Clucap Montserrat", path: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: "100 900" },
  hindi: { family: "Clucap Hindi", path: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", weight: "100 900" },
} satisfies Record<string, Font>;
// Font families, weights and colors were inspected in the six live Clucap cards.
// Their reference faces are served at https://www.clucap.com/caption-fonts/.
type Spec = { font: Font; size: number; weight: number; uppercase: boolean; maxWords: number;
  maxCharacters: number; paddingX: number; paddingY: number; gap: number };
export const STYLE: Record<ClucapStyleId, Spec> = {
  "redline-word-box": { font: FONT.gorva, size: 48, weight: 400, uppercase: false, maxWords: 4, maxCharacters: 29, paddingX: 24, paddingY: 17, gap: .3 },
  "purple-voice-blink": { font: FONT.instrument, size: 54, weight: 700, uppercase: true, maxWords: 3, maxCharacters: 25, paddingX: 24, paddingY: 19, gap: .32 },
  scribble: { font: FONT.caveat, size: 67, weight: 600, uppercase: false, maxWords: 4, maxCharacters: 28, paddingX: 20, paddingY: 24, gap: .16 },
  "golden-aura": { font: FONT.bold, size: 54, weight: 700, uppercase: true, maxWords: 3, maxCharacters: 25, paddingX: 18, paddingY: 18, gap: .28 },
  filler: { font: FONT.gorva, size: 51, weight: 400, uppercase: false, maxWords: 4, maxCharacters: 31, paddingX: 24, paddingY: 15, gap: .24 },
  "sunday-script": { font: FONT.becomes, size: 58, weight: 400, uppercase: false, maxWords: 6, maxCharacters: 37, paddingX: 12, paddingY: 10, gap: .2 },
};
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
const pendingFonts = new Map<string, Promise<void>>();
const loadFont = (font: Font) => {
  const key = `${font.family}-${font.weight}`;
  const cached = pendingFonts.get(key); if (cached) return cached;
  const promise = (async () => {
    const face = new FontFace(font.family, `url(${JSON.stringify(asset(font.path))})`, { weight: font.weight });
    document.fonts.add(await face.load());
  })();
  pendingFonts.set(key, promise);
  void promise.catch(() => pendingFonts.delete(key));
  return promise;
};
export const loadStyleFonts = async (styleId: ClucapStyleId) => {
  await Promise.all([loadFont(STYLE[styleId].font), loadFont(FONT.hindi),
    ...(styleId === "filler" ? [loadFont(FONT.koch)] : []),
    ...(styleId === "scribble" ? [loadFont(FONT.caveatBold)] : []),
    ...(styleId === "sunday-script" ? [loadFont(FONT.coolvetica)] : [])]);
};
const stop = new Set("a an the and or but of for from in on at as to with by is am are was were be been being this that these those it its i my me we our they their he his she her you your can could would should will do does did have has had so now then just really very एक यह वह और या तो को का की के में पर से है हैं मैं तुम आप हम भी ही जो कि नहीं".split(" "));
const score = (word: Word) => word.event ? -100 : (word.emphasis ? 100 : 0) +
  (stop.has(word.text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}']/gu, "")) ? -20 : 0) + Math.min(14, word.text.length) +
  Math.min(3, (word.endMs - word.startMs) / 200);
type Cue = Pick<ClucapLayout, "id" | "words" | "startMs" | "endMs" | "accentWordId">;
export const compileClucap = (source: CaptionSource, styleId: ClucapStyleId): Cue[] => {
  const spec = STYLE[styleId]; const { words } = normalizeWords(source);
  const groups: Word[][] = []; let group: Word[] = []; let lastScriptSolo = -Infinity;
  const scriptHeroes = new Set(["dreams", "believe", "courage", "impossible", "success", "purpose", "freedom", "extraordinary"]);
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const word = words[wordIndex];
    const cleanWord = word.text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
    const solo = styleId === "sunday-script" && !word.event && (word.emphasis || scriptHeroes.has(cleanWord)) &&
      word.endMs - word.startMs >= 360 && word.startMs - lastScriptSolo >= 5200 &&
      (!words[wordIndex - 1] || word.startMs > words[wordIndex - 1].startMs) &&
      (!words[wordIndex + 1] || words[wordIndex + 1].startMs > word.startMs);
    if (solo) { flush(); groups.push([word]); lastScriptSolo = word.startMs; continue; }
    const previous = group[group.length - 1];
    if (previous && word.startMs > previous.startMs && (previous.pageBreakAfter || previous.speaker !== word.speaker ||
      previous.event !== word.event || /[.!?।॥]["'”’)]?$/u.test(previous.text) || word.startMs - previous.endMs > 340 ||
      wordCount(group) >= spec.maxWords || textLength([...group, word].map(w => w.text).join(" ")) > spec.maxCharacters ||
      word.endMs - group[0].startMs > 2400)) flush();
    group.push(word);
  }
  flush();
  return groups.map((entries, i) => {
    const candidate = [...entries].sort((a, b) => score(b) - score(a))[0];
    return { id: `clucap-${entries[0].id}`, words: entries, startMs: entries[0].startMs,
      endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 240, groups[i + 1]?.[0].startMs ?? Infinity),
      accentWordId: candidate && score(candidate) >= 5 ? candidate.id : undefined };
  });
};
const numeric = (value: number | undefined, fallback: number, min: number, max: number) =>
  clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
export const layoutClucap = (cues: Cue[], styleId: ClucapStyleId, config: ClucapConfig,
  canvasHeight: number, ctx: CanvasRenderingContext2D): ClucapLayout[] => {
  if (styleId === "sunday-script") return layoutSundayScript(cues, config, canvasHeight, ctx);
  const spec = STYLE[styleId];
  const capacity = 720 * numeric(config.maxWidth, .84, .5, .9);
  const position = numeric(config.positionY, .73, .2, .82);
  const output: ClucapLayout[] = [];
  const fit = (cue: Cue) => {
    const mark = styleId === "scribble" ? scribbleMark(cue) : undefined;
    const measure = (base: number) => {
      const wordMetrics = (entries: Word[]) => entries.map(word => {
        const accent = word.id === cue.accentWordId;
        const emphasized = styleId === "filler" && !word.event && (accent || word.emphasis);
        const useKoch = emphasized && !/[\u0900-\u097f]/u.test(word.text);
        let size = base * (styleId === "scribble" && accent ? 1.1 : 1);
        const selectedFont = useKoch ? FONT.koch : spec.font;
        // A font picked for the words replaces the design's; Hindi keeps its own face.
        const pick = !useKoch ? config.picked?.rest : undefined;
        const family = pick?.family ?? selectedFont.family;
        const weight = pick?.weight ?? (styleId === "scribble" && accent ? 700 : spec.weight);
        const italic = pick?.italic === true;
        const text = spec.uppercase ? word.text.toUpperCase() : word.text;
        const tracking = 0;
        if (useKoch) {
          // Match visible cap height rather than making the contrasting face tiny.
          ctx.font = `400 ${base}px "${spec.font.family}"`; ctx.letterSpacing = "0px";
          const regularHeight = ctx.measureText("Hx").actualBoundingBoxAscent;
          ctx.font = `400 ${base}px "${FONT.koch.family}"`;
          const accentHeight = ctx.measureText("Hx").actualBoundingBoxAscent;
          size = base * clamp(regularHeight / Math.max(1, accentHeight), .92, 1.2) * 1.025;
        }
        ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${family}"`; ctx.letterSpacing = `${tracking}px`;
        const metric = ctx.measureText(text);
        const left = Number.isFinite(metric.actualBoundingBoxLeft) ? metric.actualBoundingBoxLeft : 0;
        const right = Number.isFinite(metric.actualBoundingBoxRight) ? metric.actualBoundingBoxRight : metric.width;
        const inkWidth = styleId === "scribble" || styleId === "redline-word-box"
          ? Math.max(size * .02, left + right) : Math.max(metric.width, left + right);
        // Reserve the spoken word's maximum pop size without reflowing its neighbors.
        const popPadding = styleId === "purple-voice-blink" ? inkWidth * .028 : 0;
        const weightPadding = emphasized ? .35 : 0;
        const verticalPadding = (styleId === "purple-voice-blink" ? size * .028 : 0) + weightPadding;
        const ascent = (Number.isFinite(metric.actualBoundingBoxAscent) ? metric.actualBoundingBoxAscent : size * .8) + verticalPadding;
        const descent = (Number.isFinite(metric.actualBoundingBoxDescent) ? metric.actualBoundingBoxDescent : size * .2) + verticalPadding;
        const decoration = styleId === "scribble" && accent && mark?.kind !== "none" ?
          scribblePadding(inkWidth, ascent, descent, size, mark?.kind === "circle") : { x: 0, y: 0 };
        return { word, text, size, family, weight, italic, tracking, inkLeft: left + popPadding + weightPadding,
          width: inkWidth + popPadding * 2 + weightPadding * 2, emphasized,
          ascent, descent, sideRoom: decoration.x ? decoration.x + 2 : 0, verticalRoom: decoration.y ? decoration.y + 2 : 0 };
      });
      const gap = base * spec.gap;
      const lineWidth = (line: ReturnType<typeof wordMetrics>) => line.reduce((sum, item) => sum + item.width + item.sideRoom * 2, 0) + Math.max(0, line.length - 1) * gap;
      const all = wordMetrics(cue.words); const lines: ReturnType<typeof wordMetrics>[] = [[]]; let used = 0;
      all.forEach(item => {
        const outerWidth = item.width + item.sideRoom * 2;
        if (used && used + gap + outerWidth > capacity - spec.paddingX * 2) { lines.push([]); used = 0; }
        const line = lines[lines.length - 1]; line.push(item); used += outerWidth + (line.length > 1 ? gap : 0);
      });
      const widths = lines.map(lineWidth);
      const metrics = lines.map(line => ({ a: Math.max(...line.map(item => item.ascent + item.verticalRoom)),
        d: Math.max(...line.map(item => item.descent + item.verticalRoom)) }));
      // Leave clear space between the highlighted ink boxes on separate rows.
      const lineGap = base * (styleId === "redline-word-box" ? .46 : .3);
      const textHeight = metrics.reduce((sum, m) => sum + m.a + m.d, 0) + Math.max(0, lines.length - 1) * lineGap;
      const boxHeight = textHeight + spec.paddingY * 2;
      const y = clamp(canvasHeight * position - boxHeight / 2, canvasHeight * .12,
        Math.max(canvasHeight * .12, canvasHeight * .85 - boxHeight));
      let top = y + spec.paddingY; const items: ClucapWord[] = [];
      let minX = Infinity; let maxX = -Infinity;
      lines.forEach((line, i) => {
        let x = (720 - widths[i]) / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x + widths[i]);
        const baseline = top + metrics[i].a;
        line.forEach(item => {
          // x is the visible left edge. SVG text uses the measured ink bearing.
          items.push({ word: item.word, text: item.text, x: x + item.sideRoom, baseline, width: item.width, size: item.size,
            ascent: item.ascent, descent: item.descent, family: item.family, weight: item.weight, line: i, tracking: item.tracking,
            inkOffset: item.inkLeft, emphasized: item.emphasized });
          x += item.width + item.sideRoom * 2 + gap;
        });
        top += metrics[i].a + metrics[i].d + lineGap;
      });
      const box = { x: minX - spec.paddingX, y, width: maxX - minX + spec.paddingX * 2, height: boxHeight };
      return { items, box, fits: lines.length <= 2 && box.width <= capacity && box.height < canvasHeight * .48 };
    };
    const initial = numeric(config.fontSize, spec.size, 28, 110);
    let size = initial; let measured = measure(size);
    const minimum = initial * .7;
    if (!measured.fits && !measure(minimum).fits && cue.words.length > 1) {
      const splitAt = cue.words.map((word, i) => i > 0 && word.startMs > cue.words[i - 1].startMs ? i : -1)
        .filter(i => i > 0).sort((a, b) => Math.abs(a - cue.words.length / 2) - Math.abs(b - cue.words.length / 2))[0];
      if (splitAt !== undefined) {
        const boundary = cue.words[splitAt].startMs;
        const slice = (entries: Word[], endMs: number): Cue => ({ ...cue, id: `${cue.id}-${entries[0].id}`, words: entries,
          startMs: entries[0].startMs, endMs, accentWordId: entries.some(word => word.id === cue.accentWordId) ? cue.accentWordId : undefined });
        fit(slice(cue.words.slice(0, splitAt), boundary)); fit(slice(cue.words.slice(splitAt), cue.endMs)); return;
      }
    }
    while (!measured.fits && size > 5) { size -= 1; measured = measure(size); }
    output.push({ ...cue, items: measured.items, box: measured.box });
  };
  cues.forEach(fit); return output;
};
