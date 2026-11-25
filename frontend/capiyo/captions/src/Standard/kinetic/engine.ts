import { normalizeWords } from "../../LaunchCaptionPack/timeline";
import type { CaptionSource, Cue, Word } from "../../LaunchCaptionPack/types";
import { finite } from "../../CaptionEngine/types";

export type KineticVariant = "crimson-rise" | "pocket-flow" | "prism-relay";
export type TypographyWord = Word & { sourceId: string };
export type TypographyCue = Omit<Cue, "words"> & { words: TypographyWord[]; heroFrom: number; heroTo: number; seed: number; serif: boolean };
export const cleanWord = (text: string) => text.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
export const bareWord = (text: string) => cleanWord(text).toLocaleLowerCase();
export const commonWords = new Set(("a an the and or but of for from in on at as to with by is am are was were be been being this that these those it its i my me we our they their he his she her you your can could would should will do does did have has had so just very not na nahi nahin hai hain hain. ho hua hui hue se ki ka ke ko mein me aur toh to par per pe apne apni apki aap tum ye yeh woh wo ek har bhi hi hain jab tab kar karna karte karta padta tha thi us is liye ab phir jo bas kya kyun").split(" "));
export const wordImportance = (word: Word) => (word.emphasis ? 100 : 0) +
  (commonWords.has(bareWord(word.text)) ? -20 : 4) + Math.min(12, [...cleanWord(word.text)].length);
export const textSeed = (text: string) => { let seed = 2166136261; for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619); return seed >>> 0; };

export function typographyWords(source: CaptionSource) {
  const normalized = normalizeWords(source);
  const words: TypographyWord[] = normalized.words.flatMap(word => {
    const pieces = word.text.match(/\S+/gu) ?? [];
    if (pieces.length < 2) return [{ ...word, sourceId: word.id }];
    // Phrase-only editor entries have no individual timestamps. Allocate their
    // existing interval proportionally; already word-timed sources stay exact.
    const weights = pieces.map(text => Math.max(2, [...text].length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let offset = 0;
    return pieces.map((text, index) => {
      const startMs = word.startMs + (word.endMs - word.startMs) * offset / total;
      offset += weights[index];
      return { ...word, text, sourceId: word.id, id: `${word.id}:token:${index}`, startMs,
        endMs: index === pieces.length - 1 ? word.endMs : word.startMs + (word.endMs - word.startMs) * offset / total,
        pageBreakAfter: index === pieces.length - 1 && word.pageBreakAfter };
    });
  });
  return { ...normalized, words };
}

export function compileTypography(source: CaptionSource, variant: KineticVariant | "fourfold") {
  const { words, diagnostics } = typographyWords(source);
  const box = variant === "fourfold";
  const red = variant === "crimson-rise";
  const maximum = box ? 12 : red ? 8 : 6;
  const targetWords = box ? 8 : red ? 6 : 4;
  const targetChars = box ? 42 : red ? 34 : 22;
  const segments: TypographyWord[][] = [];
  let segment: TypographyWord[] = [];
  const flush = () => { if (segment.length) segments.push(segment); segment = []; };
  for (const word of words) {
    const previous = segment[segment.length - 1];
    if (previous && word.startMs > previous.startMs && (previous.pageBreakAfter || previous.speaker !== word.speaker ||
      previous.event !== word.event || word.startMs - previous.endMs > (box ? 1400 : 650) ||
      !box && /[.!?।॥]["'”’)]?$/u.test(previous.text))) flush();
    segment.push(word);
  }
  flush();
  const pages: TypographyWord[][] = [];
  for (const entries of segments) {
    const costs = Array<number>(entries.length + 1).fill(Infinity);
    const cuts = Array<number>(entries.length + 1).fill(-1);
    costs[0] = 0;
    for (let start = 0; start < entries.length; start++) {
      if (!Number.isFinite(costs[start])) continue;
      let chars = 0;
      for (let end = start + 1; end <= entries.length; end++) {
        chars += entries[end - 1].text.length + (end > start + 1 ? 1 : 0);
        if (end - start > maximum && entries[end - 1].startMs > entries[start].startMs) break;
        if (entries[end]?.startMs === entries[end - 1].startMs) continue;
        const count = end - start;
        const duration = entries[end - 1].endMs - entries[start].startMs;
        const score = costs[start] + ((chars - targetChars) / targetChars) ** 2 * 3 +
          ((count - targetWords) / targetWords) ** 2 * 2 +
          (count === 1 && entries.length > 2 ? 8 : 0) + Math.max(0, duration - (box ? 5200 : 3200)) ** 2 / 1500000 + .35;
        if (score < costs[end]) { costs[end] = score; cuts[end] = start; }
      }
    }
    const result: TypographyWord[][] = [];
    for (let end = entries.length; end > 0;) {
      const start = Math.max(0, cuts[end]); result.unshift(entries.slice(start, end)); end = start;
    }
    pages.push(...result);
  }
  const cues: TypographyCue[] = pages.map((entries, index) => {
    const ranked = entries.map((word, i) => ({ word, i })).sort((a, b) => wordImportance(b.word) - wordImportance(a.word) || a.i - b.i);
    let heroFrom = ranked[0]?.i ?? 0;
    let heroTo = heroFrom + 1;
    if (!box && !red && heroTo < entries.length && !commonWords.has(bareWord(entries[heroTo].text)) &&
      entries.slice(heroFrom, heroTo + 1).map(word => word.text).join(" ").length < 18) heroTo++;
    if (!box && !red && heroFrom > 0 && /^(the|a|ye|yeh|koi)$/iu.test(bareWord(entries[heroFrom - 1].text))) heroFrom--;
    return { id: `${variant}-${entries[0].id}`, words: entries, heroFrom, heroTo,
      seed: textSeed(entries.map(word => word.text).join(" ")),
      serif: variant === "pocket-flow" && /^(kaam|work|life|love)$/iu.test(bareWord(entries[ranked[0]?.i ?? 0].text)),
      startMs: entries[0].startMs,
      endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + (box ? 160 : 130), pages[index + 1]?.[0].startMs ?? Infinity) };
  });
  return { words, cues, diagnostics, durationMs: Math.max(1000, finite(source.durationMs, 0), ...words.map(word => word.endMs + 160)) };
}
