import { normalizeWords } from "../LaunchCaptionPack/timeline";
import { finite } from "../LaunchCaptionPack/presets";
import type { CaptionSource, Word } from "../LaunchCaptionPack/types";
import type { SaraConfig, SaraCue } from "./types";

const VARIANTS = ["slide", "fade", "slide", "fade", "fade"] as const;
const commonWords = new Set("a about an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its me my no not of on or our she so that the their them then there they this to us was we were what when where which who will with you your".split(" "));
const standoutWords = new Set("breakthrough climate cost danger dangerous damage damaging earth emergency freedom future harm huge impact impossible important life never opportunity powerful risk save saving stopping stop urgent warning world zero".split(" "));

/** Stable lexical salience only; use transcript emphasis as the strongest author signal. */
export const saraHookScore = (word: Word) => {
  const clean = word.text.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  if (word.event || clean.length < 3 || (commonWords.has(clean) && !word.emphasis)) return 0;
  return (word.emphasis ? 100 : 0) + (standoutWords.has(clean) ? 55 : 0) +
    (/\p{N}/u.test(clean) ? 14 : 0) + Math.min(clean.length, 10);
};
export const selectSaraHooks = (words: Word[]) => [...words]
  .filter(word => saraHookScore(word) > 0 && word.endMs - word.startMs >= 100)
  .sort((a, b) => saraHookScore(b) - saraHookScore(a) || a.startMs - b.startMs)
  .slice(0, words.length >= 4 ? 2 : 1).map(word => word.id);
export const compileSara = (source: CaptionSource, config: SaraConfig) => {
  const { words, diagnostics } = normalizeWords(source);
  const groups: Word[][] = [];
  let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of words) {
    const prev = group[group.length - 1];
    if (prev && word.startMs > prev.startMs && (prev.pageBreakAfter || prev.event !== word.event ||
      prev.speaker !== word.speaker || /[.!?।॥]["'”’)]?$/u.test(prev.text) ||
      word.startMs - prev.endMs > config.pauseMs || group.length >= config.maxWords ||
      [...group, word].map(w => w.text).join(" ").length > config.maxCharacters ||
      word.endMs - group[0].startMs > config.maxDurationMs)) flush();
    group.push(word);
  }
  flush();
  const cues: SaraCue[] = groups.map((words, i) => ({ id: `sara-${words[0].id}`, words,
    startMs: words[0].startMs, endMs: Math.min(Math.max(...words.map(w => w.endMs)) + config.lingerMs,
      groups[i + 1]?.[0].startMs ?? Infinity), variant: VARIANTS[i % VARIANTS.length] }));
  for (let i = 1; i < cues.length; i++) if (Math.max(...cues[i - 1].words.map(w => w.endMs)) > cues[i].startMs)
    diagnostics.push(`Overlapping speech at ${cues[i].startMs}ms uses the next cue's display boundary.`);
  return { words, cues, diagnostics, durationMs: words.reduce((end, word) => Math.max(end, word.endMs + config.lingerMs),
    Math.max(1000, finite(source.durationMs, 0))) };
};
const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
export const saraWordMotion = (word: Word, now: number, variant: SaraCue["variant"], reduced = false) => {
  if (reduced) return { opacity: 1, x: 0, blur: 0, hookScale: 1 };
  const duration = Math.max(1, Math.min(variant === "slide" ? 220 : 110, (word.endMs - word.startMs) * .85));
  const progress = easeOut((now - word.startMs) / duration);
  return { opacity: progress, x: variant === "slide" ? (1 - progress) * .565 : 0,
    blur: variant === "slide" ? (1 - progress) * .07 : 0, hookScale: progress };
};
