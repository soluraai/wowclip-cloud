import { clamp, finite, isRecord } from "../CaptionEngine/types";
import type { FlowNumber } from "./types";

export const segmentNumber = (input: unknown): FlowNumber | null => {
  if (!isRecord(input) || typeof input.value !== "number" || !Number.isFinite(input.value) || Math.abs(input.value) > Number.MAX_SAFE_INTEGER) return null;
  let prefix = typeof input.prefix === "string" ? input.prefix : "";
  let suffix = typeof input.suffix === "string" ? input.suffix : "";
  let divisor = 1;
  let grouping: FlowNumber["grouping"] = "none";
  if (input.format === "currency") { prefix ||= "₹"; grouping = "indian"; }
  if (input.format === "comma") grouping = "western";
  if (input.format === "percentage" && !suffix.includes("%")) suffix += "%";
  if (input.format === "compact") {
    const absolute = Math.abs(input.value);
    const unit = absolute >= 1e9 ? [1e9, "B"] : absolute >= 1e6 ? [1e6, "M"] : absolute >= 1e3 ? [1e3, "K"] : [1, ""];
    divisor = Number(unit[0]); suffix = String(unit[1]) + suffix;
  }
  return { value: input.value, decimals: Math.round(clamp(finite(input.decimals, 0), 0, 6)),
    prefix, suffix, divisor, grouping, devanagari: false };
};

export const textNumber = (text: string): FlowNumber | null => {
  const digits = text.replace(/[०-९]/g, (char) => String(char.charCodeAt(0) - 0x0966));
  const match = digits.match(/^([₹$€£]?)([-+−]?\d[\d,]*(?:\.\d+)?)([%kKmMbBx×]?)[.!?;:]?$/u);
  if (!match) return null;
  const value = Number(match[2].replace(/,/g, "").replace("−", "-"));
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
  return { value, prefix: match[1], suffix: match[3], divisor: 1,
    decimals: Math.min(6, match[2].split(".")[1]?.length ?? 0),
    grouping: /^[-+]?\d{1,2}(?:,\d{2})+,\d{3}/.test(match[2]) ? "indian" : match[2].includes(",") ? "western" : "none",
    devanagari: /[०-९]/.test(text) };
};

export const formatFlowNumber = (number: FlowNumber, progress = 1) => {
  const parts = flowNumberParts(number, progress);
  return parts.prefix + parts.value + parts.suffix;
};

export const flowNumberParts = (number: FlowNumber, progress = 1, sourceText?: string) => {
  const value = number.value / number.divisor * clamp(progress, 0, 1);
  const locale = number.devanagari ? "hi-IN-u-nu-deva" : number.grouping === "indian" ? "en-IN" : "en-US";
  const punctuation = sourceText?.match(/[.!?;:]$/u)?.[0] ?? "";
  return { prefix: number.prefix, value: value.toLocaleString(locale, { useGrouping: number.grouping !== "none",
    minimumFractionDigits: number.decimals, maximumFractionDigits: number.decimals }),
    suffix: number.suffix + (punctuation && !number.suffix.endsWith(punctuation) ? punctuation : "") };
};
