/** How much bigger a short caption may be than the longest one. */
const SPREAD = 1.15;
/** One very long caption shouldn't shrink the whole video past this. */
const LOWEST = 0.65;

/**
 * Every caption fits its own text to the frame, so a long one ends up small and the next short one
 * huge. Given each caption's own fit (1 = full size), this is the largest fit any of them should use.
 */
/** The largest size that stays even: past it the longest word would need the box to shrink it. */
export const evenSizeLimit = (widestAtOnePx: number, boxWidth: number) => (boxWidth / Math.max(0.01, widestAtOnePx)) * SPREAD;

export const evenSizeCap = (fits: number[]) =>
  fits.length ? Math.min(1, Math.max(LOWEST, Math.min(...fits) * SPREAD)) : 1;
