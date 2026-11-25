import { clamp, finite, isRecord, type CaptionWord } from "./types";

/** Accepts Remotion milliseconds or speech-to-text {word/text,start,end} seconds. */
export const normalizeTranscript = (input: unknown) => {
  const diagnostics: string[] = [];
  let entries: unknown[] = [];
  if (Array.isArray(input)) entries = input;
  else if (isRecord(input) && Array.isArray(input.words)) entries = input.words;
  else if (isRecord(input) && Array.isArray(input.captions)) entries = input.captions;
  else if (isRecord(input) && Array.isArray(input.segments)) {
    // Segment text is not word timing: only consume actual word arrays.
    input.segments.forEach((segment) => {
      if (isRecord(segment) && Array.isArray(segment.words)) {
        entries.push(...segment.words);
      }
    });
  }
  if (!entries.length) diagnostics.push("No word-level transcript was supplied.");

  const ids = new Set<string>();
  const words: CaptionWord[] = [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      diagnostics.push(`Transcript entry ${index} is not a word object.`);
      return;
    }
    const sourceText = entry.punctuated ?? entry.text ?? entry.word;
    const text = typeof sourceText === "string" ? sourceText.trim().replace(/\s+/g, " ") : "";
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `w${index}`;
    const milliseconds = "startMs" in entry || "endMs" in entry || "start_ms" in entry || "end_ms" in entry;
    const startMs = milliseconds
      ? finite(entry.startMs ?? entry.start_ms, NaN)
      : finite(entry.start ?? entry.start_time, NaN) * 1000;
    const rawEndMs = milliseconds
      ? finite(entry.endMs ?? entry.end_ms, NaN)
      : finite(entry.end ?? entry.end_time, NaN) * 1000;
    const endMs = Math.max(rawEndMs, startMs + 60);
    if (!text || text.length > 120 || !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) || startMs < 0 || rawEndMs < startMs || endMs <= startMs || ids.has(id)) {
      diagnostics.push(`Ignored invalid transcript word ${id}; text/timing/ID must be valid.`);
      return;
    }
    ids.add(id);
    words.push({
      id, text, startMs, endMs,
      timestampMs: typeof entry.timestampMs === "number" && Number.isFinite(entry.timestampMs)
        ? clamp(entry.timestampMs, startMs, endMs) : null,
      confidence: typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
        ? clamp(entry.confidence, 0, 1) : null,
      pageBreakAfter: entry.pageBreakAfter === true,
      // Mix captions: the word in English letters, for templates that set a line in them (Script/mix).
      ...(typeof entry.mix === "string" && entry.mix.trim() ? { mix: entry.mix.trim() } : {}),
      ...(typeof entry.latin === "string" && entry.latin.trim() ? { latin: entry.latin.trim() } : {}),
    });
  });
  // Preserve IDs from the original array even when invalid entries are removed or sorted.
  words.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return { words, diagnostics };
};
