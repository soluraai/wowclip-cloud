import { staticFile } from "remotion";
import type { StyleTwoAppearance, StyleTwoFont } from "./config";
import { nameFont } from "../Script/fontNames";

export const assetSource = (src: string) =>
  /^(https?:|data:|blob:)/i.test(src) || src.startsWith("/")
    ? src
    : staticFile(src);
const hash = (value: string) => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(36);
};
export const fontFamily = (font: StyleTwoFont) =>
  font.src ? nameFont(`StyleTwo-${hash(JSON.stringify(font))}`, font.family, font.src) : font.family;
const pending = new Map<string, Promise<void>>();
const load = (font: StyleTwoFont) => {
  const key = JSON.stringify(font),
    cached = pending.get(key);
  if (cached) return cached;
  const promise = (async () => {
    if (!font.src) {
      await document.fonts.load(
        `${font.style} ${font.weight} 96px ${JSON.stringify(font.family)}`,
      );
      return;
    }
    const face = new FontFace(
      fontFamily(font),
      `url(${JSON.stringify(assetSource(font.src))})`,
      { weight: String(font.weight), style: font.style },
    );
    await face.load();
    document.fonts.add(face);
  })();
  pending.set(key, promise);
  void promise.catch(() => pending.delete(key));
  return promise;
};
/** Missing custom fonts use visible system fallbacks rather than cancelling the entire preview. */
export const ensureStyleTwoFonts = async (
  fonts: StyleTwoAppearance["fonts"],
) => {
  const results = await Promise.all(
    [fonts.body, fonts.highlight].map(async (font, index) => {
      try {
        await load(font);
        return [];
      } catch {
        return [
          `${index ? "Highlight" : "Body"} font unavailable; using the system fallback.`,
        ];
      }
    }),
  );
  return results.reduce<string[]>((all, messages) => all.concat(messages), []);
};
