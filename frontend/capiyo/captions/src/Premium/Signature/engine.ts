import { normalizeWords } from "../../LaunchCaptionPack/timeline";
import type { CaptionSource, Word } from "../../LaunchCaptionPack/types";
import { textLength, wordCount } from "../../Script/scripts";

export type SignatureVariant = "ember-lock" | "cursor-story";
export type SignatureCue = { id: string; index: number; words: Word[]; heroId: string; startMs: number; endMs: number };
const stop = new Set("a an the and or of to for in on at from with by as is are was were be been i my me we our you your they their he his she her it its this that these those can could would should will have has had do does did so just very not make एक यह वह और या तो को का की के में पर से है हैं मैं तुम आप हम भी ही जो कि नहीं".split(" "));
const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
const meaningful = new Set("discipline confidence attention question success failure purpose story vision ideas momentum chapter decision progress focus future life dream dreams potential मेहनत सपना सपने सवाल भविष्य".split(" "));
const score = (word: Word) => (word.emphasis ? 1000 : 0) - (word.event ? 1000 : 0) -
  (stop.has(key(word.text)) ? 40 : 0) + (meaningful.has(key(word.text)) ? 6 : 0) +
  Math.min(14, [...key(word.text)].length) + (/\d/u.test(word.text) ? 5 : 0);

/** Preserve every source word and its clock; only compose boundaries and roles. */
export const compileSignature = (source: CaptionSource, maxWords = 7, maxCharacters = 44): SignatureCue[] => {
  const { words } = normalizeWords(source);
  const groups: Word[][] = [];
  let pending: Word[] = [];
  for (const word of words) {
    const previous = pending[pending.length - 1];
    if (previous && word.startMs > previous.startMs && (previous.pageBreakAfter ||
      previous.speaker !== word.speaker || previous.event !== word.event || /[.!?।॥]["'”’)]?$/u.test(previous.text) ||
      pending.length >= 3 && /[,;:]["'”’)]?$/u.test(previous.text) ||
      word.startMs - previous.endMs > 380 || wordCount(pending) >= maxWords ||
      textLength([...pending, word].map(w => w.text).join(" ")) > maxCharacters || word.startMs - pending[0].startMs > 2800)) {
      groups.push(pending); pending = [];
    }
    pending.push(word);
  }
  if (pending.length) groups.push(pending);
  return groups.map((entries, index) => ({ id: `signature-${entries[0].id}`, index, words: entries,
    heroId: entries.reduce((best, word) => score(word) > score(best) ? word : best).id,
    startMs: entries[0].startMs,
    endMs: Math.min(Math.max(...entries.map(word => word.endMs)) + 180, groups[index + 1]?.[0].startMs ?? Infinity),
  }));
};
export const signatureEase = (progress: number) => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;
export const signatureWordProgress = (now: number, word: Word, reduced = false) =>
  now < word.startMs ? 0 : reduced ? 1 : signatureEase((now - word.startMs) / 220);
