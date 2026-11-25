import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { finite, type CaptionWord } from "../CaptionEngine/types";

export const EDITORIAL_HANDOFF_MS = 160;

export type EditorialSource = {
  transcript: unknown;
  durationMs?: number;
  background?: { src?: string; muted?: boolean; volume?: number };
};

export type EditorialCue = {
  id: string;
  words: CaptionWord[];
  startMs: number;
  endMs: number;
  selectedWordId: string | null;
};

const common = new Set(
  "a an and are as at be been but by can did do for from had has have how i in into is it its of on or our so than that the their then there these this to was were what when where which who why will with you your".split(" "),
);

const clean = (text: string) => text.replace(/[^\p{L}\p{M}\p{N}]/gu, "");

const chooseSelectedWord = (words: CaptionWord[], index: number, keyWords: Set<string>): string | null => {
  // Once key words are chosen they decide the frame, and a line without one has no frame.
  if (keyWords.size) return words.find((word) => keyWords.has(word.id))?.id ?? null;
  const ranked = words
    .map((word, position) => {
      const bare = clean(word.text);
      const lower = bare.toLowerCase();
      const proper = position > 0 && /^\p{Lu}/u.test(bare);
      return {
        word,
        score: (proper ? 5 : 0) + Math.min(8, bare.length) -
          (common.has(lower) ? 9 : 0) + (position === words.length - 1 ? 1 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  // The reference uses selection frames as an occasional editorial accent.
  return best && best.score >= 6 && index % 4 !== 2 ? best.word.id : null;
};

export type CompileEditorialSelectOptions = {
  maxWords?: number;
  maxCharacters?: number;
  maxDurationMs?: number;
};

export const compileEditorialSelect = (source: EditorialSource, options?: CompileEditorialSelectOptions) => {
  const { words, diagnostics } = normalizeTranscript(source.transcript);
  const maxWords = options?.maxWords ?? 7;
  const maxCharacters = options?.maxCharacters ?? 42;
  const maxDurationMs = options?.maxDurationMs ?? 2800;
  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  for (const word of words) {
    const previous = current[current.length - 1];
    const candidateLength = current.reduce((sum, item) => sum + item.text.length + 1, 0) + word.text.length;
    if (
      previous &&
      (word.startMs - previous.endMs > 310 ||
        current.length >= maxWords ||
        candidateLength > maxCharacters ||
        word.endMs - current[0].startMs > maxDurationMs ||
        (/[.!?]$/.test(previous.text) && !options?.maxWords))
    ) flush();
    current.push(word);
    if (word.pageBreakAfter || (/[.!?]$/.test(word.text) && !options?.maxWords)) flush();
  }
  flush();

  // Brief adjacent phrases can share a page, reducing cuts during fast speech.
  for (let i = 0; i < groups.length - 1; i++) {
    const group = groups[i], next = groups[i + 1];
    const last = group[group.length - 1];
    if (!last.pageBreakAfter && last.endMs - group[0].startMs < 650 &&
      next[0].startMs - last.endMs <= 180 && group.length + next.length <= maxWords &&
      [...group, ...next].map(word => word.text).join(" ").length <= maxCharacters &&
      next[next.length - 1].endMs - group[0].startMs <= maxDurationMs) {
      groups.splice(i, 2, [...group, ...next]);
      i--;
    }
  }

  const keyWords = new Set(
    (Array.isArray(source.transcript) ? source.transcript as { id?: string; emphasis?: boolean }[] : [])
      .filter((word) => word.emphasis && word.id).map((word) => word.id as string),
  );
  const cues: EditorialCue[] = groups.map((group, index) => ({
    id: `editorial-${index}`,
    words: group,
    startMs: group[0].startMs,
    endMs: Math.min(Math.max(...group.map(word => word.endMs)) + 280,
      (groups[index + 1]?.[0].startMs ?? Infinity) + EDITORIAL_HANDOFF_MS),
    selectedWordId: chooseSelectedWord(group, index, keyWords),
  }));
  return {
    cues,
    diagnostics,
    durationMs: Math.max(1000, finite(source.durationMs, 0), cues[cues.length - 1]?.endMs ?? 0),
  };
};

export const nearbyEditorialCues = (cues: EditorialCue[], now: number) => {
  let low = 0;
  let high = cues.length - 1;
  let index = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].startMs <= now) {
      index = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return [cues[index - 1], cues[index]].filter(
    (cue): cue is EditorialCue => Boolean(cue && now >= cue.startMs && now < cue.endMs),
  );
};
