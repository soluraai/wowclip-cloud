export type PaletteMode = "custom" | "brand" | "gold" | "mint" | "coral";
export type PaletteSettings = { mode: PaletteMode; brandColor: string };

export const validBrandColor = (value: unknown): string => {
  if (typeof value !== "string") return "#68e0cf";
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex.slice(1).split("").map((digit) => digit + digit).join("")}`;
  return "#68e0cf";
};

const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const tint = (hex: string, white: number) => `#${rgb(hex).map((channel) =>
  Math.round(channel + (255 - channel) * white).toString(16).padStart(2, "0")).join("")}`;
const luminance = (hex: string) => rgb(hex).map((channel) => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

/** A brand hue accents meaning, not every word. Dark hues become readable tints. */
export const resolvePalette = (settings: PaletteSettings, textColor: string, heroColor: string) => {
  if (settings.mode === "custom") return { textColor, heroColor, shineColor: "#ffffff" };
  const source = settings.mode === "gold" ? "#ffd166" : settings.mode === "mint" ? "#68e0cf"
    : settings.mode === "coral" ? "#ff7a70" : settings.brandColor;
  let accent = source;
  for (let white = 0.05; luminance(accent) < 0.42 && white <= 1; white += 0.05) {
    accent = tint(source, white);
  }
  return {
    heroColor: accent,
    textColor: settings.mode === "gold" ? "#fff7e8" : tint(source, 0.96),
    shineColor: tint(accent, 0.86),
  };
};
