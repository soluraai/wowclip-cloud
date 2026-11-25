import { getRemotionEnvironment, staticFile } from "remotion";
import { CAPTION_FONT_ASSETS } from "../Basic/catalog";
import { nameFont } from "../Script/fontNames";

// Shared by the editor preloader and renderer: one download/FontFace per face.
const fonts = new Map<string, Promise<void>>();
/** A render on AWS has no website to ask, so the editor's font links read the copy bundled with the site. */
const fontUrl = (src: string) => {
  const id = src.match(/^\/api\/caption-assets\/([\w-]+)$/)?.[1];
  const file = id && getRemotionEnvironment().isRendering ? CAPTION_FONT_ASSETS[id] : undefined;
  return file ? staticFile(file) : src;
};
export function captionFontFamily(
  src: string,
  family: string,
  weight: number,
  italic = false,
) {
  if (!src) return family;
  let hash = 0;
  let second = 0x811c9dc5;
  for (const character of JSON.stringify([src, family, weight, italic])) {
    const code = character.charCodeAt(0);
    hash = (Math.imul(hash, 31) + code) | 0;
    second = Math.imul(second ^ code, 16777619);
  }
  return nameFont(`BasicCaption-${hash >>> 0}-${second >>> 0}`, family, src);
}
export function loadCaptionFont(
  src: string,
  family: string,
  weight: number,
  italic = false,
): Promise<void> {
  if (!src || typeof FontFace === "undefined") return Promise.resolve();
  const alias = captionFontFamily(src, family, weight, italic);
  let pending = fonts.get(alias);
  if (!pending) {
    pending = (async () => {
      const face = new FontFace(alias, `url(${JSON.stringify(fontUrl(src))})`, {
        weight: String(weight),
        style: italic ? "italic" : "normal",
      });
      await face.load();
      document.fonts.add(face);
    })().catch((error) => {
      fonts.delete(alias);
      throw error;
    });
    fonts.set(alias, pending);
  }
  return pending;
}
