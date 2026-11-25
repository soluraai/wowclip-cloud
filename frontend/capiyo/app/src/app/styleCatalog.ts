import {
  BASIC_STYLES, BASIC_FONTS, isBasicStyleId, resolveBasicStyleId, type BasicStyleId,
  basicMotion,
} from "../../../captions/src/Basic/catalog";
import { STANDARD_STYLES, isStandardStyleId, type StandardStyleId } from "../../../captions/src/Standard/catalog";
import { PREMIUM_STYLES, isPremiumStyleId, type PremiumStyleId } from "../../../captions/src/Premium/catalog";

export { basicMotion };

// Website labels and Studio compositions come from the same curated registry.
export const CAPTION_STYLES = [...BASIC_STYLES.map((style) => ({
  ...style,
  category: "Basic" as const,
  fontFamily: BASIC_FONTS[style.font].family,
  fontSrc: `/api/caption-assets/basic-${style.font}`,
})), ...STANDARD_STYLES.map((style) => {
  const fontKey = style.font as keyof typeof BASIC_FONTS;
  const fontMeta = fontKey in BASIC_FONTS ? BASIC_FONTS[fontKey] : undefined;
  return {
    ...style,
    category: "Standard" as const,
    fontFamily: "fontFamily" in style ? style.fontFamily : fontMeta?.family ?? style.font,
    fontSrc: "fontSrc" in style ? style.fontSrc : fontMeta ? `/api/caption-assets/basic-${style.font}` : `/api/caption-assets/${style.font}`,
  };
}), ...PREMIUM_STYLES.map(style => ({
  ...style,
  category: "Premium" as const,
  fontFamily: style.fontFamily,
  fontSrc: style.fontSrc,
}))];

type LegacyStyleId = "simple-text" | "plain-active-word" | "stacked-text" | "bold-impact" | "highlight-chip" | "pop-in" | "muse-script"
  | "word-reveal" | "one-word" | "classic-outline" | "soft-fade" | "typewriter" | "editorial-serif" | "karaoke-pill";
export type CaptionStyleId = BasicStyleId | StandardStyleId | PremiumStyleId | LegacyStyleId;
const legacy: readonly string[] = [
  "simple-text", "plain-active-word", "stacked-text", "bold-impact", "highlight-chip", "pop-in", "muse-script",
  "word-reveal", "one-word", "classic-outline", "soft-fade", "typewriter", "editorial-serif", "karaoke-pill",
];
export const isCaptionStyleId = (id: unknown): id is CaptionStyleId =>
  isBasicStyleId(id) || isStandardStyleId(id) || isPremiumStyleId(id) || typeof id === "string" && legacy.includes(id);
export const captionStyle = (id: string) => CAPTION_STYLES.find((style) => style.id === id);
export const resolveCaptionStyleId = (id: unknown): BasicStyleId | StandardStyleId | PremiumStyleId =>
  id === "muse-script" ? "blend-cursor" : isPremiumStyleId(id) || isStandardStyleId(id) ? id : resolveBasicStyleId(id);
