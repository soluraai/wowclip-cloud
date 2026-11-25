import type { NeonNumber } from "./types";

const digits = (text: string) => text.replace(/[०-९]/g, (char) => String(char.charCodeAt(0) - 0x0966));

/** Preserve the source's units, decimals, sign, currency and grouping convention. */
export const parseNeonNumber = (text: string): NeonNumber | null => {
  const normalized = digits(text.trim());
  const match = normalized.match(/^([₹$€£]?\s*[+−-]?)(\d[\d,]*(?:\.\d+)?)(\s*(?:[kKmMbB]|%|x|×|लाख|करोड़|हज़ार|हजार|crore|lakh|million|billion)?)[.!?;:]?$/u);
  if (!match) return null;
  const value = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.trunc(value))) return null;
  return {
    value,
    decimals: Math.min(6, match[2].split(".")[1]?.length ?? 0),
    prefix: match[1],
    suffix: match[3],
    grouping: match[2].includes(","),
    indianGrouping: /^\d{1,2}(?:,\d{2})+,\d{3}/.test(match[2]),
    devanagari: /[०-९]/.test(text),
  };
};

export const formatNeonNumber = (number: NeonNumber, progress: number): string => {
  const p = Math.min(1, Math.max(0, progress));
  const factor = 10 ** number.decimals;
  const value = Math.round(number.value * p * factor) / factor;
  // Explicit locale keeps Chromium and Node renders identical.
  const formatted = value.toLocaleString(number.devanagari ? "hi-IN-u-nu-deva" : number.indianGrouping ? "en-IN" : "en-US", {
    useGrouping: number.grouping,
    minimumFractionDigits: number.decimals,
    maximumFractionDigits: number.decimals,
  });
  return `${number.prefix}${formatted}${number.suffix}`;
};
