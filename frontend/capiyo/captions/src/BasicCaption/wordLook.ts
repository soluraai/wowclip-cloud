import type { CSSProperties } from "react";
import { useLayoutEffect } from "react";
import { staticFile, useDelayRender } from "remotion";
import { captionFontFamily, loadCaptionFont } from "./fonts";
import { effectsFilter, type BasicWordPresentation } from "./wordPresentation";

const asset = (src: string) =>
  /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);

/** What one word changed for itself, for renderers that lay their words out by style. */
export function wordLook(edit: BasicWordPresentation | undefined, unit: number): CSSProperties {
  const font = edit?.font;
  if (!edit) return {};
  // Key words take their size and Design on top of the style's own drawing.
  const own: CSSProperties = {
    ...(edit.sizeScale && edit.sizeScale !== 1 && !edit.ownSize ? { fontSize: `${edit.sizeScale}em` } : {}),
    ...(edit.effects ? { filter: effectsFilter(edit.effects, unit), opacity: edit.effects.opacity } : {}),
    ...(edit.blendPass ? { visibility: edit.blendPass } : {}),
  };
  if (!font) return own;
  const gradient = edit.overrideColor ? edit.gradient : undefined;
  return {
    ...own,
    ...(edit.ownFont
      ? {
          fontFamily: `${JSON.stringify(captionFontFamily(font.src ? asset(font.src) : "", font.family, font.weight, font.italic))}, Inter, Arial, sans-serif`,
          fontWeight: font.weight,
          fontStyle: font.italic ? "italic" : "normal",
        }
      : {}),
    ...(edit.ownSize ? { fontSize: font.size * unit } : {}),
    ...(edit.ownSpacing ? { letterSpacing: font.letterSpacing * unit } : {}),
    ...(edit.textCase ? { textTransform: edit.textCase === "preserve" ? "none" : edit.textCase } : {}),
    ...(gradient
      ? {
          backgroundImage: `linear-gradient(${gradient.angle}deg, ${gradient.stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ")})`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }
      : edit.overrideColor
        ? { color: font.color }
        : {}),
  } as CSSProperties;
}

/** Loads the fonts single words chose. */
export function useWordFonts(wordStyles: Record<string, BasicWordPresentation> | undefined) {
  const { delayRender, continueRender } = useDelayRender();
  const key = JSON.stringify([
    ...new Set(
      Object.values(wordStyles ?? {}).flatMap((word) =>
        word.ownFont && word.font?.src ? [JSON.stringify([word.font.src, word.font.family, word.font.weight, word.font.italic])] : [],
      ),
    ),
  ]);
  useLayoutEffect(() => {
    const faces = (JSON.parse(key) as string[]).map((face) => JSON.parse(face) as [string, string, number, boolean]);
    if (!faces.length) return;
    const handle = delayRender("Loading word fonts");
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        continueRender(handle);
      }
    };
    void Promise.all(faces.map(([src, family, weight, italic]) => loadCaptionFont(asset(src), family, weight, italic)))
      .catch(() => undefined)
      .finally(release);
    return release;
  }, [key, delayRender, continueRender]);
}
