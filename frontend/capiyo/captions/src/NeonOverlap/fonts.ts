import { staticFile } from "remotion";

export const neonFonts = {
  display: '"NeonOverlapDisplay", "NeonOverlapDevanagari", sans-serif',
  serif: '"NeonOverlapSerif", "NeonOverlapDevanagari", serif',
};

let pending: Promise<void> | null = null;
export const ensureNeonFonts = () => {
  if (pending) return pending;
  const specs = [
    ["NeonOverlapDisplay", "captions-dot/poppins-black.ttf", "900", "normal"],
    ["NeonOverlapSerif", "style-two/fonts/instrument-serif-italic.ttf", "400", "italic"],
    ["NeonOverlapDevanagari", "style-one/fonts/poppins-devanagari-800-normal.woff2", "800", "normal"],
  ];
  pending = Promise.all(specs.map(async ([family, file, weight, style]) => {
    const face = new FontFace(family, `url(${JSON.stringify(staticFile(file))})`, { weight, style });
    await face.load();
    document.fonts.add(face);
  })).then(() => undefined);
  void pending.catch(() => { pending = null; });
  return pending;
};
