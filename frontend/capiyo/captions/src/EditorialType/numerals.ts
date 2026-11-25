export type EditorialNumberSlot = {
  prefixWidth: number; valueWidth: number; suffixWidth: number; affixSize: number; gap: number;
};
export type EditorialNumberRun = { text: string; x: number; size: number; center: boolean };

/** The complete figure shares one size and baseline, including grouping and decimals. */
export const editorialNumberRuns = (slot: EditorialNumberSlot, parts: { prefix: string; value: string; suffix: string }, x: number, size: number): EditorialNumberRun[] => {
  const runs: EditorialNumberRun[] = [];
  if (parts.prefix) runs.push({ text: parts.prefix, x: x + slot.gap, size: slot.affixSize, center: false });
  const start = x + slot.prefixWidth;
  runs.push({ text: parts.value, x: start + slot.valueWidth / 2, size, center: true });
  if (parts.suffix) runs.push({ text: parts.suffix, x: start + slot.valueWidth + slot.gap, size: slot.affixSize, center: false });
  return runs;
};

export const scaleEditorialNumber = (slot: EditorialNumberSlot, factor: number): EditorialNumberSlot => ({
  prefixWidth: slot.prefixWidth * factor, valueWidth: slot.valueWidth * factor, suffixWidth: slot.suffixWidth * factor,
  affixSize: slot.affixSize * factor, gap: slot.gap * factor,
});
