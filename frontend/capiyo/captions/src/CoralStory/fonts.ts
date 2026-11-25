import { staticFile } from "remotion";

export const CORAL_FONTS = [
  { family: "Coral Roboto", path: "editorial-type/fonts/roboto-variable.ttf", weight: "100 900" },
  { family: "Coral Roboto Italic", path: "editorial-type/fonts/roboto-italic-variable.ttf", weight: "100 900" },
  { family: "Coral Hindi", path: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", weight: "100 900" },
];
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
let ready: Promise<void> | undefined;
export const loadCoralFonts = () => {
  if (!ready) {
    ready = Promise.all(CORAL_FONTS.map(async font => {
      const face = new FontFace(font.family, `url(${JSON.stringify(asset(font.path))})`, { weight: font.weight });
      document.fonts.add(await face.load());
    })).then(() => undefined);
    void ready.catch(() => { ready = undefined; });
  }
  return ready;
};
export const familyFor = (_text: string, italic = false) => italic ? "Coral Roboto Italic" : "Coral Roboto";
