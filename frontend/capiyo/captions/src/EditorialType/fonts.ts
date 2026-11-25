import { staticFile } from "remotion";
import type { EditorialRole } from "./types";
import type { FlowLook } from "../SmartTextFlow/types";

// Real italic masters: no browser-generated skew or synthetic bold.
export const editorialFontSpecs = [
  { family: "EditorialRoboto", src: "editorial-type/fonts/roboto-variable.ttf", weight: "100 900", style: "normal" },
  { family: "EditorialRoboto", src: "editorial-type/fonts/roboto-italic-variable.ttf", weight: "100 900", style: "italic" },
  { family: "EditorialScript", src: "editorial-type/fonts/pinyon-script.ttf", weight: "400", style: "normal" },
  { family: "EditorialDevanagari", src: "editorial-type/fonts/noto-sans-devanagari.ttf", weight: "100 900", style: "normal" },
];
/** A word's face: its role's own, or the font picked in the editor for the main word or the small text (`look`). */
export const editorialFont = (role: EditorialRole, look?: FlowLook) => ({
  family: look?.family ? `${JSON.stringify(look.family)}, "EditorialDevanagari", sans-serif`
    : role === "serif" ? '"EditorialScript", "EditorialDevanagari", cursive' : '"EditorialRoboto", "EditorialDevanagari", sans-serif',
  weight: look?.family ? look.weight ?? 400 : role === "body" ? 300 : role === "serif" ? 400 : role === "number" ? 650 : 900,
  style: look?.family && look.italic ? "italic" as const : "normal" as const,
  tracking: role === "serif" ? 0 : role === "number" ? -0.02 : role === "body" ? -0.035 : -0.04,
});
let pending: Promise<void> | null = null;
export const ensureEditorialFonts = () => {
  if (pending) return pending;
  pending = Promise.all(editorialFontSpecs.map(async (font) => {
    const face = new FontFace(font.family, `url(${JSON.stringify(staticFile(font.src))})`, { weight: font.weight, style: font.style });
    await face.load(); document.fonts.add(face);
  })).then(() => undefined);
  void pending.catch(() => { pending = null; });
  return pending;
};
