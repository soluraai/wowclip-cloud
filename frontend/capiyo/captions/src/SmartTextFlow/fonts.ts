import { staticFile } from "remotion";
import type { FlowLook, FlowRole } from "./types";

export const flowFontSpecs = [
  { family: "SmartFlowInter", src: "reference-stack/inter-latin-600-normal.ttf", weight: "600", style: "normal" },
  { family: "SmartFlowInter", src: "reference-stack/Inter-800-normal.ttf", weight: "800", style: "normal" },
  { family: "SmartFlowSerif", src: "style-two/fonts/instrument-serif-italic.ttf", weight: "400", style: "italic" },
  { family: "SmartFlowScript", src: "style-one/fonts/caveat-variable.ttf", weight: "700", style: "normal" },
  { family: "SmartFlowHindi", src: "style-one/fonts/poppins-devanagari-800-normal.woff2", weight: "800", style: "normal" },
];
const baseFont = (role: FlowRole) => ({
  family: role === "script" ? '"SmartFlowScript", "SmartFlowHindi", cursive' : role === "expressive" ? '"SmartFlowSerif", "SmartFlowHindi", serif' : '"SmartFlowInter", "SmartFlowHindi", sans-serif',
  weight: role === "script" ? 700 : role === "expressive" ? 400 : role === "body" ? 600 : 800,
  style: role === "expressive" ? "italic" as const : "normal" as const,
  scale: role === "number" ? 1.72 : role === "expressive" ? 1.27 : role === "script" ? 1.35 : 1,
  tracking: role === "expressive" ? -0.005 : -0.025,
});
/** The role's face, with a picked font and extra letter spacing on top when the editor has them. */
export const flowFont = (role: FlowRole, look?: FlowLook) => {
  const base = baseFont(role);
  if (!look) return base;
  return { ...base,
    ...(look.family ? { family: `"${look.family}", "SmartFlowHindi", sans-serif`, weight: look.weight ?? 400,
      style: look.italic ? "italic" as const : "normal" as const } : {}),
    tracking: base.tracking + (look.tracking ?? 0) };
};
let pending: Promise<void> | null = null;
export const ensureFlowFonts = () => {
  if (pending) return pending;
  pending = Promise.all(flowFontSpecs.map(async (font) => {
    const face = new FontFace(font.family, `url(${JSON.stringify(staticFile(font.src))})`, { weight: font.weight, style: font.style });
    await face.load(); document.fonts.add(face);
  })).then(() => undefined);
  void pending.catch(() => { pending = null; });
  return pending;
};
