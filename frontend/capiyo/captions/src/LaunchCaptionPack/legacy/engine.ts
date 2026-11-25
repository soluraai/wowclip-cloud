import { normalizeTranscript } from "../../CaptionEngine/normalizeTranscript";
import { clamp, finite, type CaptionWord } from "../../CaptionEngine/types";

export type TrendingVariant = "hormozi" | "minimal" | "pill";

export type TrendingSource = {
  transcript: unknown;
  durationMs?: number;
  background?: {
    src?: string;
    muted?: boolean;
    volume?: number;
  };
};

export type TrendingCue = {
  id: string;
  words: CaptionWord[];
  startMs: number;
  endMs: number;
};

const limits: Record<
  TrendingVariant,
  { maxWords: number; maxCharacters: number; maxDurationMs: number }
> = {
  hormozi: { maxWords: 3, maxCharacters: 19, maxDurationMs: 1700 },
  minimal: { maxWords: 5, maxCharacters: 29, maxDurationMs: 2400 },
  pill: { maxWords: 4, maxCharacters: 26, maxDurationMs: 2000 },
};

/** Split at natural pauses and punctuation, then enforce each style's reading limit. */
export const compileTrendingCaptions = (
  source: TrendingSource,
  variant: TrendingVariant,
) => {
  const { words, diagnostics } = normalizeTranscript(source.transcript);
  const limit = limits[variant];
  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };

  for (const word of words) {
    const previous = current[current.length - 1];
    const candidate = [...current, word];
    const textLength =
      candidate.reduce((sum, item) => sum + item.text.length, 0) +
      Math.max(0, candidate.length - 1);
    if (
      previous &&
      (word.startMs - previous.endMs > 250 ||
        current.length >= limit.maxWords ||
        textLength > limit.maxCharacters ||
        word.endMs - current[0].startMs > limit.maxDurationMs ||
        /[.!?]$/.test(previous.text))
    ) {
      flush();
    }
    current.push(word);
    if (word.pageBreakAfter) flush();
  }
  flush();

  const cues: TrendingCue[] = groups.map((group, index) => {
    const nextStart = groups[index + 1]?.[0].startMs ?? Infinity;
    return {
      id: `trending-${variant}-${index}`,
      words: group,
      startMs: group[0].startMs,
      endMs: Math.min(group[group.length - 1].endMs + 160, nextStart),
    };
  });
  return {
    words,
    cues,
    diagnostics,
    durationMs: Math.max(
      1000,
      finite(source.durationMs, 0),
      cues[cues.length - 1]?.endMs ?? 0,
    ),
  };
};

export const activeTrendingCue = (cues: TrendingCue[], now: number) => {
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
  return index >= 0 && now < cues[index].endMs ? cues[index] : null;
};

export const ease = (progress: number) => {
  const p = clamp(progress, 0, 1);
  return p * p * (3 - 2 * p);
};
