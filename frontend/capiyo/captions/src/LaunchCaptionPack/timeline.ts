import type { CaptionSource, CaptionStyle, Cue, Word } from "./types";
import { finite } from "./presets";

const record = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const value = (v: unknown) => typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

/** No inferred word timing, early highlights, censorship, or semantic/AI guesses. */
export const normalizeWords = (source: CaptionSource) => {
  const diagnostics: string[] = [];
  const input = source.transcript;
  let entries: unknown[] = [];
  if (Array.isArray(input)) entries = input;
  else if (record(input)) {
    if (Array.isArray(input.words)) entries = input.words;
    else if (Array.isArray(input.captions)) entries = input.captions;
    else if (Array.isArray(input.segments)) for (const segment of input.segments) {
      if (record(segment) && Array.isArray(segment.words)) entries.push(...segment.words.map(w =>
        record(w) ? { ...w, speaker: w.speaker ?? segment.speaker } : w));
    }
  }
  const ids = new Set<string>();
  const emphasized = new Set(source.emphasisWordIds ?? []);
  const words: Word[] = [];
  entries.forEach((entry, index) => {
    if (!record(entry)) { diagnostics.push(`Skipped non-object word at ${index}.`); return; }
    const rawText = entry.punctuated ?? entry.text ?? entry.word;
    const text = typeof rawText === "string" ? rawText.trim().replace(/\s+/gu, " ") : "";
    const ms = "startMs" in entry || "start_ms" in entry || "endMs" in entry || "end_ms" in entry;
    const startMs = ms ? finite(entry.startMs ?? entry.start_ms, NaN) : finite(entry.start ?? entry.start_time, NaN) * 1000;
    let endMs = ms ? finite(entry.endMs ?? entry.end_ms, NaN) : finite(entry.end ?? entry.end_time, NaN) * 1000;
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < startMs) {
      diagnostics.push(`Skipped word ${index}: invalid text or timing.`); return;
    }
    if (endMs === startMs) { endMs += 60; diagnostics.push(`Extended zero-duration word ${index} to 60ms.`); }
    const requestedId = value(entry.id)?.trim() || `w${index}`;
    let id = requestedId;
    let suffix = 1;
    while (ids.has(id)) id = `${requestedId}~${suffix++}`;
    if (id !== requestedId) diagnostics.push(`Renamed duplicate ID ${requestedId} to ${id}.`);
    ids.add(id);
    words.push({ id, text, startMs, endMs, speaker: value(entry.speaker ?? entry.speakerId ?? entry.speaker_id),
      emphasis: entry.emphasis === true || emphasized.has(requestedId),
      event: entry.kind === "event" || /^\[.*\]$/u.test(text), pageBreakAfter: entry.pageBreakAfter === true,
      ...(typeof entry.mix === "string" && entry.mix.trim() ? { mix: entry.mix.trim().replace(/\s+/gu, " ") } : {}),
      ...(typeof entry.latin === "string" && entry.latin.trim() ? { latin: entry.latin.trim().replace(/\s+/gu, " ") } : {}) });
  });
  words.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (!words.length) diagnostics.push("No valid timed words supplied.");
  return { words, diagnostics };
};

export const cueFromWords = (words: Word[], index: number, nextStart = Infinity): Cue => ({
  id: `cue-${index}-${words[0].id}`, words, startMs: words[0].startMs,
  endMs: Math.min(Math.max(...words.map(w => w.endMs)) + 140, nextStart),
  speaker: words.every(w => w.speaker === words[0].speaker) ? words[0].speaker : undefined,
});

export const compileTimeline = (source: CaptionSource, style: CaptionStyle) => {
  const { words, diagnostics } = normalizeWords(source);
  const groups: Word[][] = [];
  let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of words) {
    const previous = group[group.length - 1];
    // Simultaneous tokens stay together: never produce an invisible zero-length cue.
    if (previous && word.startMs > previous.startMs && (
      previous.pageBreakAfter || previous.speaker !== word.speaker || previous.event !== word.event ||
      word.startMs - previous.endMs > 320 || /[.!?।॥]["'”’)]?$/u.test(previous.text) ||
      group.length >= style.maxWords || [...group, word].map(w => w.text).join(" ").length > style.maxCharacters ||
      word.endMs - group[0].startMs > style.maxDurationMs
    )) flush();
    group.push(word);
  }
  flush();
  const cues = groups.map((g, i) => cueFromWords(g, i, groups[i + 1]?.[0].startMs));
  for (let i = 1; i < cues.length; i++) {
    if (Math.max(...cues[i - 1].words.map(w => w.endMs)) > cues[i].startMs)
      diagnostics.push(`Overlapping speech at ${cues[i].startMs}ms: next cue takes display priority.`);
  }
  return { words, cues, diagnostics, durationMs: words.reduce((end, word) => Math.max(end, word.endMs + 140),
    Math.max(1000, finite(source.durationMs, 0))) };
};

export const activeCue = <T extends Cue>(cues: T[], ms: number): T | null => {
  let lo = 0; let hi = cues.length - 1; let match = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].startMs <= ms) { match = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return match >= 0 && ms < cues[match].endMs ? cues[match] : null;
};

/** A pause has no active token; the last token is never falsely kept highlighted. */
export const activeWord = (cue: Cue, ms: number) => {
  for (let i = cue.words.length - 1; i >= 0; i--)
    if (cue.words[i].startMs <= ms && ms < cue.words[i].endMs) return i;
  return -1;
};
