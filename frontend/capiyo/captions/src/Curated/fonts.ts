import { useLayoutEffect, useMemo, useState } from "react";
import { useDelayRender } from "remotion";
import { captionFontFamily, loadCaptionFont } from "../BasicCaption/fonts";
import { signatureAsset, type SignatureFace } from "../Premium/Signature/fonts";
import type { CuratedVariant } from "./layout";

export type CuratedFaces = { main: SignatureFace; sans: SignatureFace; serif: SignatureFace; hindi: SignatureFace };
export const CURATED_FONTS = {
  montserrat: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 900 },
  redSans: { family: "Montserrat", src: "launch-caption-pack/fonts/montserrat/Montserrat[wght].ttf", weight: 700 },
  poppins: { family: "Poppins", src: "launch-caption-pack/fonts/poppins/Poppins-Medium.ttf", weight: 500 },
  jakarta: { family: "Plus Jakarta Sans", src: "launch-caption-pack/fonts/plusjakartasans/PlusJakartaSans.ttf", weight: 800 },
  jakartaLight: { family: "Plus Jakarta Sans", src: "launch-caption-pack/fonts/plusjakartasans/PlusJakartaSans.ttf", weight: 400 },
  outfit: { family: "Outfit", src: "luxe/Outfit-Black.woff2", weight: 900 },
  roboto: { family: "Roboto", src: "editorial-type/fonts/roboto-variable.ttf", weight: 700 },
  instrument: { family: "Instrument Serif", src: "style-two/fonts/instrument-serif-italic.ttf", weight: 400, italic: true },
  serif: { family: "Playfair Display", src: "launch-caption-pack/fonts/playfairdisplay/PlayfairDisplay-Italic[wght].ttf", weight: 700, italic: true },
  hindi: { family: "Noto Sans Devanagari", src: "editorial-type/fonts/noto-sans-devanagari.ttf", weight: 700 },
} satisfies Record<string, SignatureFace>;

export const curatedFontSet = (variant: CuratedVariant): CuratedFaces => ({
  main: variant === "luma-script" || variant === "verse-flow" ? CURATED_FONTS.roboto : variant === "red-wipe" || variant === "hind" ? CURATED_FONTS.serif :
    variant === "creator" ? CURATED_FONTS.montserrat : variant === "dynamic-simple" ? CURATED_FONTS.jakarta : CURATED_FONTS.outfit,
  sans: variant === "red-wipe" ? CURATED_FONTS.redSans : variant === "creator" ? CURATED_FONTS.montserrat : variant === "relay-flow" ? CURATED_FONTS.outfit :
    variant === "hind" ? CURATED_FONTS.poppins : CURATED_FONTS.jakartaLight,
  serif: variant === "luma-script" || variant === "verse-flow" ? CURATED_FONTS.instrument : CURATED_FONTS.serif,
  hindi: CURATED_FONTS.hindi,
});

export const useCuratedFaces = (variant: CuratedVariant, override: SignatureFace | undefined, needsHindi: boolean, keyFace?: SignatureFace,
  picked?: Partial<Pick<CuratedFaces, "main" | "sans" | "serif">>) => {
  const originals = useMemo(() => ({ ...curatedFontSet(variant), ...(override ? { main: override } : {}), ...(keyFace ? { serif: keyFace } : {}),
    ...(picked?.main ? { main: picked.main } : {}), ...(picked?.sans ? { sans: picked.sans } : {}), ...(picked?.serif ? { serif: picked.serif } : {}) }),
    [variant, override, keyFace, picked]);
  const key = JSON.stringify([originals, needsHindi]);
  const faces = useMemo(() => Object.fromEntries(Object.entries(originals).map(([role, face]) => [role, {
    ...face, family: captionFontFamily(signatureAsset(face.src), face.family, face.weight, face.italic),
  }])) as CuratedFaces, [originals]);
  const [loaded, setLoaded] = useState("");
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  useLayoutEffect(() => {
    let disposed = false, released = false;
    const handle = delayRender("Loading curated caption fonts");
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const mixed = variant === "luma-script" || variant === "verse-flow";
    void Promise.all(Object.entries(originals).filter(([role]) => (role !== "serif" || mixed) &&
      (role !== "sans" || !mixed) && (role !== "hindi" || needsHindi))
      .map(([, f]) => loadCaptionFont(signatureAsset(f.src), f.family, f.weight, f.italic)))
      .then(() => { if (!disposed) setLoaded(key); }).catch(error => { if (!disposed) cancelRender(error); }).finally(release);
    return () => { disposed = true; release(); };
  }, [originals, key, needsHindi, variant, delayRender, continueRender, cancelRender]);
  return { faces, ready: loaded === key };
};
