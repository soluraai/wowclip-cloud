import { staticFile } from "remotion";

export const SARA_FONTS = [
  // The supplied italic master has its own family alias; never synthesize a slant or bold.
  { family: "Sara Archive Garamond", path: "sara/fonts/ArchiveGaramondPro-Italic.ttf", weight: "400" },
  { family: "Sara Hindi", path: "coral-story/fonts/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", weight: "100 900" },
];
const asset = (src: string) => {
  if (/^(https?:|data:|blob:|\/)/i.test(src)) return src;
  try { return staticFile(src); } catch { return `/${src}`; }
};
let ready: Promise<void> | undefined;
export const loadSaraFonts = () => {
  if (!ready) {
    ready = Promise.all(SARA_FONTS.map(async font => {
      const face = new FontFace(font.family, `url(${JSON.stringify(asset(font.path))})`, { weight: font.weight });
      document.fonts.add(await face.load());
    })).then(() => undefined);
    void ready.catch(() => { ready = undefined; });
  }
  return ready;
};
export const saraFamily = (_text: string) => "Sara Archive Garamond";
