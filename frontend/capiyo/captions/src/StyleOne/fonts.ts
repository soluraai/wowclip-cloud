import { staticFile } from "remotion";
import type { FontSpec, StyleOneConfig } from "./config";
import { nameFont } from "../Script/fontNames";

export const assetSource = (src: string): string =>
  /^(https?:|data:|blob:)/i.test(src) || src.startsWith("/") ? src : staticFile(src);

const hash = (text: string) => {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
};

/** Isolate uploaded fonts: changing a file cannot reuse another style's cached face. */
export const fontFamily = (font: FontSpec): string =>
  font.src ? nameFont(`StyleOne-${hash(JSON.stringify(font))}`, font.family, font.src) : font.family;

const pendingFonts = new Map<string, Promise<void>>();

const ensureFont = (font: FontSpec): Promise<void> => {
  const key = JSON.stringify(font);
  const pending = pendingFonts.get(key);
  if (pending) return pending;
  const promise = (async () => {
    if (!font.src) {
      await document.fonts.load(`${font.style ?? "normal"} ${font.weight} 256px ${JSON.stringify(font.family)}`);
      return;
    }
    const sources = [{ src: font.src, unicodeRange: undefined }, ...(font.extraSources ?? [])];
    const faces = await Promise.all(sources.map(async (source) => {
      const face = new FontFace(fontFamily(font), `url(${JSON.stringify(assetSource(source.src))})`, {
        weight: String(font.weight), style: font.style ?? "normal",
        ...(source.unicodeRange ? { unicodeRange: source.unicodeRange } : {}),
      });
      try {
        return await face.load();
      } catch (error) {
        throw new Error(`Unable to load Style One font "${font.family}" from "${source.src}": ${String(error)}`);
      }
    }));
    // Register the complete family in source order. A slow/missing subset must
    // neither change face priority nor leave a half-loaded family on retry.
    faces.forEach((face) => document.fonts.add(face));
  })();
  pendingFonts.set(key, promise);
  // A retry after a missing-file fix must not reuse a rejected promise.
  void promise.catch(() => pendingFonts.delete(key));
  return promise;
};

export const ensureStyleOneFonts = (config: StyleOneConfig): Promise<void> =>
  Promise.all([config.fonts.hero, config.fonts.helper, config.fonts.soft, config.fonts.plain]
    .map(ensureFont)).then(() => undefined);
