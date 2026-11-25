import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { clamp, finite, type CaptionWord } from "../CaptionEngine/types";
import defaults from "./captions-dot.config.json";

export type DotWord = CaptionWord & { sentenceEnd: boolean };
export type DotGroup = {
  words: DotWord[];
  startFrame: number;
  endFrame: number;
};

/** Keep brief consecutive words together; never cross a sentence or long pause. */
export const buildCaptionsDotTimeline = (
  transcript: unknown,
  fps: number,
  grouping = defaults.grouping,
  animation = defaults.animation,
): DotGroup[] => {
  const words = normalizeTranscript(transcript).words.map((word) => ({
    ...word,
    sentenceEnd: /[.!?…।॥]["'”’)]*$/.test(word.text),
  }));
  const maxLength = clamp(finite(grouping.shortWordMaxLength, 3), 1, 12);
  const maxWords = clamp(Math.round(finite(grouping.maxGroupWords, 2)), 1, 6);
  const maxGapMs = clamp(finite(grouping.maxGapSeconds, 0.18), 0, 1) * 1000;
  const maxDurationMs =
    clamp(finite(grouping.maxDurationSeconds, 1.2), 0.1, 4) * 1000;
  const isShort = (word: DotWord) =>
    Array.from(word.text).length <= maxLength;
  const groups: DotWord[][] = [];
  let pending: DotWord[] = [];
  for (const word of words) {
    const previous = pending[pending.length - 1];
    const joinsPage =
      grouping.mode === "pages" &&
      previous &&
      !previous.sentenceEnd &&
      !previous.pageBreakAfter;
    const joinsShortPhrase =
      previous &&
      grouping.mode !== "single-word" &&
      grouping.mode !== "pages" &&
      pending.length < maxWords &&
      pending.every(isShort) &&
      isShort(word) &&
      !previous.sentenceEnd &&
      !previous.pageBreakAfter &&
      word.startMs - previous.endMs <= maxGapMs &&
      word.endMs - pending[0].startMs <= maxDurationMs;
    // Preserve words sharing a frame, even when the source timing is very fast.
    const sameFrame =
      pending.length > 0 &&
      Math.ceil((word.startMs * fps) / 1000) ===
        Math.ceil((pending[0].startMs * fps) / 1000);
    if (pending.length && !joinsPage && !joinsShortPhrase && !sameFrame) {
      groups.push(pending);
      pending = [];
    }
    pending.push(word);
  }
  if (pending.length) groups.push(pending);
  const holdMs = clamp(finite(animation.pauseHoldSeconds, 0.35), 0, 2) * 1000;
  return groups.map((items, index) => {
    const endMs = Math.max(...items.map((word) => word.endMs));
    const nextMs = groups[index + 1]?.[0].startMs;
    const displayEndMs =
      nextMs === undefined
        ? endMs + holdMs
        : Math.min(nextMs, nextMs - endMs < 320 ? nextMs : endMs + holdMs);
    return {
      words: items,
      startFrame: Math.ceil((items[0].startMs * fps) / 1000),
      endFrame: Math.ceil((displayEndMs * fps) / 1000),
    };
  });
};
