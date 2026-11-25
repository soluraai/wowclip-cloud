import { useLayoutEffect, useMemo, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import { captionFontFamily, loadCaptionFont } from "../../BasicCaption/fonts";
import type { FontSpec } from "../../StyleOne/config";
import { usePartFonts, type PremiumParts } from "../../Premium/parts";

export const typefaces = {
  sans: { family: "Inter", src: "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf", weight: 450 },
  heavy: { family: "Inter", src: "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf", weight: 850 },
  capital: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 700 },
  light: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 450 },
  mono: { family: "IBM Plex Mono", src: "launch-caption-pack/fonts/standard-type/IBMPlexMono-Regular.ttf", weight: 400 },
  condensed: { family: "Bebas Neue", src: "launch-caption-pack/fonts/standard-type/BebasNeue-Regular.ttf", weight: 400 },
  italic: { family: "Playfair Display", src: "launch-caption-pack/fonts/playfairdisplay/PlayfairDisplay-Italic[wght].ttf", weight: 650, style: "italic" },
  hindi: { family: "Noto Sans Devanagari", src: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", weight: 700 },
} satisfies Record<string, FontSpec>;
export type Face = keyof typeof typefaces;
export type TypographyFonts = Record<Face, FontSpec>;
export const captionAsset = (src: string) => /^(https?:|data:|blob:|\/)/iu.test(src) ? src : staticFile(src);
export const hindiText = (text: string) => /[\u0900-\u097f]/u.test(text);
/** Every word keeps its role's face; Script/ScriptFonts draws Hindi letters in a matching face. */
export const textFont = (_text: string, fonts: TypographyFonts, face: Face) => fonts[face];

export function useTypographyFonts(requested: readonly Face[], needsHindi: boolean) {
  const fontKey = `${requested.join(":")}:${needsHindi}`;
  const fonts = useMemo(() => Object.fromEntries(Object.entries(typefaces).map(([id, spec]) => {
    const italic = "style" in spec && spec.style === "italic";
    return [id, { family: captionFontFamily(captionAsset(spec.src), spec.family, spec.weight, italic),
      weight: spec.weight, style: italic ? "italic" : "normal" }];
  })) as TypographyFonts, []);
  const [loaded, setLoaded] = useState("");
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false, released = false;
    const handle = delayRender("Loading measured caption typography");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const ids = [...new Set([...requested, ...(needsHindi ? ["hindi" as const] : [])])];
    void Promise.all(ids.map(id => {
      const spec = typefaces[id];
      return loadCaptionFont(captionAsset(spec.src), spec.family, spec.weight, "style" in spec && spec.style === "italic");
    })).then(() => { if (!disposed) setLoaded(fontKey); })
      .catch((error: unknown) => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [fontKey, requested, needsHindi, delayRender, continueRender, cancelRender]);
  return { fonts, ready: loaded === fontKey };
}

/**
 * The design's faces with the fonts picked in the editor in place: by maps a face to the part whose pick
 * replaces it (main for key words or the main line, helper for the rest). ready waits for those fonts too.
 */
export function usePickedTypography(fonts: TypographyFonts, ready: boolean, parts: PremiumParts | undefined, by: Partial<Record<Face, "main" | "helper">>) {
  const { faces, ready: picksReady } = usePartFonts(parts);
  const key = JSON.stringify(by);
  const picked = useMemo(() => {
    const map = JSON.parse(key) as Partial<Record<Face, "main" | "helper">>;
    const next = { ...fonts };
    for (const [face, part] of Object.entries(map) as [Face, "main" | "helper"][]) {
      const pick = faces[part];
      if (pick) next[face] = { family: pick.family, weight: pick.weight, style: pick.italic ? "italic" : "normal" };
    }
    return next;
  }, [fonts, faces, key]);
  return { fonts: picked, ready: ready && picksReady };
}
