import { useLayoutEffect, useMemo, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import { captionFontFamily, loadCaptionFont } from "../../BasicCaption/fonts";
import type { SignatureVariant } from "./engine";

export type SignatureFace = { family: string; src: string; weight: number; italic?: boolean };
export type SignatureFaces = { main: SignatureFace; text: SignatureFace; hindi: SignatureFace };
export const signatureAsset = (src: string) => /^(https?:|data:|blob:|\/)/i.test(src) ? src : staticFile(src);
const originals = {
  outfit: { family: "Outfit", src: "luxe/Outfit-Black.woff2", weight: 900 },
  inter: { family: "Inter", src: "reference-stack/Inter-800-normal.ttf", weight: 800 },
  serif: { family: "Playfair Display", src: "launch-caption-pack/fonts/playfairdisplay/PlayfairDisplay-Italic[wght].ttf", weight: 400, italic: true },
  sans: { family: "Inter", src: "launch-caption-pack/fonts/inter/Inter[opsz,wght].ttf", weight: 550 },
  hindi: { family: "Noto Sans Devanagari", src: "editorial-type/fonts/noto-sans-devanagari.ttf", weight: 800 },
};

export const useSignatureFaces = (variant: SignatureVariant, override: SignatureFace | undefined, needsHindi: boolean, helper?: SignatureFace) => {
  const key = JSON.stringify([variant, override, needsHindi, helper]);
  const faces = useMemo<SignatureFaces>(() => {
    const main = override ?? (variant === "ember-lock" ? originals.outfit : originals.inter);
    const text = helper ?? (variant === "ember-lock" ? originals.serif : originals.sans);
    return Object.fromEntries(Object.entries<SignatureFace>({ main, text, hindi: originals.hindi })
      .map(([name, face]) => [name, { ...face,
        family: captionFontFamily(signatureAsset(face.src), face.family, face.weight, face.italic),
      }])) as SignatureFaces;
  }, [override, variant, helper]);
  const [readyKey, setReadyKey] = useState("");
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false; let released = false;
    const handle = delayRender("Loading signature caption fonts");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const main = override ?? (variant === "ember-lock" ? originals.outfit : originals.inter);
    const text = helper ?? (variant === "ember-lock" ? originals.serif : originals.sans);
    const requested: SignatureFace[] = [main, text, ...(needsHindi ? [originals.hindi] : [])];
    void Promise.all(requested.map(face => loadCaptionFont(signatureAsset(face.src), face.family, face.weight, face.italic)))
      .then(() => { if (!disposed) setReadyKey(key); }).catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [key, override, helper, variant, needsHindi, delayRender, continueRender, cancelRender]);
  return { faces, ready: readyKey === key };
};
