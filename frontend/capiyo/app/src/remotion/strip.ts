import { resolveEffects, type CaptionSettings } from "../app/captionSettings";

/** Past this share of the frame a strip saves little, so the caption renders full height. */
const FULL_HEIGHT_SHARE = 0.6;
/** Room for every entrance and exit (blur, pop, slide, flip), in em of the caption's size. */
const MOTION_EM = 1.6;
/** The widest tilt each rotating motion in BasicCaption/motion.ts reaches. */
const SWING_DEGREES: Record<string, number> = { spin: 16, wobble: 12, tada: 8, swing: 20, roll: 40, spinout: 16, fall: 6 };

/**
 * The band of the frame a caption can paint into, for the transparent strip render. It follows the
 * user's own settings, so a bigger size, a tilt, a shadow, glow or 3D depth grows the strip instead of
 * being cut. `largestSize` is the biggest size any single word was given; `lines` the most lines a page shows.
 */
export function captionStrip({ settings, width, height, largestSize = settings.size, lines = 1 }: {
  settings: CaptionSettings;
  width: number;
  height: number;
  largestSize?: number;
  lines?: number;
}): { top: number; height: number } {
  const unit = width / 1080;
  // Editor sizes are a quarter of the 1080-wide render's pixels.
  const fontPx = Math.max(settings.size, largestSize) * 4 * unit;
  const textH = fontPx * (settings.lineSpacing ?? 1.2) * Math.max(1, lines);
  const textW = Math.min(width, (settings.maxWidth ?? 0.9) * width);
  const { animation } = settings;
  const motions = animation ? [animation.in, animation.out, animation.keyIn ?? "none", animation.keyOut ?? "none"] : [];
  const moves = settings.motion !== "none" || motions.some((name) => name !== "none" && name !== "same");
  // A tilting entrance or exit swings the words further than the user's own tilt.
  const swing = Math.max(0, ...motions.map((name) => SWING_DEGREES[name] ?? 0));
  const angle = (Math.min(90, Math.abs(settings.rotation ?? 0) + swing) * Math.PI) / 180;
  const boxH = textW * Math.sin(angle) + textH * Math.cos(angle);

  const fx = resolveEffects(settings.effects);
  const px = (editor: number) => editor * 4 * unit;
  const effects = Math.max(
    fx.shadow.on ? px(Math.abs(fx.shadow.y) + fx.shadow.blur * 2) : 0,
    // Glow is drawn twice, so it spreads further than one blur.
    fx.glow.on ? px(fx.glow.blur * 3) : 0,
    fx.depth.on ? px(fx.depth.length) : 0,
  ) + (fx.stroke.on ? px(fx.stroke.width) : 0);
  // Still captions only need room for their ascenders and the small slide-up.
  const pad = (moves ? MOTION_EM : 0.3) * fontPx + effects;

  const center = (settings.y / 100) * height;
  let top = Math.max(0, Math.floor((center - boxH / 2 - pad) / 2) * 2);
  const bottom = Math.min(height, Math.ceil((center + boxH / 2 + pad) / 2) * 2);
  if (bottom - top > height * FULL_HEIGHT_SHARE) return { top: 0, height };
  // Captions dragged off the frame still leave a strip of at least one line.
  top = Math.min(top, Math.max(0, bottom - 2));
  return { top, height: Math.max(2, bottom - top) };
}
