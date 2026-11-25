import { captionStyle } from "./styleCatalog";
import { isSignatureStyleId } from "../../../captions/src/Basic/catalog";
import type { CaptionSettings, EmphasisSettings, PartId } from "./captionSettings";
import type { MotionUnit } from "../../../captions/src/BasicCaption/motion";
import type { RevealMode } from "../../../captions/src/Standard/reveal";

/**
 * What the right-hand panel offers for each style. One standard everywhere:
 *
 *  - Text color: normal words.
 *  - Accent:     a part of the style that has nothing to do with key words (sentence dot,
 *                active-word box, sweep, side bar). Styles without one have no Accent section.
 *  - Emphasis:   everything about key words. If the style draws something on the key word
 *                (circle, marker, cursive, sticker), its colors live here, not in Accent.
 *  - Design:     stroke, shadow and glow on every word. Styles with drawn looks keep it fixed.
 *
 * A control only exists when it changes that style. A style's core mechanic is never
 * exposed as a control: the circle in Circle Callout can be recolored, not moved.
 */
export type AccentSpec = {
  label: string;
  /** Which highlight field the style reads: text color or the fill/plate/accent color. */
  field: "color" | "backgroundColor";
  /** Second color (e.g. text color on the Highlight Box). */
  secondary?: { label: string; field: "color" | "backgroundColor" };
  /** When set, the accent can be switched off from the top of the panel under this name. */
  toggle?: string;
  /** The accent can be a gradient; "scoped" also offers each word or the whole line. */
  gradient?: "plain" | "scoped";
};

export type StyleFeature = { id: string; label: string };

/** One text part a Premium style opens up. What is left out stays the design's. */
export type PartSpec = {
  id: PartId;
  label: string;
  /** The design's own face, shown until one is picked. Missing when this part's font is fixed. */
  font?: { family: string; weight: number; italic?: boolean };
  /** The design's own color, shown until one is picked. Missing when this part's color is fixed. */
  color?: string;
  /** This part can be painted with a gradient. */
  gradient?: boolean;
};

export type StyleCapabilities = {
  accent: AccentSpec | null;
  /** overlay: key words are recolored on top of the design. hero: the style is built around them. */
  emphasis: "overlay" | "hero" | "none";
  emphasisToggle: boolean;
  /** Label of the key word's own color; empty when the style paints it itself. */
  emphasisWord?: string;
  /** Label of the shape drawn on the key word (marker, ring, sticker, glow). */
  emphasisShape?: string;
  /** One key word can have a different color from the rest. */
  emphasisWordColor: boolean;
  /** The renderer can paint key words with a gradient. */
  emphasisGradient?: boolean;
  /** Emphasis can be drawn as colored text or a filled box. */
  emphasisModes: boolean;
  emphasisSize: boolean;
  /** Key words use a script font the user can choose. */
  emphasisFonts: boolean;
  /** [min, max] words per caption; null when the style lays out its own lines. */
  words: [number, number] | null;
  /** The font can be changed; otherwise only its size can. */
  fontFamily: boolean;
  /** Caption motion can be picked. */
  motion: boolean;
  /** Reveals offered besides word by word; missing when the design depends on the spoken word. */
  reveal?: RevealMode[];
  letterSpacing: boolean;
  lineSpacing: boolean;
  wordSpacing: boolean;
  width: boolean;
  textCase: boolean;
  textColor: boolean;
  gradient: boolean;
  positionX: boolean;
  /** The narrowest box this style can still lay out; the side dots stop there. */
  minWidth?: number;
  /** Layout extras: left/right alignment, tilt, line cap. */
  alignment: boolean;
  rotation: boolean;
  maxLines: boolean;
  /** Stroke, shadow, glow, 3D depth, opacity and blend. */
  effects: boolean;
  /** Shadow, glow, opacity and blend on the whole caption, for styles that draw their own words. */
  layerEffects?: boolean;
  /** A single word or line can have its own font, size and color. */
  wordFormat: boolean;
  /** False when a word can't change size without breaking the style's layout. */
  wordSize?: boolean;
  features: StyleFeature[];
  /** What can animate on its own in this style. */
  motionUnits: MotionUnit[];
  /** False when key words can't have an entrance of their own. */
  keyMotion?: boolean;
  /** Motion follows Word, Line or Chunk in Show, and each word can be posed on its own. */
  wordMotion?: boolean;
  /** A selected word can take a color, though the caption's text color may be fixed. */
  wordColor?: boolean;
  /** Premium text parts, each with its own font and color. */
  parts?: PartSpec[];
  /** A Size section with an overall size and one for each of these parts. */
  sizes?: { id: PartId; label: string }[];
  /** False when a selected word can't take a size of its own. */
  wordSizing?: boolean;
  /** False when the style picks its own key words, so there is nothing to choose. */
  emphasisPanel?: boolean;
  /** Motion is chosen for the main word and the helper text apart. */
  partMotion?: boolean;
  /** Names of those two tabs when "Helper text" and "Main word" don't describe the style: [rest, main]. */
  motionLabels?: [string, string];
  /** Font Size stays next to the part sizes, for styles whose whole caption scales. */
  overallSize?: boolean;
  /** The main word moves as part of the design, so it takes no motion of its own. */
  fixedHero?: boolean;
  /**
   * How Font, Size, Color and Motion are split for the whole caption.
   *  key:   one switch over the panel picks All text or Key words, and those sections follow it.
   *  lines: no key words; each part (top line, bottom line...) keeps its own row in each section.
   */
  target?: "key" | "lines";
  /** Kinds of text the shared layer paints, for a style that doesn't read those colors itself. */
  paintWords?: ("main" | "rest")[];
  /** A font for key words alone can be picked (Basic: drawn through each key word's own font). */
  keyFont?: boolean;
  /** Key words take Design effects of their own. */
  keyDesign?: boolean;
  /** Key words take a letter spacing of their own. */
  keySpacing?: boolean;
  /** The shape drawn on the key word (marker, ring) can be a gradient. */
  emphasisShapeGradient?: boolean;
  /** Each kind of text (lines, script, plain lines) takes Design of its own. */
  partDesign?: boolean;
  /** The style draws a box around its key word, with every part of it to pick (Focus Frame). */
  box?: boolean;
  /** Its kinds of text are the whole design: each section lists every part, with no key word switch. */
  partTabs?: boolean;
  /** Each kind of text takes its own text case (Fonts) and word spacing (Spacing). */
  partText?: boolean;
};

const KEY_WORD = "Key word color";

const full: StyleCapabilities = {
  accent: null, emphasis: "overlay", emphasisToggle: true, emphasisWord: KEY_WORD,
  emphasisWordColor: true, emphasisModes: true, emphasisSize: true, emphasisFonts: false,
  words: [1, 10], letterSpacing: true, lineSpacing: true, wordSpacing: true, width: true, textCase: true,
  textColor: true, gradient: true, positionX: true, alignment: true, rotation: true, maxLines: true,
  effects: true, wordFormat: true, features: [], motionUnits: ["caption", "word", "line"],
  fontFamily: true, motion: true,
};

/** Signature layouts draw every word themselves. */
const signature: Partial<StyleCapabilities> = {
  emphasisModes: false, emphasisWordColor: false,
  lineSpacing: false, wordSpacing: false, alignment: false, maxLines: false,
  effects: false, layerEffects: true,
};
/** Built around the key word, so emphasis can't be off. */
const hero: Partial<StyleCapabilities> = { ...signature, emphasis: "hero", emphasisToggle: false };
/** Every signature look takes the same controls now; kept as a name for the few that stay locked. */
const complex: Partial<StyleCapabilities> = {};

const SPECIFIC: Record<string, Partial<StyleCapabilities>> = {
  "clean-subtitles": { words: [1, 12] },
  "captions-dot": {
    accent: { label: "Symbol color", field: "color", toggle: "Colored symbols" },
    words: [1, 8], emphasisModes: false, alignment: false, maxLines: false,
  },
  "highlight-box": {
    accent: {
      label: "Box color", field: "backgroundColor",
      secondary: { label: "Word on box", field: "color" }, toggle: "Active word box",
    },
    emphasis: "none",
    words: [1, 5],
  },
  "hormozi-pop": {
    accent: { label: "Active word color", field: "color", toggle: "Active word pop" },
    emphasis: "none",
    words: [1, 8],
  },
  "creator-emoji": {
    emphasis: "hero", emphasisModes: false, words: [1, 5],
    effects: false, layerEffects: true,
    features: [{ id: "emoji", label: "Emoji stickers" }],
  },
  "style-two": {
    emphasis: "hero", emphasisToggle: false, emphasisWord: "Cursive word color",
    emphasisWordColor: false, emphasisModes: false, emphasisFonts: true, words: [2, 6],
    letterSpacing: false, lineSpacing: false, gradient: false, alignment: false, rotation: false, maxLines: false,
    effects: false, layerEffects: true, wordSize: false,
    features: [{ id: "glow", label: "Cursive word glow" }],
  },
  "yellow-block": { accent: { label: "Block color", field: "backgroundColor" }, words: [2, 8] },
  "contrast-box": { accent: { label: "Block color", field: "backgroundColor" }, words: [2, 10] },
  "karaoke-sweep": {
    accent: { label: "Sweep color", field: "color", toggle: "Karaoke sweep" },
    emphasis: "none",
    words: [2, 10],
  },
  "meme-outline": { words: [1, 8] },
  "underline-focus": {
    accent: { label: "Underline color", field: "color", toggle: "Active underline" },
    emphasis: "none",
    words: [2, 10],
  },
  "minimal-glow": {
    accent: { label: "Glow color", field: "color", toggle: "Spoken word glow" },
    emphasis: "none",
    words: [2, 10],
  },
  "marker-swipe": { ...hero, ...complex, emphasisShape: "Marker color", emphasisWord: "Word on marker", emphasisShapeGradient: true, words: [2, 6] },
  "circle-callout": { ...hero, ...complex, emphasisShape: "Circle color", emphasisShapeGradient: true, words: [2, 6] },
  // Stickers are the whole design: only font, size, position and words per caption stay.
  "sticker-words": { ...signature, emphasis: "none", words: [2, 6], textColor: false, textCase: false, gradient: false,
    letterSpacing: false, rotation: false, layerEffects: false },
  "outline-hero": { ...hero, ...complex, emphasisShape: "Outline glow", emphasisWord: undefined, words: [2, 6] },
  "lower-third": { ...hero, accent: { label: "Bar color", field: "backgroundColor" }, words: [3, 6], positionX: false },
  "sport-slant": { ...hero, ...complex, accent: { label: "Stripe color", field: "backgroundColor" }, words: [2, 6] },
  "glitch-split": {
    ...hero, ...complex,
    accent: { label: "Split color 1", field: "color", secondary: { label: "Split color 2", field: "backgroundColor" } },
    words: [1, 5],
  },
  // Both are about timing with speech, so an entrance has nothing to add.
  "lyric-focus": { ...signature, motion: false, emphasis: "none", accent: { label: "Glow color", field: "backgroundColor" }, words: [3, 6] },
  "chat-bubble": { ...signature, accent: { label: "Bubble color", field: "backgroundColor" }, words: [2, 6], textCase: false },
  "terminal-type": { ...signature, motion: false, accent: { label: "Cursor color", field: "backgroundColor" }, words: [2, 6], textCase: false },
  // The gradient already colors every word, so a key word color would have nowhere to show.
  "aurora-gradient": { ...signature, emphasis: "none", accent: { label: "Gradient color", field: "backgroundColor" }, words: [2, 6], textColor: false, gradient: false },
};

/**
 * Standard styles are designed pieces: their fonts, line layouts and word colors are the look.
 * What stays open is what every one of them supports: size, width, position, tilt, motion, a
 * shadow or glow around the caption, and the key word or signature color where the design has one.
 */
const standard: StyleCapabilities = {
  ...full, emphasis: "none", emphasisToggle: false, emphasisWord: undefined, emphasisWordColor: false,
  emphasisModes: false, emphasisSize: false, words: null, fontFamily: false, letterSpacing: false,
  lineSpacing: false, wordSpacing: false, textCase: false, textColor: false, gradient: false,
  alignment: false, maxLines: false, effects: false, wordFormat: false, motionUnits: ["caption"],
  keyMotion: false, sizes: [], overallSize: true,
};
/** Built around a key word in a color of its own. */
const keyWord: Partial<StyleCapabilities> = { emphasis: "hero", emphasisWord: KEY_WORD };
/** Built around a key word, in a look the style draws itself. */
const fixedKeyWord: Partial<StyleCapabilities> = { emphasis: "hero" };
/** Their lettering has no capitals, or nothing but capitals, to switch to. */
const FIXED_CASE = new Set(["becomes-notes", "pixelated-word"]);
/** Two clear rows, so each can arrive on its own. */
const LINES: RevealMode[] = ["line", "chunk"];
const sizes = (rest: [PartId, string], main: [PartId, string], normal = false): StyleCapabilities["sizes"] => [
  { id: main[0], label: main[1] }, { id: rest[0], label: rest[1] }, ...(normal ? [{ id: "plain" as const, label: "Plain lines" }] : []),
];
/** Two kinds of text, each with its own size and entrance. */
const twoParts = (rest: string, main: string, restPart: PartId = "helper", normal = false): Partial<StyleCapabilities> => ({
  sizes: sizes([restPart, rest], ["main", main], normal), partMotion: true, motionLabels: [rest, main],
});
/** One locked shape: its rows aren't lines to read in turn, but it can land at once. */
const WHOLE: RevealMode[] = ["chunk"];
type Face = PartSpec["font"];
const face = (family: string, weight: number, italic?: boolean): Face => ({ family, weight, italic });
/** A text part: its design face (missing when fixed) and color (missing when another control owns it). */
const part = (id: PartId, label: string, font?: Face, color?: string, gradient = true): PartSpec => ({ id, label, font, color, gradient });
const MONTSERRAT = (weight: number) => face("Montserrat", weight);
const INTER = (weight: number) => face("Inter", weight);
const WHITE = "#ffffff";
/** Every word, for a style with one kind of text. */
const oneText = (font?: Face, color = WHITE): Partial<StyleCapabilities> => ({ parts: [part("helper", "Text", font, color)], paintWords: ["rest"] });
const STANDARD: Record<string, Partial<StyleCapabilities>> = {
  // Picks its own headline word, so there is nothing to mark; it keeps Basic signature motion.
  "cinematic-stack": { accent: { label: "Headline color", field: "backgroundColor" }, words: [2, 6], fontFamily: true, textColor: true,
    wordSizing: false, wordMotion: false, keyMotion: false, motionUnits: ["caption", "word", "line"] },
  "reveal-bar": { accent: { label: "Bar color", field: "color" }, ...twoParts("Second line", "First line"), reveal: WHOLE, paintWords: ["main", "rest"],
    parts: [part("main", "First line", MONTSERRAT(800), WHITE), part("helper", "Second line", INTER(450), WHITE)] },
  // The key word's color paints its block; the normal blocks' color paints theirs, and the ink keeps itself readable.
  "block-poster": { ...keyWord, emphasisWord: "Key block color", emphasisGradient: true, ...twoParts("Normal blocks", "Key block"), reveal: WHOLE,
    parts: [part("main", "Key block", face("Anton", 400)), part("helper", "Block color", face("Anton", 400), WHITE)] },
  // Normal words follow the caption font and color; key words take a font of their own.
  "luma-script": { ...keyWord, emphasisGradient: true, gradient: true, ...twoParts("Normal text", "Key word"), fontFamily: true, textColor: true, reveal: LINES,
    parts: [part("main", "Key word", face("Instrument Serif", 400, true))] },
  hind: { ...keyWord, emphasisGradient: true, ...twoParts("Normal text", "Key word"), reveal: LINES, paintWords: ["rest"],
    parts: [part("main", "Key word", face("Playfair Display", 700, true)), part("helper", "Normal text", face("Poppins", 500), WHITE)] },
  // Headline and script each take their own font and color (the headline also a gradient).
  og: { ...fixedKeyWord, ...twoParts("Script", "Headline word", "script", true), emphasisWord: undefined, width: false, reveal: WHOLE, partText: true,
    parts: [part("main", "Headline word", face("Poppins", 900), "#e23131"), part("script", "Script", face("Yellowtail", 400), "#fffdf9", false),
      part("plain", "Normal lines", face("Yellowtail", 400), "#fffdf9", false)] },
  // Four rows of one fixed size: the design holds only together.
  fourfold: { ...keyWord, emphasisGradient: true, reveal: WHOLE, wordSizing: false, paintWords: ["rest"],
    parts: [part("main", "Key rows", MONTSERRAT(700)), part("helper", "Other rows", MONTSERRAT(450), WHITE)] },
  "prism-relay": { ...keyWord, emphasisGradient: true, ...twoParts("Helper text", "Key word", "helper", true), reveal: WHOLE, paintWords: ["rest"],
    parts: [part("main", "Key word", MONTSERRAT(700)), part("helper", "Helper text", face("IBM Plex Mono", 400), WHITE),
      part("plain", "Normal lines", face("IBM Plex Mono", 400), "#f3fffd", false)] },
  // Every part of the box is in its own BOX section; the frame color is the key word color.
  "editorial-select": { ...keyWord, emphasisWord: "Frame color", emphasisGradient: true, textColor: true, gradient: true, wordSizing: false,
    fontFamily: true, keyFont: true, emphasisSize: true, box: true },
  // The pen writing and the slow zoom are the motion; another one on top only fights them.
  // Its writing and underline take their colors in the renderer itself.
  "becomes-notes": { ...fixedKeyWord, motion: false, wordFormat: false, wordMotion: false, wordColor: false, wordSizing: false,
    parts: [part("main", "Underline", undefined, "#f17d54", false), part("helper", "Text", undefined, "#fffdf5", false)] },
  // A color picked here replaces the gold, glow and all.
  "golden-aura": { motion: false, wordFormat: false, wordMotion: false, wordColor: false, wordSizing: false,
    parts: [part("helper", "Text", face("The Bold Font", 700), "#ffe657")] },
  "pocket-flow": { ...fixedKeyWord, ...twoParts("Helper text", "Main word", "helper", true), reveal: WHOLE, paintWords: ["main", "rest"],
    parts: [part("main", "Main word", INTER(850), WHITE), part("helper", "Helper text", INTER(450), WHITE),
      part("plain", "Normal lines", INTER(600), WHITE, false)] },
  // Ink on paper: the text color is the ink, the key word color the coral stamp and blocks.
  "coral-story": { ...fixedKeyWord, wordSizing: false,
    parts: [part("main", "Stamp color", undefined, "#f64f46", false), part("helper", "Text", undefined, "#000000", false)] },
  "redline-word-box": { wordSizing: false, ...oneText(face("Gorva", 400)) },
  // One glowing phrase with no separate words to move.
  "serif-glow": { ...keyWord, emphasisWord: "Glow color", wordFormat: false, wordMotion: false, wordColor: false, keyMotion: false, wordSizing: false,
    parts: [part("helper", "Text", undefined, WHITE, false)] },
  "blend-cursor": { ...fixedKeyWord, ...twoParts("Helper text", "Main word", "helper", true), reveal: WHOLE, paintWords: ["main", "rest"],
    parts: [part("main", "Main word", undefined, WHITE), part("helper", "Helper text", undefined, WHITE),
      part("plain", "Normal lines", face("Instrument Serif", 400, true), "#fffaf2", false)] },
  // Each line lands as one, so a line or chunk reveal is all it needs.
  "mumbai-script": { ...twoParts("Script line", "Gold line", "script"), reveal: WHOLE, paintWords: ["main"],
    parts: [part("main", "Gold line", face("Poppins", 800), "#f4c64e"), part("script", "Script line", face("Kaushan Script", 400), WHITE, false)] },
  "red-wipe": { accent: { label: "Wipe color", field: "color", gradient: "plain" }, ...twoParts("Top line", "Wipe line"), reveal: LINES, paintWords: ["main", "rest"],
    parts: [part("main", "Wipe line", face("Playfair Display", 700, true), WHITE), part("helper", "Top line", MONTSERRAT(700), WHITE)] },
  // The reply line's color is the Accent.
  creator: { accent: { label: "Reply color", field: "color", gradient: "scoped" }, ...twoParts("Top line", "Reply line"), reveal: LINES, paintWords: ["rest"],
    parts: [part("main", "Reply line", MONTSERRAT(900)), part("helper", "Top line", MONTSERRAT(900), WHITE)] },
  "relay-flow": { accent: { label: "Ribbon color", field: "color" }, ...twoParts("Helper text", "Main word"), paintWords: ["main", "rest"],
    parts: [part("main", "Main word", face("Outfit", 900), WHITE), part("helper", "Helper text", face("Outfit", 900), WHITE)] },
  // The top line's color is the Accent.
  "crimson-rise": { accent: { label: "Top line color", field: "color" }, ...twoParts("Bottom line", "Top line"), reveal: LINES, paintWords: ["rest"],
    parts: [part("main", "Top line", face("Bebas Neue", 400)), part("helper", "Bottom line", INTER(450), WHITE)] },
  "double-trouble": { ...twoParts("Bottom line", "Top line"), reveal: LINES, paintWords: ["main", "rest"],
    parts: [part("main", "Top line", MONTSERRAT(800), WHITE), part("helper", "Bottom line", INTER(300), "#cfd3e0")] },
  "sunday-script": { ...twoParts("Caps", "Script"), reveal: LINES, paintWords: ["main", "rest"],
    // The script is written by a pen; once a font is picked for it, it is set in that font instead.
    parts: [part("main", "Script", face("Handwriting", 400), "#efc5a4"), part("helper", "Caps", face("Coolvetica", 400), "#fff7ee")] },
  sara: { ...twoParts("Normal text", "Big words"), reveal: LINES, paintWords: ["main", "rest"],
    parts: [part("main", "Big words", face("Archive Garamond", 400, true), WHITE), part("helper", "Normal text", face("Archive Garamond", 400, true), WHITE)] },
  "pixelated-word": { reveal: WHOLE, ...oneText() },
  shamani: { reveal: WHOLE, ...oneText(MONTSERRAT(900)) },
};

/**
 * Premium styles are built by code: the line layouts and word choice are theirs. What stays open is
 * place, size, width and tilt, then each text part's font, color and entrance as far as the design
 * can take them. A single word can take its own color and entrance on top.
 */
const PART_MOTION: Partial<StyleCapabilities> = {
  motion: true, keyMotion: true, partMotion: true, wordMotion: true,
  wordFormat: true, wordSize: false, wordColor: true,
};
const HELPER_SERIF = { family: "Instrument Serif", weight: 400, italic: true };
type Font = { family: string; weight: number; italic?: boolean };
/** One kind of text in a lockup: its name, the design's face (missing when it can't change) and color. */
const kind = (id: PartSpec["id"], label: string, font: Font | undefined, color: string, gradient = false): PartSpec =>
  ({ id, label, ...(font ? { font } : {}), color, ...(gradient ? { gradient } : {}) });
/**
 * Every Premium panel is built the same way: one row per kind of text in each section (Fonts, Size,
 * Color, Design), named for what it is in that design. Normal lines are the captions with no main word.
 */
const lockup = (parts: PartSpec[], extra: Partial<StyleCapabilities> = {}): Partial<StyleCapabilities> => ({
  ...PART_MOTION, partTabs: true, partDesign: true, sizes: parts.map(({ id, label }) => ({ id, label })), parts, ...extra,
});
const normal = (font: Font | undefined, color: string) => kind("plain", "Normal lines", font, color);
// Choreographed entrances (halves that meet, brackets that snap, a pointer that drags) are the design,
// so those styles keep them and leave Motion out.
const OWN_MOTION: Partial<StyleCapabilities> = { motion: false, keyMotion: false, partMotion: false, wordMotion: false };
const PREMIUM: Record<string, Partial<StyleCapabilities>> = {
  "split-line": lockup([kind("main", "Main word", { family: "Bebas Neue", weight: 400 }, "#ffffff"),
    kind("helper", "Small text", { family: "Montserrat", weight: 600 }, "#ffffff"), normal({ family: "Montserrat", weight: 600 }, "#ffffff")],
    { ...OWN_MOTION, accent: { label: "Lower half color", field: "color" } }),
  viewfinder: lockup([kind("main", "Main word", { family: "Montserrat", weight: 800 }, "#ffffff"),
    kind("helper", "Small text", { family: "IBM Plex Mono", weight: 400 }, "#ffffff"), normal({ family: "IBM Plex Mono", weight: 400 }, "#ffffff")],
    { ...OWN_MOTION, accent: { label: "Bracket color", field: "color" }, features: [{ id: "hud", label: "Camera readout" }] }),
  "glow-anchor": lockup([kind("main", "Main word", { family: "Outfit", weight: 900 }, "#a870ff", true),
    kind("helper", "Small text", { family: "Roboto", weight: 500 }, "#f8f5f0")], { emphasisPanel: false, letterSpacing: false, motionLabels: ["Small text", "Main word"] }),
  "neon-overlap": lockup([kind("main", "Main word", { family: "Poppins", weight: 900 }, "#ff4056", true),
    kind("helper", "Script", HELPER_SERIF, "#fffdf8"), normal(HELPER_SERIF, "#fffdf8")], { motionLabels: ["Script", "Main word"] }),
  "style-one": lockup([kind("main", "Main word", { family: "Poppins", weight: 800 }, "#ffffff", true),
    kind("helper", "Small text", { family: "Instrument Sans", weight: 400 }, "#d5dae1"), normal({ family: "Instrument Sans", weight: 500 }, "#d5dae1")],
    { minWidth: 0.5, motionLabels: ["Small text", "Main word"] }),
  // Maroon King's normal lines are set in its script, so the Script row styles both.
  "maroon-king": lockup([kind("main", "Main word", { family: "Poppins", weight: 900 }, "#bd1019", true),
    kind("helper", "Small text", { family: "Instrument Sans", weight: 400 }, "#fffdf9"),
    kind("script", "Script & normal lines", { family: "Great Vibes", weight: 400 }, "#fffdf9")], { motionLabels: ["Small text", "Main word"], partText: true }),
  // A word can glow on its own; everything else about the stack is its 3D.
  // Its serif lines and its plain lines each take a font of their own; the italic lines follow the plain font.
  "reference-stack": { emphasis: "none", motion: false, wordFormat: true, wordSize: false, wordColor: true, layerEffects: true, sizes: [], wordSizing: false, parts: [
    { id: "main", label: "Serif lines", font: { family: "Idealist Serif", weight: 400 }, color: "#ffffff", gradient: true },
    { id: "helper", label: "Plain lines", font: { family: "Coolvetica", weight: 400 } },
  ] },
  // Luxe picks its own words and colors: a color here replaces the random one, reset brings it back.
  luxe: lockup([kind("main", "Main word", { family: "Outfit", weight: 900 }, "#b076db", true),
    kind("helper", "Script", HELPER_SERIF, "#fffaf2"), normal(HELPER_SERIF, "#fffaf2")],
    { emphasisPanel: false, motionLabels: ["Script", "Main word"] }),
  cadence: lockup([kind("main", "Main word", { family: "Anton", weight: 400 }, "#fff5e8"),
    kind("helper", "Small text", { family: "Space Grotesk", weight: 700 }, "#fff5e8")],
    { emphasisPanel: false, motionLabels: ["Small text", "Main word"] }),
  "editorial-type": { ...PART_MOTION, partTabs: true, wordColor: false, wordFormat: false, wordSizing: false,
    motionLabels: ["Small text", "Main word"], sizes: [{ id: "main", label: "Main word" }, { id: "helper", label: "Small text" }],
    parts: [{ id: "main", label: "Main word", font: { family: "Pinyon Script", weight: 400 } },
      { id: "helper", label: "Small text", font: { family: "Roboto", weight: 300 } }] },
  // The pointer drags the main word, so its own motion stays.
  "cursor-story": lockup([kind("main", "Main word", { family: "Inter", weight: 800 }, "#2f74ff", true),
    kind("helper", "Small text", { family: "Inter", weight: 500 }, "#fffdf8"), normal({ family: "Inter", weight: 500 }, "#fffdf8")],
    { ...OWN_MOTION, fixedHero: true }),
  "ember-lock": lockup([kind("main", "Main word", { family: "Outfit", weight: 900 }, "#ff6200", true),
    kind("helper", "Small text", { family: "Playfair Display", weight: 400, italic: true }, "#fffdf8"),
    normal({ family: "Playfair Display", weight: 400, italic: true }, "#fffdf8")], { motionLabels: ["Small text", "Main word"] }),
  "dynamic-simple": lockup([kind("main", "Main word", { family: "Plus Jakarta Sans", weight: 800 }, "#7839e8"),
    kind("helper", "Small text", { family: "Plus Jakarta Sans", weight: 400 }, "#ffffff"), normal({ family: "Plus Jakarta Sans", weight: 700 }, "#ffffff")],
    { motionLabels: ["Small text", "Main word"] }),
  "verse-flow": lockup([kind("main", "Main word", { family: "Instrument Serif", weight: 400, italic: true }, "#e6f65c"),
    kind("helper", "Small text", { family: "Roboto", weight: 700 }, "#ffffff"), normal({ family: "Roboto", weight: 700 }, "#ffffff")],
    { motionLabels: ["Small text", "Main word"] }),
  // Main word: the highlighted words it picks itself. Small text: every other word.
  "smart-text-caption": lockup([kind("main", "Main word", { family: "Inter", weight: 800 }, "#7cdbed"),
    kind("helper", "Small text", { family: "Inter", weight: 600 }, "#ffffff")],
    { ...OWN_MOTION, emphasisPanel: false, sizes: [], wordSizing: false }),
};

/** Key words when the user picks them; otherwise separate rows when the style has more than one kind of text. */
const withTarget = (cap: StyleCapabilities): StyleCapabilities => ({
  ...cap,
  target: cap.partTabs ? "lines" : cap.emphasis !== "none" && cap.emphasisPanel !== false ? "key" : (cap.parts?.length ?? 0) > 1 || cap.partMotion ? "lines" : undefined,
});

export const styleCapabilities = (styleId: string): StyleCapabilities => {
  const style = captionStyle(styleId);
  if (style?.category === "Standard")
    return withTarget({ ...standard, wordFormat: true, wordSize: false, wordMotion: true, wordColor: true, keyMotion: true, layerEffects: true, keyDesign: true,
      // Uppercase designs can be switched too; only lettering with one case of its own can't.
      textCase: !FIXED_CASE.has(styleId),
      // Two or more kinds of text: each can take Design of its own.
      partDesign: (STANDARD[styleId]?.parts?.length ?? 0) > 1, ...STANDARD[styleId] });
  // Every Premium design takes letter spacing on top of its own tracking.
  if (style?.category === "Premium") return withTarget({ ...standard, ...fixedKeyWord, overallSize: true, layerEffects: true, letterSpacing: true, ...PREMIUM[styleId] });
  const signed = isSignatureStyleId(styleId);
  const basic = { ...full, ...(signed ? signature : {}), ...SPECIFIC[styleId] };
  const keyed = basic.emphasis !== "none";
  // Every Basic style with key words gives them the same controls as the rest: font and face, size, color
  // (a gradient too, except Script Accent's one-color cursive), Design and letter spacing.
  return withTarget({ ...basic, sizes: [], overallSize: true, emphasisSize: keyed,
    emphasisGradient: keyed && !!basic.emphasisWord && styleId !== "style-two",
    keyFont: keyed && basic.fontFamily, keyDesign: keyed, keySpacing: keyed && styleId !== "style-two" });
};

const EMPHASIS_COLORS: Record<string, string> = {
  "captions-dot": "#e2fb00",
  "hormozi-pop": "#ff5c5c",
  "creator-emoji": "#ffe36b",
  "style-two": "#ffffff",
  "yellow-block": "#d6002f",
  "contrast-box": "#7c3aed",
  "marker-swipe": "#111111",
  "circle-callout": "#ffffff",
  "sport-slant": "#ffffff",
  "glitch-split": "#ffffff",
  "lower-third": "#ffd23f",
  "terminal-type": "#39ff88",
};
/** Plain-text styles show emphasis right away; styles with an active-word effect start with it off. */
const EMPHASIS_ON = new Set(["clean-subtitles", "meme-outline", "yellow-block", "contrast-box"]);

export const emphasisDefaults = (styleId: string): EmphasisSettings => {
  const cap = styleCapabilities(styleId);
  return {
    enabled: EMPHASIS_ON.has(styleId) || cap.emphasis === "hero",
    color: EMPHASIS_COLORS[styleId] ?? (captionStyle(styleId)?.category !== "Basic" ? captionStyle(styleId)?.accent : undefined) ?? "#ffe36b",
    backgroundColor: cap.emphasisShape ? (captionStyle(styleId)?.accent ?? "#570df8") : "#570df8",
    mode: "text",
    scale: 1,
    font: styleId === "luma-script" ? "instrument" : undefined,
  };
};

export const resolveEmphasis = (settings: CaptionSettings, styleId: string): EmphasisSettings => {
  const defaults = emphasisDefaults(styleId);
  // Without a toggle the style decides, whatever an older project saved.
  const enabled = styleCapabilities(styleId).emphasisToggle ? settings.emphasis?.enabled : undefined;
  return { ...defaults, ...settings.emphasis, enabled: enabled ?? defaults.enabled };
};
