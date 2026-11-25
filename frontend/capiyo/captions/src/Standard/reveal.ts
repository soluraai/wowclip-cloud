import { createContext } from "react";

export type RevealMode = "line" | "chunk";

type TimedWord = Record<string, unknown> & { text?: unknown; startMs: number; endMs: number; pageBreakAfter?: boolean };

const LONGEST_PAUSE_MS = 380;
const CHARACTERS_PER_WORD = 6;

const textLength = (words: TimedWord[]) => words.reduce((sum, word) => sum + String(word.text ?? "").length + 1, -1);

/** Renderers keep words with the same start together, so sharing a start brings a chunk in at once. */
export const revealChunks = <T extends TimedWord>(words: T[], limit: number): T[] => {
  const groups: T[][] = [];
  let group: T[] = [];
  for (const word of words) {
    const previous = group[group.length - 1];
    if (previous && (previous.pageBreakAfter || word.startMs - previous.endMs > LONGEST_PAUSE_MS || group.length >= limit ||
      textLength([...group, word]) > limit * CHARACTERS_PER_WORD)) {
      groups.push(group);
      group = [];
    }
    group.push(word);
  }
  if (group.length) groups.push(group);
  return groups.flatMap((entries) => entries.map((word, index) => ({
    ...word,
    startMs: entries[0].startMs,
    pageBreakAfter: index === entries.length - 1 || word.pageBreakAfter,
  })));
};

/** Set around a renderer that should bring its rows in one at a time. */
export const LineRevealContext = createContext(false);

/** Only a laid-out caption knows its real rows: each word arrives with the first word of its row. */
export const revealLines = <T extends { word: { startMs: number } }>(items: T[], rowOf: (item: T) => number): T[] => {
  const starts = new Map<number, number>();
  for (const item of items) starts.set(rowOf(item), Math.min(starts.get(rowOf(item)) ?? Infinity, item.word.startMs));
  return items.map((item) => ({ ...item, word: { ...item.word, startMs: starts.get(rowOf(item))! } }));
};
