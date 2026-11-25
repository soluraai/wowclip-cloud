import type { MotionIn, MotionUnit } from "../BasicCaption/motion";

export type BasicEffect = "plain" | "color" | "pill" | "sweep" | "glow" | "pop" | "underline" | "emoji";
export type BasicReveal = "phrase" | "words" | "characters";

export const BASIC_FONTS = {
  integral: { family: "IntegralCF", src: "captions-dot/integral-heavy.otf" },
  redressed: { family: "Redressed", src: "muse-script/Redressed-Regular.ttf" },
  gorva: { family: "Gorva", src: "clucap-reference/Gorva-Regular-Demo.otf" },
  theboldfont: { family: "The Bold Font", src: "clucap-reference/THEBOLDFONT-FREEVERSION.ttf" },
  inter: { family: "Inter", src: "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf" },
  poppins: { family: "Poppins", src: "launch-caption-pack/fonts/legacy/poppins-black.ttf" },
  instrument: { family: "Instrument Sans", src: "launch-caption-pack/fonts/legacy/instrument-sans-variable.ttf" },
  serif: { family: "Newsreader", src: "launch-caption-pack/fonts/newsreader/Newsreader[opsz,wght].ttf" },
  anton: { family: "Anton", src: "launch-caption-pack/fonts/anton/Anton-Regular.ttf" },
  montserrat: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf" },
  bebas: { family: "Bebas Neue", src: "launch-caption-pack/fonts/standard-type/BebasNeue-Regular.ttf" },
  plexmono: { family: "IBM Plex Mono", src: "launch-caption-pack/fonts/standard-type/IBMPlexMono-Regular.ttf" },
  devanagari: { family: "Noto Sans Devanagari", src: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf" },
} as const;

/** The website's `/api/caption-assets/<id>` fonts and the bundled file each one serves. */
export const CAPTION_FONT_ASSETS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(BASIC_FONTS).map(([id, font]) => [`basic-${id}`, font.src])),
  "inter-bold": "reference-stack/Inter-800-normal.ttf",
  "montserrat-bold": "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf",
  "poppins-black": "launch-caption-pack/fonts/legacy/poppins-black.ttf",
  "instrument-sans": "launch-caption-pack/fonts/legacy/instrument-sans-variable.ttf",
  "inter-karaoke": "launch-caption-pack/fonts/legacy/Inter-700-normal.ttf",
  // Standard styles whose font is not a Basic one (styleCatalog links them by their own name).
  caveat: "style-one/fonts/caveat-variable.ttf",
  playfair: "launch-caption-pack/fonts/playfairdisplay/PlayfairDisplay[wght].ttf",
  roboto: "editorial-type/fonts/roboto-variable.ttf",
};

/** Faces offered for key words in the styles that set them apart by font. */
export const SCRIPT_FONTS = {
  caveat: { label: "Caveat", family: "Caveat", src: "style-one/fonts/caveat-variable.ttf", weight: 700, italic: false },
  redressed: { label: "Redressed", ...BASIC_FONTS.redressed, weight: 400, italic: false },
  gorva: { label: "Gorva", ...BASIC_FONTS.gorva, weight: 400, italic: false },
  instrument: { label: "Instrument Serif", family: "Instrument Serif", src: "style-two/fonts/instrument-serif-italic.ttf", weight: 400, italic: true },
  playfair: { label: "Playfair Display", family: "Playfair Display", src: "launch-caption-pack/fonts/playfairdisplay/PlayfairDisplay-Italic[wght].ttf", weight: 700, italic: true },
} as const;

type Preset = {
  id: string;
  name: string;
  compositionId: string;
  description: string;
  useCase: string;
  font: keyof typeof BASIC_FONTS;
  weight: number;
  effect: BasicEffect;
  reveal: BasicReveal;
  motion: "none" | "fade" | "pop";
  textCase: "preserve" | "uppercase" | "lowercase";
  stroke: number;
  strokeColor: string;
  plate: boolean;
  plateColor: string;
  stacked: boolean;
  letterSpacing: number;
  maxWords: number;
  previewScale?: number;
  accent: string;
  /** Second accent color, for styles with two (Glitch Split's channels). */
  accent2?: string;
  color: string;
  provenance: string;
};

const base = {
  font: "inter", weight: 600, effect: "plain", reveal: "phrase", motion: "none",
  textCase: "preserve", stroke: 0, strokeColor: "#101014", plate: false, plateColor: "#ffffff",
  stacked: false, letterSpacing: 0, maxWords: 5,
  accent: "#ffe36b", color: "#ffffff",
} as const;

export const SIGNATURE_STYLE_IDS = [
  "cinematic-stack", "lyric-focus", "circle-callout", "sticker-words",
  "marker-swipe", "glitch-split", "aurora-gradient", "terminal-type", "lower-third", "chat-bubble", "sport-slant", "outline-hero",
] as const;
export type SignatureStyleId = (typeof SIGNATURE_STYLE_IDS)[number];
export const isSignatureStyleId = (id: unknown): id is SignatureStyleId =>
  typeof id === "string" && (SIGNATURE_STYLE_IDS as readonly string[]).includes(id);

// FINAL ORDER = ranking. Most used / most useful first (research: word highlight, bold hooks,
// readable everyday text, outlines), then creator looks, then signature layouts, then niche looks.
// Color, font and word/line animation are separate user controls, so every style here is a
// distinct design (structure, glow, plate, emphasis treatment), never a recolor of another.
export const BASIC_STYLES = [
  { ...base, id: "captions-dot", name: "One Word", compositionId: "Basic-CaptionsDot", maxWords: 1,
    font: "integral", weight: 900, textCase: "uppercase", accent: "#e2fb00",
    description: "One big word at a time, in step with speech, ending each sentence with a lime dot.",
    useCase: "Word-level reels & voiceovers", provenance: "Original CaptionsDot: Integral Heavy, Poppins punctuation and exact source timestamps",
  },
  { ...base, id: "highlight-box", name: "Highlight Box", compositionId: "Basic-HighlightBox", font: "montserrat", weight: 800, effect: "pill",
    textCase: "uppercase", maxWords: 3, accent: "#7c3aed",
    description: "A purple box jumps to each spoken word while the rest of the phrase stays white.", useCase: "Tutorials, podcasts & explainers", provenance: "Active-word highlight box (Submagic / CapCut-type look)",
  },
  { ...base, id: "hormozi-pop", name: "Bold Impact", compositionId: "Basic-ImpactPop", effect: "pop", font: "poppins", weight: 900,
    textCase: "uppercase", stroke: 0.035, maxWords: 4, accent: "#ffd60a",
    description: "Heavy uppercase hook captions; the spoken word turns yellow and pops up as it starts.", useCase: "Hooks, business & education", provenance: "Bold uppercase + yellow keyword (Hormozi-type look)",
  },
  { ...base, id: "clean-subtitles", name: "Clean Subtitles", compositionId: "Basic-CleanSubtitles", weight: 500,
    description: "A complete phrase, clearly set with a soft fade. The base for any customization.", useCase: "Everyday video", provenance: "BasicCaption",
  },
  { ...base, id: "creator-emoji", name: "Creator Emoji", compositionId: "Basic-CreatorEmoji", maxWords: 4,
    font: "theboldfont", weight: 800, effect: "emoji", reveal: "words", textCase: "uppercase", stroke: 0.035, accent: "#ffe36b",
    description: "Words arrive with speech while an AI-picked emoji pops in above the caption.",
    useCase: "YouTube Shorts & viral reels", provenance: "Creator / MrBeast / Submagic sentiment engine",
  },
  { ...base, id: "style-two", name: "Script Accent", compositionId: "Basic-StyleTwo", maxWords: 4,
    font: "instrument", weight: 500, accent: "#ffffff",
    description: "Cursive glowing key word beside clean, plain supporting words.",
    useCase: "Creator stories & podcasts", provenance: "StyleTwo: Caveat 700 emphasis + Instrument Sans support",
  },
  { ...base, id: "marker-swipe", name: "Marker Swipe", compositionId: "Basic-MarkerSwipe", font: "inter", weight: 800,
    maxWords: 4, accent: "#ffe14d",
    description: "A thick hand-painted highlighter swipes in behind the key word.", useCase: "Tips, study & explainers", provenance: "Original highlighter layout",
  },
  { ...base, id: "sticker-words", name: "Sticker Words", compositionId: "Basic-StickerWords", font: "poppins", weight: 900,
    textCase: "uppercase", maxWords: 4, accent: "#ffd60a",
    description: "Every word is a tilted color sticker; the main word is bigger.", useCase: "Gen-Z, fun & lifestyle", provenance: "Original sticker layout",
  },
  { ...base, id: "minimal-glow", name: "Soft Glow", compositionId: "Basic-SoftGlow", effect: "glow", font: "instrument", textCase: "lowercase", accent: "#ffffff",
    description: "The spoken word brightens gently against quieter text.", useCase: "Calm stories", provenance: "LaunchCaptionPack / MinimalGlow",
  },
  { ...base, id: "contrast-box", name: "Contrast Box", compositionId: "Basic-ContrastBox", plate: true, color: "#000000",
    description: "Clean white plates sit behind each line with black text for clear contrast.", useCase: "Lessons & demos", provenance: "LaunchCaptionPack / ContrastBox",
  },
  { ...base, id: "outline-hero", name: "Outline Hero", compositionId: "Basic-OutlineHero", font: "anton", weight: 400,
    textCase: "uppercase", maxWords: 4, accent: "#59d8ff",
    description: "A hollow, glowing outline key word sits over solid supporting words.", useCase: "Posters, hooks & statements", provenance: "Original hollow-hero layout",
  },
  { ...base, id: "yellow-block", name: "Yellow Block", compositionId: "Basic-YellowBlock", plate: true, plateColor: "#ffe14d", color: "#111111",
    font: "montserrat", weight: 800, textCase: "uppercase", maxWords: 4,
    description: "Black uppercase text on a bright yellow block that stands out from any video.", useCase: "News, deals & announcements", provenance: "Colored background block caption",
  },
  { ...base, id: "lyric-focus", name: "Lyric Focus", compositionId: "Basic-LyricFocus", font: "inter", weight: 800,
    maxWords: 6, accent: "#9ad7ff",
    description: "The whole line stays on screen while the spoken word glows and the rest dims, like streaming lyrics.", useCase: "Music, motivation & voiceovers", provenance: "Original lyric-focus layout",
  },
  { ...base, id: "karaoke-sweep", name: "Karaoke Sweep", compositionId: "Basic-KaraokeSweep", effect: "sweep", weight: 700, accent: "#78edee",
    description: "Color fills each word in step with its spoken duration.", useCase: "Narration & music", provenance: "LaunchCaptionPack / KaraokeSweep",
  },
  { ...base, id: "circle-callout", name: "Circle Callout", compositionId: "Basic-CircleCallout", font: "montserrat", weight: 800,
    maxWords: 4, accent: "#ff4d4d",
    description: "A glowing hand-drawn ring circles the key word as it is spoken.", useCase: "Explainers, tips & reviews", provenance: "Original hand-drawn callout",
  },
  { ...base, id: "meme-outline", name: "Meme Outline", compositionId: "Basic-MemeOutline", font: "anton", weight: 400, textCase: "uppercase", stroke: 0.065, maxWords: 4, previewScale: 1.3,
    description: "Condensed uppercase text with a clear dark outline.", useCase: "Reactions & memes", provenance: "LaunchCaptionPack / MemeImpact",
  },
  { ...base, id: "underline-focus", name: "Underline Focus", compositionId: "Basic-UnderlineFocus", effect: "underline",
    description: "A quiet underline follows the current spoken word.", useCase: "Education", provenance: "BasicCaption underline treatment",
  },
  { ...base, id: "sport-slant", name: "Sport Slant", compositionId: "Basic-SportSlant", font: "poppins", weight: 900,
    textCase: "uppercase", maxWords: 4, accent: "#ff3b30",
    description: "Slanted uppercase with an extruded key word and a speed-stripe underline.", useCase: "Fitness, sports & energy", provenance: "Original slanted sports layout",
  },
  { ...base, id: "glitch-split", name: "Glitch Split", compositionId: "Basic-GlitchSplit", font: "bebas", weight: 400,
    textCase: "uppercase", maxWords: 3, accent: "#00e1ff", accent2: "#ff2a5e",
    description: "Red and cyan channels split apart and the key word is sliced like a signal glitch.", useCase: "Gaming, tech & edgy edits", provenance: "Original RGB-split layout",
  },
  { ...base, id: "chat-bubble", name: "Chat Bubble", compositionId: "Basic-ChatBubble", font: "inter", weight: 500,
    maxWords: 5, accent: "#0a84ff",
    description: "Each phrase appears as a message bubble with a tail, like a chat reply.", useCase: "Stories, skits & conversations", provenance: "Original message-bubble layout",
  },
  { ...base, id: "lower-third", name: "Lower Third", compositionId: "Basic-LowerThird", font: "instrument", weight: 500,
    maxWords: 6, accent: "#ffd23f",
    description: "Left-aligned broadcast plate with an accent bar and a highlighted key word.", useCase: "Interviews, podcasts & news", provenance: "Original broadcast lower-third layout",
  },
  { ...base, id: "terminal-type", name: "Terminal Type", compositionId: "Basic-TerminalType", font: "plexmono", weight: 500,
    maxWords: 5, accent: "#39ff88",
    description: "Letters type out on a dark terminal bar with a blinking green cursor.", useCase: "Tech, coding & dramatic moments", provenance: "Original typewriter-terminal layout",
  },
  { ...base, id: "mono-label", name: "Mono Label", compositionId: "Basic-MonoLabel", font: "plexmono", weight: 500,
    textCase: "uppercase", plate: true, plateColor: "#0b0b0f", effect: "color", maxWords: 4, accent: "#b7f34a",
    description: "Small uppercase mono type on a dark label, with the spoken word lit in lime.", useCase: "Tech, data & calm explainers", provenance: "Original mono label layout",
  },
  { ...base, id: "tall-headline", name: "Tall Headline", compositionId: "Basic-TallHeadline", font: "anton", weight: 400,
    textCase: "uppercase", stacked: true, effect: "color", maxWords: 3, accent: "#ff5a36",
    description: "Tall condensed capitals stacked in short rows, with the spoken word in orange.", useCase: "Hooks, sport & trailers", provenance: "Original tall stacked layout",
  },
] as const satisfies readonly Preset[];

export type BasicStyleId = (typeof BASIC_STYLES)[number]["id"];

/**
 * The entrance each style looks best with: its card plays it and picking the style starts on it.
 * Styles with something timed to a word (ring, marker, glitch) animate by word, because a whole-caption
 * entrance shows them finished. Styles missing here have motion of their own.
 */
// keyIn: key words enter their own way (a power word lands differently from the words around it).
const BASIC_MOTION: Partial<Record<BasicStyleId, { unit: MotionUnit; in: MotionIn; keyIn?: MotionIn }>> = {
  "captions-dot": { unit: "caption", in: "snap" },
  "highlight-box": { unit: "caption", in: "rise" },
  "hormozi-pop": { unit: "line", in: "rise" },
  "clean-subtitles": { unit: "caption", in: "fade" },
  "creator-emoji": { unit: "word", in: "pop" },
  "style-two": { unit: "word", in: "blurrise" },
  "marker-swipe": { unit: "word", in: "glide", keyIn: "punch" },
  "sticker-words": { unit: "word", in: "stamp" },
  "minimal-glow": { unit: "caption", in: "blurrise" },
  "contrast-box": { unit: "caption", in: "rise" },
  "outline-hero": { unit: "word", in: "trail", keyIn: "fade" },
  "yellow-block": { unit: "caption", in: "slap" },
  "karaoke-sweep": { unit: "caption", in: "fade" },
  "circle-callout": { unit: "word", in: "glide", keyIn: "punch" },
  "meme-outline": { unit: "word", in: "pop" },
  "underline-focus": { unit: "caption", in: "rise" },
  "sport-slant": { unit: "word", in: "whip", keyIn: "slam" },
  "glitch-split": { unit: "word", in: "glitch" },
  "chat-bubble": { unit: "caption", in: "pop" },
  "lower-third": { unit: "caption", in: "left" },
  "mono-label": { unit: "caption", in: "blurrise" },
  "tall-headline": { unit: "word", in: "rise" },
};
/** Standard styles whose default is a picked motion rather than their own; reveal sets Show. */
const STANDARD_MOTION: Record<string, { unit: MotionUnit; in: MotionIn; keyIn?: MotionIn; reveal?: "word" | "line" | "chunk" }> = {
  "cinematic-stack": { unit: "caption", in: "cinema" },
  "luma-script": { unit: "word", in: "blurrise" },
  // Normal words rise out of a blur; the key word comes into focus, warm and slightly large.
  hind: { unit: "word", in: "blurrise", keyIn: "lens" },
  // The headline word slides in from the left; the script around it rises out of a blur.
  og: { unit: "word", in: "blurrise", keyIn: "left" },
  // Top line, then bottom line: the top line slides in to the left, the bottom line to the right.
  "double-trouble": { unit: "word", in: "left", keyIn: "right", reveal: "line" },
  // Normal text rises softly; the big words punch in.
  sara: { unit: "word", in: "blurrise", keyIn: "punch" },
};
export const basicMotion = (id: string): { unit: MotionUnit; in: MotionIn; keyIn?: MotionIn; reveal?: "word" | "line" | "chunk" } | undefined =>
  BASIC_MOTION[id as BasicStyleId] ?? STANDARD_MOTION[id];
export type BasicStylePreset = (typeof BASIC_STYLES)[number];
/** Lives in Standard's library now, but still draws through the Basic signature renderer. */
const CINEMATIC_STACK = { ...base, id: "cinematic-stack", name: "Cinematic Stack", compositionId: "Standard-CinematicStack", font: "montserrat", weight: 900,
  textCase: "uppercase", maxWords: 4, accent: "#ffb347", description: "", useCase: "", provenance: "" } as unknown as BasicStylePreset;
export const basicStyle = (id: string): BasicStylePreset =>
  id === "cinematic-stack" ? CINEMATIC_STACK : BASIC_STYLES.find((style) => style.id === id) ?? BASIC_STYLES[0];
export const isBasicStyleId = (id: unknown): id is BasicStyleId =>
  typeof id === "string" && BASIC_STYLES.some((style) => style.id === id);

export const BASIC_LEGACY_IDS: Record<string, BasicStyleId> = {
  "simple-text": "clean-subtitles", "plain-active-word": "hormozi-pop", "stacked-text": "clean-subtitles",
  "bold-impact": "hormozi-pop", "highlight-chip": "highlight-box", "karaoke-pill": "highlight-box", "pop-in": "hormozi-pop",
  "word-reveal": "clean-subtitles", "one-word": "captions-dot", "classic-outline": "meme-outline",
  "soft-fade": "clean-subtitles", "typewriter": "clean-subtitles", "editorial-serif": "clean-subtitles",
  "active-word": "hormozi-pop", "purple-voice-blink": "highlight-box", "stacked-bold": "hormozi-pop",
  "subtitle-box": "contrast-box", "cinema-yellow": "yellow-block", "neon-glow": "minimal-glow", "cinematic-wide": "clean-subtitles",
  // Removed 2026-11-12: about 2.5x the render cost of other Basic templates.
  "aurora-gradient": "minimal-glow",
};
export const resolveBasicStyleId = (id: unknown): BasicStyleId =>
  isBasicStyleId(id) ? id : typeof id === "string" ? BASIC_LEGACY_IDS[id] ?? "clean-subtitles" : "clean-subtitles";
