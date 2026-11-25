import { staticFile } from "remotion";

export const serifGlowFont = "SerifGlowGeorgia";
const HINDI_SERIF = "launch-caption-pack/fonts/notoserifdevanagari/NotoSerifDevanagari[wdth,wght].ttf";

let pending: Promise<void> | undefined;

// Gelasio is a free (OFL) font with Georgia's measurements, bundled so the editor and every render (AWS has no
// Georgia) draw the same letters.
const GELASIO = "serif-glow/Gelasio[wght].ttf";

/** Georgia's look from the bundled Gelasio, the same on every computer and on AWS. */
export const ensureSerifGlowFont = () => {
  if (pending) return pending;
  pending = (async () => {
    const face = new FontFace(serifGlowFont, `url(${JSON.stringify(staticFile(GELASIO))})`, {
      weight: "400", style: "normal",
    });
    await face.load();
    document.fonts.add(face);
    // Gelasio has no Hindi letters, so those alone come from a serif of the same family name.
    const hindi = new FontFace(serifGlowFont, `url(${JSON.stringify(staticFile(HINDI_SERIF))})`, {
      weight: "100 900", style: "normal", unicodeRange: "U+0900-097F, U+200C-200D",
    });
    await hindi.load().then(() => document.fonts.add(hindi)).catch(() => undefined);
  })();
  void pending.catch(() => { pending = undefined; });
  return pending;
};
