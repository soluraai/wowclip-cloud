import { fitHelperPockets } from "./StyleOne/pockets";
import type { Ink } from "./StyleOne/metrics";

type NestRun = {
  text: string; x: number; y: number; size: number; family: string; style: string;
  weight: number; tracking: number; ink: { left: number; right: number; ascent: number; descent: number };
  anchored?: boolean; nested?: boolean;
};
type Profile = { left: number; baseline: number; ink: Ink };
const profiles = new Map<string, Profile>();

/** Sample the exact fonts and individual word origins used by Luxe's SVG. */
const profile = (runs: NestRun[]): Profile => {
  const key = JSON.stringify(runs.map(run => [run.text, run.x, run.y, run.size, run.family, run.style, run.weight, run.tracking]));
  const cached = profiles.get(key);
  if (cached) return cached;
  const baseline = runs[0].y;
  const left = Math.floor(Math.min(...runs.map(run => run.x - run.ink.left))) - 2;
  const right = Math.ceil(Math.max(...runs.map(run => run.x + run.ink.right))) + 2;
  const top = Math.floor(Math.min(...runs.map(run => run.y - baseline - run.ink.ascent))) - 2;
  const bottom = Math.ceil(Math.max(...runs.map(run => run.y - baseline + run.ink.descent))) + 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, right - left); canvas.height = Math.max(1, bottom - top);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Luxe needs a canvas to fit its letter contours.");
  ctx.fillStyle = "white"; ctx.textBaseline = "alphabetic"; ctx.fontKerning = "normal";
  for (const run of runs) {
    ctx.font = `${run.style} ${run.weight} ${run.size}px "${run.family}"`;
    ctx.letterSpacing = `${run.tracking}px`;
    ctx.fillText(run.text, run.x - left, run.y - baseline - top);
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const skyline: Ink["skyline"] = [];
  for (let x = 0; x < canvas.width; x++) {
    let first = Infinity, last = -Infinity;
    for (let y = 0; y < canvas.height; y++) if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
      first = Math.min(first, y + top); last = y + top + 1;
    }
    skyline.push({ top: first, bottom: last });
  }
  const result = { left, baseline, ink: { left: 0, right: canvas.width, width: canvas.width,
    top, bottom, height: bottom - top, advance: canvas.width,
    cap: Math.max(8, runs[0].size * .7), step: 1, skyline } };
  if (profiles.size >= 128) profiles.delete(profiles.keys().next().value as string);
  profiles.set(key, result);
  return result;
};

/** Use StyleOne's contour-aware search; keep the original layout if no readable pocket exists. */
export const nestLuxeHelper = <T extends NestRun>(main: T[], helpers: T[], side: -1 | 1,
  availableWidth: number, seed: string): boolean => {
  if (!main.length || !helpers.length) return false;
  const hero = profile(main);
  const part = (runs: T[]) => {
    const contour = profile(runs);
    return { value: { runs, contour }, ink: contour.ink, words: runs.length };
  };
  const partitions: ReturnType<typeof part>[][] = [[part(helpers)]];
  if (helpers.length > 1) {
    for (let cut = 1; cut < helpers.length; cut++) {
      partitions.push([part(helpers.slice(0, cut)), part(helpers.slice(cut))]);
    }
    if (helpers.length >= 4) {
      for (let c1 = 1; c1 < helpers.length - 1; c1++) {
        for (let c2 = c1 + 1; c2 < helpers.length; c2++) {
          partitions.push([part(helpers.slice(0, c1)), part(helpers.slice(c1, c2)), part(helpers.slice(c2))]);
        }
      }
    }
  }
  const fitted = fitHelperPockets({ partitions,
    obstacles: [{ x: 0, width: hero.ink.width, top: hero.ink.top, bottom: hero.ink.bottom, ink: hero.ink, baseline: 0 }],
    heroWidth: hero.ink.width, availableWidth, preferredSide: side, allowOtherSide: false,
    sideClearance: .05, gapRatio: .07, overhang: .08, minGain: .02,
    splitPenalty: .15, variation: .3, seed });
  if (!fitted) return false;
  const placements = fitted.pieces.flatMap(piece => piece.part.value.runs.map(run => ({ run,
    x: run.x + hero.left + piece.x - piece.part.value.contour.left,
    y: hero.baseline + piece.baseline + run.y - piece.part.value.contour.baseline })));
  const left = Math.min(...placements.map(item => item.x - item.run.ink.left));
  const right = Math.max(...placements.map(item => item.x + item.run.ink.right));
  if (left < (720 - availableWidth) / 2 || right > (720 + availableWidth) / 2) return false;
  for (const placed of placements) {
    placed.run.x = placed.x; placed.run.y = placed.y;
    placed.run.anchored = true; placed.run.nested = true;
  }
  main.forEach(run => { run.nested = true; });
  return true;
};
