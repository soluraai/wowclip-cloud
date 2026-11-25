import { createContext, useLayoutEffect, useMemo, useState } from "react";
import { useDelayRender } from "remotion";
import { captionFontFamily, loadCaptionFont } from "../BasicCaption/fonts";
import { NO_SIZES, sizeScale, type PartSizes } from "./sizes";

export { chosenEntrance } from "../BasicCaption/motion";

/**
 * Every Premium style is built from the same text parts: the main word, the helper text around it
 * and, in Maroon King, a script line. What a user picks for a part arrives here; anything missing
 * keeps the design's own look.
 */
export type PartRole = "main" | "helper" | "script";
export type PartGradient = { stops: { color: string; position: number }[]; angle: number };
export type PartLook = {
  family?: string; src?: string; weight?: number; italic?: boolean;
  color?: string; gradient?: PartGradient;
  /** This part's size against the design's, 1 being the design's own. */
  scale?: number;
  /** Extra letter spacing for this part alone, as a share of its size. */
  tracking?: number;
  /** Text case picked for this part; missing keeps the design's. */
  textCase?: "preserve" | "uppercase" | "lowercase";
  /** Extra gap between this part's words, as a share of its size. */
  wordGap?: number;
};
/** A part's text in the case picked for it, else the design's own case. */
export const partCase = (text: string, picked: PartLook["textCase"], design: (text: string) => string = (t) => t) =>
  picked === "uppercase" ? text.toUpperCase() : picked === "lowercase" ? text.toLowerCase() : picked === "preserve" ? text : design(text);
export type PremiumParts = Partial<Record<PartRole | "plain", PartLook>>;
export type PartFace = { family: string; weight: number; italic: boolean };

const ROLES: PartRole[] = ["main", "helper", "script"];
const facePart = (look?: PartLook) => look?.family && look.src ? look : undefined;

export const partFace = (look?: PartLook): PartFace | undefined => {
  const part = facePart(look);
  if (!part) return undefined;
  const weight = part.weight ?? 400, italic = part.italic === true;
  return { family: captionFontFamily(part.src!, part.family!, weight, italic), weight, italic };
};

/** The faces the user picked, ready once loaded. Colors never touch this, so dragging one keeps the layout. */
export const usePartFonts = (parts: PremiumParts | undefined) => {
  const picked = ROLES.map(role => facePart(parts?.[role]));
  const key = JSON.stringify(picked.map(part => part && [part.family, part.src, part.weight, part.italic]));
  const [loaded, setLoaded] = useState("");
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const needed = picked.some(Boolean);
  useLayoutEffect(() => {
    if (!needed) return;
    let disposed = false, released = false;
    const handle = delayRender("Loading chosen caption fonts");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const faces = JSON.parse(key) as ([string, string, number | undefined, boolean | undefined] | null)[];
    void Promise.all(faces.map(face => face ? loadCaptionFont(face[1], face[0], face[2] ?? 400, face[3] === true) : undefined))
      .then(() => { if (!disposed) setLoaded(key); })
      .catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [key, needed, delayRender, continueRender, cancelRender]);
  const faces = useMemo(() => {
    const entries = JSON.parse(key) as ([string, string, number | undefined, boolean | undefined] | null)[];
    const face = (index: number) => {
      const entry = entries[index];
      return entry ? partFace({ family: entry[0], src: entry[1], weight: entry[2], italic: entry[3] }) : undefined;
    };
    return { main: face(0), helper: face(1), script: face(2) };
  }, [key]);
  return { faces, key, ready: !needed || loaded === key };
};

/**
 * A design's own faces with the fonts picked in the editor laid over them. by maps each of the design's
 * faces to the part whose pick replaces it. The result stays the same object until a pick changes.
 */
export const usePickedFaces = <Face extends { family: string; src: string; weight: number; italic?: boolean }, Role extends string>(
  design: Record<Role, Face>, parts: PremiumParts | undefined, by: Partial<Record<Role, PartRole | "plain">>,
): Record<Role, Face> => {
  const picks = Object.entries(by).map(([role, part]) => {
    const look = parts?.[part as PartRole];
    return look?.family && look.src ? [role, look.family, look.src, look.weight ?? 400, look.italic === true] as const : null;
  }).filter(Boolean) as (readonly [Role, string, string, number, boolean])[];
  const key = JSON.stringify(picks);
  return useMemo(() => {
    const chosen = JSON.parse(key) as [Role, string, string, number, boolean][];
    if (!chosen.length) return design;
    const faces = { ...design };
    for (const [role, family, src, weight, italic] of chosen) faces[role] = { ...design[role], family, src, weight, italic };
    return faces;
  }, [design, key]);
};

/** The size picks, stable until one changes, so a color drag never redoes a layout. */
export const usePartSizes = (presentation?: { parts?: PremiumParts; wordStyles?: Record<string, { sizeScale?: number }> }): PartSizes => {
  const parts = presentation?.parts;
  const words = Object.entries(presentation?.wordStyles ?? {}).flatMap(([id, word]) => word.sizeScale ? [[id, sizeScale(word.sizeScale)]] : []);
  const key = JSON.stringify({ main: sizeScale(parts?.main?.scale), helper: sizeScale(parts?.helper?.scale), script: sizeScale(parts?.script?.scale),
    plain: sizeScale(parts?.plain?.scale), words: Object.fromEntries(words) });
  return useMemo(() => JSON.parse(key) as PartSizes, [key]);
};

/** The same picks for renderers that aren't handed the presentation. */
export const PartSizesContext = createContext<PartSizes>(NO_SIZES);

const channels = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
const mix = (hex: string, target: number, amount: number) =>
  /^#[\da-f]{6}$/i.test(hex) ? toHex(channels(hex).map(value => value + (target - value) * amount)) : hex;
export const lighten = (hex: string, amount: number) => mix(hex, 255, amount);
export const darken = (hex: string, amount: number) => mix(hex, 0, amount);

/** SVG gradient endpoints for a CSS-style angle, over the painted word's own box. */
export const gradientLine = (angle: number) => {
  const radians = (angle - 90) * Math.PI / 180;
  const x = Math.cos(radians) / 2, y = Math.sin(radians) / 2;
  return { x1: .5 - x, y1: .5 - y, x2: .5 + x, y2: .5 + y };
};
