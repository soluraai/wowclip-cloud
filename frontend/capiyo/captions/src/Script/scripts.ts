/**
 * Writing systems captions can be shown in, besides Latin. Every template gets these through one shared
 * layer (ScriptFonts): when the words hold one of these scripts, each font the template uses is paired with
 * a Noto face for that script, so a Hindi word in "Montserrat" is drawn in Noto Sans Devanagari at the same
 * weight while English letters keep Montserrat. Fonts live in captions/public/script-fonts (OFL).
 */
export type ScriptId = "deva" | "beng" | "guru" | "gujr" | "orya" | "taml" | "telu" | "knda" | "mlym" | "arab" | "sinh" | "thai";

/**
 * What a template's font is there for, read from its name and shape. A Hindi word in a cursive helper line
 * should look cursive too, so each script can hold a face per role (Devanagari has the full set).
 */
export type FontRole = "sans" | "display" | "serif" | "serifBold" | "script" | "brush" | "hand" | "condensed" | "pixel";
export type RoleFace = { file: string; weight: number; italic?: boolean };

export type ScriptInfo = {
  id: ScriptId;
  /** Faces matched to a template font's role. Roles without one use `serif` or `sans`. */
  roles?: Partial<Record<FontRole, RoleFace[]>>;
  name: string;
  /** Characters of the script, for finding it in text. */
  test: RegExp;
  /** CSS unicode-range of the paired faces. Danda and the joiners are shared by the Indic scripts. */
  range: string;
  sans: string;
  serif?: string;
  /** Google Fonts' name for the script, for listing fonts that draw it. */
  subset: string;
  /** A few common letters, measured to find out whether a font already draws this script. */
  sample: string;
  /** A headline (shirorekha) runs along the top of the letters, so spacing letters apart breaks it. */
  headline?: boolean;
  /** Weight from which a medium/bold template sans takes the script's display face (thin Noto looked weak). */
  boldFrom?: number;
  rtl?: boolean;
};

const INDIC_SHARED = "U+0964-0965, U+200C-200D, U+25CC";
const file = (name: string) => `script-fonts/${name}.woff2`;
/** "beng-display", 700 → script-fonts/beng-display-700.woff2. A suffix ("i") names an italic file used upright. */
const face = (name: string, weight: number, suffix = ""): RoleFace => ({ file: file(`${name}-${weight}${suffix}`), weight });
const weights = (name: string, ...list: number[]) => list.map((weight) => face(name, weight));
/** A serif and its italic, both 400 (Tiro's faces). */
const serifs = (id: string): RoleFace[] => [face(`${id}-serif`, 400), { ...face(`${id}-serif`, 400, "i"), italic: true }];

export const SCRIPTS: ScriptInfo[] = [
  { id: "deva", subset: "devanagari", sample: "\u0915\u092e\u0932\u093f\u0928", name: "Devanagari", test: /[ऀ-ॿ꣠-ꣿ]/u, range: `U+0900-097F, U+A8E0-A8FF, U+1CD0-1CFF, ${INDIC_SHARED}`,
    sans: file("sans-deva"), serif: file("serif-deva"), headline: true,
    roles: {
      // Poppins: geometric heavy sans, made with a Devanagari of its own.
      display: [500, 700, 900].map((weight) => ({ file: file(`deva-display-${weight}`), weight })),
      // Tillana: handwritten calligraphy, for elegant script fonts (Great Vibes, Pinyon).
      script: [400, 700].map((weight) => ({ file: file(`deva-script-${weight}`), weight })),
      // Yatra One: brush lettering, for Kaushan, Yellowtail, Pacifico.
      brush: [{ file: file("deva-brush-400"), weight: 400 }],
      // Kalam: handwriting, for Caveat and notes fonts.
      hand: [400, 700].map((weight) => ({ file: file(`deva-hand-${weight}`), weight })),
      // Tiro Devanagari Hindi (with an italic), for light and italic serifs; Rozha One for heavy display serifs.
      serif: [{ file: file("deva-serif-400"), weight: 400 }, { file: file("deva-serif-400i"), weight: 400, italic: true }],
      serifBold: [{ file: file("deva-serifbold-400"), weight: 400 }],
      // Teko: tall condensed, for Anton and Bebas.
      condensed: [500, 700].map((weight) => ({ file: file(`deva-condensed-${weight}`), weight })),
      // Sarpanch: square letters, for pixel fonts.
      pixel: [{ file: file("deva-pixel-700"), weight: 700 }],
    } },
  { id: "beng", boldFrom: 500, subset: "bengali", sample: "কমলিন", name: "Bengali", test: /[ঀ-৿]/u, range: `U+0980-09FF, ${INDIC_SHARED}`, sans: file("sans-beng"), serif: file("serif-beng"), headline: true,
    // Galada script, Atma hand, Baloo Da 2 display, Tiro Bangla serif, Noto Serif Bengali heavy, Anek Bangla condensed.
    roles: { script: [face("beng-script", 400)], hand: [face("beng-hand", 500)], display: weights("beng-display", 500, 700, 800),
      serif: serifs("beng"), serifBold: [face("beng-serifbold", 800)], condensed: weights("beng-condensed", 500, 700) } },
  { id: "guru", boldFrom: 500, subset: "gurmukhi", sample: "ਕਮਲਿਨ", name: "Gurmukhi", test: /[਀-੿]/u, range: `U+0A00-0A7F, ${INDIC_SHARED}`, sans: file("sans-guru"), headline: true,
    // No cursive Gurmukhi exists: a cursive line gets Tiro Gurmukhi's italic, the most written-looking face.
    roles: { script: [face("guru-serif", 400, "i")], display: weights("guru-display", 500, 700, 800), serif: serifs("guru"),
      serifBold: [face("guru-serifbold", 800)], condensed: weights("guru-condensed", 500, 700) } },
  { id: "gujr", boldFrom: 500, subset: "gujarati", sample: "કમલિન", name: "Gujarati", test: /[઀-૿]/u, range: `U+0A80-0AFF, ${INDIC_SHARED}`, sans: file("sans-gujr"),
    // Shrikhand brush, Farsan hand, Baloo Bhai 2 display, Noto Serif Gujarati heavy, Anek Gujarati condensed.
    roles: { script: [face("gujr-script", 400)], brush: [face("gujr-brush", 400)], hand: [face("gujr-hand", 400)], display: weights("gujr-display", 500, 700, 800),
      serif: [face("gujr-serif", 400)], serifBold: [face("gujr-serifbold", 800)], condensed: weights("gujr-condensed", 500, 700) } },
  { id: "orya", boldFrom: 500, subset: "oriya", sample: "କମଲିନ", name: "Odia", test: /[଀-୿]/u, range: `U+0B00-0B7F, ${INDIC_SHARED}`, sans: file("sans-orya"), serif: file("orya-serif-400"),
    // Few Odia faces exist: Baloo Bhaina 2 display, Noto Serif Oriya, Anek Odia condensed.
    roles: { display: weights("orya-display", 500, 700, 800), serifBold: [face("orya-serifbold", 700)], condensed: weights("orya-condensed", 500, 700) } },
  { id: "taml", boldFrom: 500, subset: "tamil", sample: "கமலிந", name: "Tamil", test: /[஀-௿]/u, range: `U+0B80-0BFF, ${INDIC_SHARED}`, sans: file("sans-taml"), serif: file("serif-taml"),
    // Kavivanar cursive, Baloo Thambi 2 display, Tiro Tamil serif, Noto Serif Tamil heavy, Anek Tamil condensed.
    roles: { script: [face("taml-script", 400)], hand: [face("taml-hand", 400)], display: weights("taml-display", 500, 700, 800),
      serif: serifs("taml"), serifBold: [face("taml-serifbold", 800)], condensed: weights("taml-condensed", 500, 700) } },
  { id: "telu", boldFrom: 500, subset: "telugu", sample: "కమలిన", name: "Telugu", test: /[ఀ-౿]/u, range: `U+0C00-0C7F, ${INDIC_SHARED}`, sans: file("sans-telu"),
    // Akaya Telivigala brush, Baloo Tammudu 2 display, Tiro Telugu serif, Noto Serif Telugu heavy, Anek Telugu condensed.
    roles: { script: [face("telu-script", 400)], brush: [face("telu-brush", 400)], hand: [face("telu-hand", 400)], display: weights("telu-display", 500, 700, 800),
      serif: serifs("telu"), serifBold: [face("telu-serifbold", 800)], condensed: weights("telu-condensed", 500, 700) } },
  { id: "knda", boldFrom: 500, subset: "kannada", sample: "ಕಮಲಿನ", name: "Kannada", test: /[ಀ-೿]/u, range: `U+0C80-0CFF, ${INDIC_SHARED}`, sans: file("sans-knda"),
    // No cursive Kannada exists: a cursive line gets Tiro Kannada's italic; Akaya Kanadaka is the hand-drawn face.
    roles: { script: [face("knda-serif", 400, "i")], hand: [face("knda-hand", 400)], display: weights("knda-display", 500, 700, 800),
      serif: serifs("knda"), serifBold: [face("knda-serifbold", 800)], condensed: weights("knda-condensed", 500, 700) } },
  { id: "mlym", boldFrom: 500, subset: "malayalam", sample: "കമലിന", name: "Malayalam", test: /[ഀ-ൿ]/u, range: `U+0D00-0D7F, ${INDIC_SHARED}`, sans: file("sans-mlym"), serif: file("mlym-serif-400"),
    // Chilanka hand, Baloo Chettan 2 display, Noto Serif Malayalam, Anek Malayalam condensed.
    roles: { hand: [face("mlym-hand", 400)], display: weights("mlym-display", 500, 700, 800), serifBold: [face("mlym-serifbold", 800)], condensed: weights("mlym-condensed", 500, 700) } },
  { id: "arab", subset: "arabic", sample: "بملنس", name: "Arabic", test: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/u,
    range: "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F", sans: file("sans-arab"), rtl: true,
    roles: { script: [face("arab-script", 400)], hand: [face("arab-hand", 400)], display: [face("arab-display", 400), face("arab-display", 800)],
      serif: [face("arab-serif", 400)], serifBold: [face("arab-serifbold", 700)] } },
  { id: "sinh", subset: "sinhala", sample: "කමලින", name: "Sinhala", test: /[඀-෿]/u, range: "U+0D80-0DFF, U+200C-200D", sans: file("sans-sinh"), serif: file("sinh-serif-400"),
    roles: { display: [face("sinh-display", 700)], serifBold: [face("sinh-serifbold", 800)] } },
  { id: "thai", subset: "thai", sample: "กมลนส", name: "Thai", test: /[฀-๿]/u, range: "U+0E00-0E7F", sans: file("sans-thai"),
    // Kanit display, Charm script, Pattaya brush, Sriracha hand, Taviraj serif, Chonburi heavy serif, Chakra Petch square.
    roles: { display: weights("thai-display", 500, 700, 900), script: weights("thai-script", 400, 700), brush: [face("thai-brush", 400)], hand: [face("thai-hand", 400)],
      serif: serifs("thai"), serifBold: [face("thai-serifbold", 400)], pixel: [face("thai-pixel", 700)] } },
];

/** The scripts (other than Latin) that appear in this text, in table order. */
export const scriptsIn = (text: string): ScriptInfo[] => SCRIPTS.filter((script) => script.test.test(text));

/**
 * Line height for a word in a joined script, from ink measured with the context's current font. Vowel signs
 * above the headline (ि ी े ं) and below the letters (ु ू ्र) are thin: lines set on their full ink sit far
 * apart. Like printed Hindi, the signs hang partly into the gap, so the lines sit as close as English ones.
 * Latin text returns its ink unchanged.
 */
export function compactInk(ctx: CanvasRenderingContext2D, text: string, ascent: number, descent: number) {
  const script = isComplexScript(text) ? scriptsIn(text)[0] : undefined;
  if (!script) return { ascent, descent };
  const base = ctx.measureText(script.sample.slice(0, 1));
  const top = base.actualBoundingBoxAscent, bottom = Math.max(0, base.actualBoundingBoxDescent);
  if (!(top > 0)) return { ascent, descent };
  return { ascent: Math.min(ascent, top + Math.max(0, ascent - top) * .35), descent: Math.min(descent, bottom + Math.max(0, descent - bottom) * .35) };
}

/** True when the text holds letters that are not Latin, Greek or Cyrillic (no capitals, joined letters). */
export const isComplexScript = (text: string) => SCRIPTS.some((script) => script.test.test(text)) ||
  /[぀-ヿ㐀-鿿가-힯]/u.test(text);

/**
 * The pieces a word can be animated in, one by one. Latin words split into letters (keeping accents and
 * emoji whole); in Indian and other joined scripts a vowel sign or a conjunct split from its letter is
 * drawn broken, so those words move as one piece.
 */
export const letterPieces = (text: string): string[] => {
  if (isComplexScript(text)) return text ? [text] : [];
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment) : [...text];
};

/** Family names that read as serif, so they are paired with a serif face where one exists. */
export const looksSerif = (family: string) =>
  /serif|playfair|georgia|gelasio|lora|merriweather|cormorant|baskerville|garamond|fraunces|bodoni|didot|dm serif|instrument serif|crimson|times|libre caslon|prata|abril|cinzel|marcellus|tiro/i.test(family) &&
  !/sans/i.test(family);

/** Font names that tell a template font's role. Checked in order; the first match wins. */
const NAMED_ROLES: [RegExp, FontRole][] = [
  [/pixel|press start|vt323|silkscreen|\bvp\b/i, "pixel"],
  [/kaushan|yellowtail|pacifico|lobster|satisfy|brush|redressed|marker/i, "brush"],
  [/vibes|allura|pinyon|parisienne|sacramento|dancing|script|signature|cursive|tangerine|cookie/i, "script"],
  [/caveat|kalam|becomes|indie|patrick|gochi|handwrit|shadows|architect|permanent/i, "hand"],
  [/anton|bebas|oswald|league gothic|teko|condensed|narrow|fjalla|six caps/i, "condensed"],
];

/**
 * The role of a template font: by name first, then by shape (narrow letters read as condensed), then by
 * weight (heavy sans is display type). `averageWidth` is the mean advance of a-z in em.
 */
export function fontRole(family: string, weight: number, averageWidth: number): FontRole {
  const named = NAMED_ROLES.find(([pattern]) => pattern.test(family))?.[1];
  if (named) return named;
  if (looksSerif(family) || /koch|gorva|newsreader/i.test(family)) return weight >= 600 ? "serifBold" : "serif";
  if (averageWidth > 0 && averageWidth < 0.47) return "condensed";
  return weight >= 650 ? "display" : "sans";
}

/** The face a script uses for a role and weight: the role's own faces, else the serif or sans face. */
export function roleFace(script: ScriptInfo, role: FontRole, weight: number, italic: boolean): RoleFace {
  // A written line (cursive, brush, hand) in a script with no such face reads better in its serif than in plain sans.
  const fallback = ["serif", "serifBold", "script", "brush", "hand"].includes(role) ? script.serif ?? script.sans : script.sans;
  // Lettered roles stand in for each other: a script with only a brush face still gives a cursive line a written one.
  // Square and condensed type borrow the heavy display face rather than thin sans.
  const near: FontRole[] = role === "serifBold" ? ["serif"] : role === "script" ? ["brush", "hand", "serif"]
    : role === "brush" ? ["script", "hand"] : role === "hand" ? ["brush", "script"]
    : role === "condensed" ? ["display"] : role === "pixel" ? ["condensed", "display"] : [];
  const faces = [role, ...near].map((each) => script.roles?.[each]).find((list) => list?.length);
  if (!faces?.length) return { file: fallback, weight };
  const styled = faces.filter((face) => !!face.italic === italic);
  const pool = styled.length ? styled : faces;
  return pool.reduce((best, face) => Math.abs(face.weight - weight) < Math.abs(best.weight - weight) ? face : best);
}

/**
 * How many words a caption holds, for caption length limits. Joined scripts write their helper words in one or
 * two clusters (को, की, है, से), so those count half: a Hindi line of five words holds far less than an English one.
 * Latin words always count one each, so English captions split exactly as before.
 */
export function wordCount(words: readonly { text: string }[]) {
  return words.reduce((sum, word) => sum + (isComplexScript(word.text) && textLength(word.text) <= 3.4 ? 0.5 : 1), 0);
}

/**
 * How long a text reads, in Latin letters. Joined scripts pack a letter, its vowel signs and conjuncts into
 * one cluster that is about as wide as two Latin letters ("दिनों" is two clusters, five code points), so
 * splitting captions by code points makes Hindi lines far shorter than English ones.
 */
export function textLength(text: string) {
  if (!isComplexScript(text)) return text.length;
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (!Segmenter) return text.length * 0.8;
  let length = 0;
  for (const { segment } of new Segmenter(undefined, { granularity: "grapheme" }).segment(text)) length += /\s/.test(segment) ? 1 : isComplexScript(segment) ? 1.7 : 1;
  return length;
}
