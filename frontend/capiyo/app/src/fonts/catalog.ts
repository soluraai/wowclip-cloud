import bundled from "./bundled.json";
export type FontFamily = {
  id: string;
  family: string;
  source: "local" | "google" | "upload";
  category: string;
  subsets: string[];
  files: Record<string, string>;
  weights?: number[];
  previewSrc?: string;
  fallback?: boolean;
  faces?: FontFaceOption[];
};
export type FontFaceOption = {
  value: string;
  label: string;
  weight: number;
  italic: boolean;
  src: string;
};
const names: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};
const styleFont = (
  family: string,
  asset: string,
  category: string,
  weights: number[],
): FontFamily => {
  const src = `/api/caption-assets/basic-${asset}`;
  return {
    id: `style-${asset}`,
    family,
    source: "local",
    category,
    subsets: ["latin"],
    files: {},
    previewSrc: src,
    faces: weights.map((weight) => ({
      value: String(weight),
      label: names[weight] ?? String(weight),
      weight,
      italic: false,
      src,
    })),
  };
};
// Fonts the caption styles ship with, so each style's own font shows up selected in the picker.
export const LOCAL_FONTS = bundled as FontFamily[];
export const STYLE_FONTS: FontFamily[] = [
  styleFont("IntegralCF", "integral", "display", [900]),
  styleFont("The Bold Font", "theboldfont", "display", [800]),
  styleFont("Instrument Sans", "instrument", "sans-serif", [400, 500, 600, 700]),
  styleFont("IBM Plex Mono", "plexmono", "monospace", [400, 500, 600]),
  styleFont("Newsreader", "serif", "serif", [400, 500, 600, 700]),
  styleFont("Redressed", "redressed", "handwriting", [400]),
  styleFont("Gorva", "gorva", "serif", [400]),
];
export function fontFaces(font: FontFamily): FontFaceOption[] {
  if (font.faces)
    return [...font.faces].sort(
      (a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight,
    );
  const faces: FontFaceOption[] = [];
  if (font.weights?.length === 2) {
    for (const italic of [false, true]) {
      const src = font.files[italic ? "italic" : "regular"];
      if (!src) continue;
      const min = Math.max(100, font.weights[0]),
        max = Math.min(900, font.weights[1]);
      const weights = [
        ...new Set([
          min,
          ...Object.keys(names)
            .map(Number)
            .filter((w) => w >= min && w <= max),
          max,
        ]),
      ];
      for (const weight of weights)
        faces.push({
          value: `${weight}${italic ? "i" : ""}`,
          label: `${names[weight] ?? weight}${italic ? " Italic" : ""}`,
          weight,
          italic,
          src,
        });
    }
  } else {
    for (const [variant, src] of Object.entries(font.files)) {
      const italic = variant.includes("italic");
      const weight = parseInt(variant, 10) || 400;
      if (weight < 100 || weight > 900) continue;
      faces.push({
        value: `${weight}${italic ? "i" : ""}`,
        label: `${names[weight] ?? weight}${italic ? " Italic" : ""}`,
        weight,
        italic,
        src,
      });
    }
  }
  return faces.sort(
    (a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight,
  );
}
export function closestFace(font: FontFamily, weight = 800, italic = false) {
  return fontFaces(font).sort(
    (a, b) =>
      Number(a.italic !== italic) * 2000 +
      Math.abs(a.weight - weight) -
      (Number(b.italic !== italic) * 2000 + Math.abs(b.weight - weight)),
  )[0];
}
let catalog: Promise<FontFamily[]> | undefined;
export function loadGoogleCatalog() {
  if (!catalog)
    catalog = fetch("/fonts/google-catalog.json")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Google Fonts catalogue is unavailable.");
        const data = (await response.json()) as {
          version: number;
          families: FontFamily[];
        };
        if (data.version !== 1 || !Array.isArray(data.families))
          throw new Error("Google Fonts catalogue is invalid.");
        return data.families;
      })
      .catch((error) => {
        catalog = undefined;
        throw error;
      });
  return catalog;
}
export function resolveFontAsset(family: string, weight = 800, italic = false) {
  const font = LOCAL_FONTS.find((font) => font.family === family);
  return font ? (closestFace(font, weight, italic)?.src ?? "") : "";
}
