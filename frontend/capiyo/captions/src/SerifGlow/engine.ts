import { normalizeTranscript } from "../CaptionEngine/normalizeTranscript";
import { clamp, finite, type CaptionWord } from "../CaptionEngine/types";
import type {
  SerifGlowCue,
  SerifGlowSettings,
  SerifGlowSource,
  SerifGlowStyle,
  SerifGlowTreatment,
} from "./types";

export const resolveSerifGlowStyle = (style: SerifGlowStyle = {}): SerifGlowSettings => ({
  positionY: clamp(finite(style.positionY, 0.707), 0.2, 0.86),
  maxWidth: clamp(finite(style.maxWidth, 0.74), 0.45, 0.88),
  normalSize: clamp(finite(style.normalSize, 56), 32, 76),
  highlightSize: clamp(finite(style.highlightSize, 94), 64, 124),
  normalTracking: clamp(finite(style.normalTracking, -0.2), -2, 3),
  highlightTracking: clamp(finite(style.highlightTracking, -0.6), -3, 3),
  accent: style.accent ?? "#ffe600",
  textColor: style.textColor ?? "#ffffff",
  glow: clamp(finite(style.glow, 1), 0, 1.6),
  lowercase: style.lowercase ?? true,
});

const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
const common = new Set(
  "a an and are as at be been but by can could did do does for from got had has have i if im in into is it its just like make my no not of on or our so than that the their them there these they this to was we were what when where who will with would you your youve".split(" "),
);
const meaningful = new Set(
  "believe brains change comfortable confidence decisions discipline dreams family financial freedom grow growth healthy immensely journey life mindset opportunity powerful potential question standards success support true world".split(" "),
);

type Group = { words: CaptionWord[]; treatment: SerifGlowTreatment };

/** Conservative fallback for new transcripts; authored phrase cuts take priority. */
const autoGroups = (words: CaptionWord[], highlights: Set<string>, keys?: Set<string>): Group[] => {
  const groups: Group[] = [];
  let pending: CaptionWord[] = [];
  // New transcripts should still demonstrate this style's signature glow,
  // even when none of their content words appear in the reference keyword list.
  const fallbackFocus = new Set<string>();
  let lastFocus = -Infinity;
  for (const word of words) {
    const text = bare(word.text);
    if (highlights.has(text) || /\p{N}/u.test(text)) lastFocus = word.startMs;
    else if (!common.has(text) && text.length >= 5 && word.startMs - lastFocus >= 1800) {
      fallbackFocus.add(word.id);
      lastFocus = word.startMs;
    }
  }
  // Key words picked in the editor decide the glow on their own; otherwise the style finds its own.
  const isFocus = (word: CaptionWord) => keys ? keys.has(word.id) : highlights.has(bare(word.text)) ||
    /\p{N}/u.test(word.text) || fallbackFocus.has(word.id);
  const flush = () => {
    if (!pending.length) return;
    groups.push({ words: pending, treatment: "plain" });
    pending = [];
  };
  words.forEach((word, index) => {
    const previous = pending[pending.length - 1];
    if (previous && (word.startMs - previous.endMs > 280 ||
      word.endMs - pending[0].startMs > 1350 ||
      pending.length >= 3 ||
      [...pending, word].map((item) => item.text).join(" ").length > 25)) flush();
    if (isFocus(word)) {
      flush();
      const prior = groups[groups.length - 1];
      // An adjacent pair such as “personal dreams” can read as one emphasis.
      if (prior?.treatment === "glow" && prior.words.length < 2 &&
        word.startMs - prior.words[prior.words.length - 1].endMs < 120 &&
        !/[.!?]$/u.test(prior.words[prior.words.length - 1].text) &&
        [...prior.words, word].map((item) => item.text).join(" ").length <= 23) {
        prior.words.push(word);
      } else groups.push({ words: [word], treatment: "glow" });
    } else {
      pending.push(word);
      const next = words[index + 1];
      if (word.pageBreakAfter || /[.!?,;:]$/u.test(word.text) || !next ||
        next.startMs - word.endMs > 280 || isFocus(next)) flush();
    }
  });
  flush();
  // Function-word-only groups stay plain; meaningful fallback accents remain visible.
  return groups.map((group) => ({ ...group,
    treatment: !keys && group.words.every((word) => common.has(bare(word.text))) ? "plain" : group.treatment,
  }));
};

/** All words appear once, in transcript order; an invalid direction falls back safely. */
export const compileSerifGlow = (source: SerifGlowSource) => {
  const { words, diagnostics } = normalizeTranscript(source.transcript);
  const highlights = new Set([...meaningful, ...(source.highlightWords ?? []).map(bare)]);
  const raw = Array.isArray(source.transcript) ? source.transcript as { id?: unknown; emphasis?: unknown }[] : [];
  const marked = raw.filter((word) => word && word.emphasis === true).map((word) => String(word.id));
  const keys = marked.length ? new Set(marked) : undefined;
  const ids = new Map(words.map((word, index) => [word.id, index]));
  const directed = (source.direction ?? []).flatMap((entry) => {
    const from = ids.get(entry.from);
    const through = ids.get(entry.through ?? entry.from);
    if (from === undefined || through === undefined || through < from || through - from > 5) {
      diagnostics.push(`Ignored invalid SerifGlow phrase ${entry.from}.`);
      return [];
    }
    // Timing gaps are real pauses, even inside an authored phrase.
    if (words.slice(from + 1, through + 1).some((word, offset) =>
      word.startMs - words[from + offset].endMs > 650)) {
      diagnostics.push(`Split SerifGlow phrase ${entry.from} at a speech pause.`);
      return [];
    }
    return [{ from, through, treatment: entry.treatment }];
  }).sort((a, b) => a.from - b.from);
  const groups: Group[] = [];
  let cursor = 0;
  for (const entry of directed) {
    if (entry.from < cursor) {
      diagnostics.push(`Ignored overlapping SerifGlow phrase ${words[entry.from].id}.`);
      continue;
    }
    groups.push(...autoGroups(words.slice(cursor, entry.from), highlights, keys));
    groups.push({ words: words.slice(entry.from, entry.through + 1), treatment: entry.treatment });
    cursor = entry.through + 1;
  }
  groups.push(...autoGroups(words.slice(cursor), highlights, keys));
  const spokenEnd = words[words.length - 1]?.endMs ?? 0;
  const durationMs = Math.max(1000, finite(source.durationMs, spokenEnd + 300), spokenEnd);
  const cues: SerifGlowCue[] = groups.map((group, index) => {
    const lastEnd = group.words[group.words.length - 1].endMs;
    const nextStart = groups[index + 1]?.words[0].startMs ?? Infinity;
    const endMs = Math.min(lastEnd + (group.treatment === "glow" ? 230 : 140), nextStart, durationMs);
    return { ...group, id: `serif-glow-${group.words[0].id}`, startMs: group.words[0].startMs,
      endMs, fadeMs: nextStart - lastEnd < 120 ? 32 : 72 };
  });
  return { words, cues, durationMs, diagnostics };
};

export const currentSerifGlowCue = (cues: SerifGlowCue[], now: number) => {
  // Half-open intervals guarantee that the outgoing caption never sits behind the incoming one.
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const cue = cues[middle];
    if (now < cue.startMs) high = middle - 1;
    else if (now >= cue.endMs) low = middle + 1;
    else return cue;
  }
  return null;
};

export const serifGlowText = (cue: SerifGlowCue, lowercase: boolean) => {
  const text = cue.words.map((word) => word.text).join(" ")
    .replace(/[.,;:!]+$/u, "").replace(/\s+/gu, " ").trim();
  return lowercase ? text.toLocaleLowerCase("en") : text;
};
