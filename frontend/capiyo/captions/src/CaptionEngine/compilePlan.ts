import { normalizeTranscript } from "./normalizeTranscript";
import {
  finite, isRecord, type CaptionCue, type CaptionWord,
  type CompiledCaptions, type EngineOptions,
} from "./types";

export const ENGINE_DEFAULTS: EngineOptions = {
  fallback: "plain", minConfidence: 0.35, maxGapMs: 500,
  maxPlainWords: 3, maxPlainCharacters: 20,
  maxPlainDurationMs: 1800, lingerMs: 120,
};

const asIds = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;

/** Pure, style-independent transcript → validated cue timeline. Safe to use on a server. */
export const compileCaptionPlan = (
  transcript: unknown,
  plan: unknown,
  fps: number,
  options: EngineOptions = ENGINE_DEFAULTS,
): CompiledCaptions => {
  const normalized = normalizeTranscript(transcript);
  const diagnostics = [...normalized.diagnostics];
  const rate = Math.max(1, finite(fps, 30));
  const omit = new Set<string>();
  const planValid = isRecord(plan) && plan.version === 1 && Array.isArray(plan.cues);
  if (plan !== undefined && !planValid) {
    diagnostics.push("Invalid plan version or cues array; using the configured fallback.");
  }
  if (planValid && isRecord(plan)) {
    const ids = asIds(plan.omitWordIds ?? []);
    if (ids) ids.forEach((id) => omit.add(id));
    else diagnostics.push("omitWordIds must be an array of word IDs.");
  }
  const knownIds = new Set(normalized.words.map((word) => word.id));
  omit.forEach((id) => {
    if (!knownIds.has(id)) diagnostics.push(`Unknown omitted word ID ${id}.`);
  });
  const words: CaptionWord[] = [];
  normalized.words.forEach((word) => {
    if (!omit.has(word.id) && (word.confidence === null || word.confidence >= options.minConfidence)) {
      words.push({ ...word });
    } else if (word.pageBreakAfter && words.length) {
      // Filtering a word must not erase the source's phrase boundary.
      words[words.length - 1].pageBreakAfter = true;
    }
  });
  const positions = new Map(words.map((word, index) => [word.id, index]));
  const used = new Set<string>();
  const cues: CaptionCue[] = [];
  const skipped: CaptionWord[] = [];

  const addCue = (
    cueWords: CaptionWord[], mode: "emphasis" | "standalone" | "plain", id: string,
    heroWords: CaptionWord[] = [], nesting: "auto" | "off" = "auto",
    helperPlacement: "natural" | "above" | "below" = "natural",
    accentWordIds: string[] = [],
  ) => {
    const heroStart = heroWords.length ? cueWords.findIndex((word) => word.id === heroWords[0].id) : -1;
    cues.push({
      id, mode, words: cueWords, heroWords, accentWordIds,
      beforeWords: heroStart >= 0 ? cueWords.slice(0, heroStart) : [],
      afterWords: heroStart >= 0 ? cueWords.slice(heroStart + heroWords.length) : [],
      nesting, helperPlacement,
      // Switch phrases on the first frame at/after speech, rather than a frame early.
      startFrame: Math.ceil(cueWords[0].startMs * rate / 1000),
      endFrame: Math.ceil(Math.max(...cueWords.map((word) => word.endMs)) * rate / 1000)
        + Math.round(options.lingerMs * rate / 1000),
    });
  };

  if (planValid && isRecord(plan) && Array.isArray(plan.cues)) {
    plan.cues.forEach((entry, index) => {
      const reject = (reason: string) => diagnostics.push(`Plan cue ${index}: ${reason}; using fallback for its words.`);
      if (!isRecord(entry) || typeof entry.mode !== "string" ||
          !["emphasis", "standalone", "plain", "skip"].includes(entry.mode)) {
        reject("invalid mode"); return;
      }
      const ids = asIds(entry.wordIds);
      if (!ids?.length || ids.length > 12 || new Set(ids).size !== ids.length) {
        reject("wordIds must contain 1–12 unique IDs"); return;
      }
      const indexes = ids.map((id) => positions.get(id));
      if (indexes.some((position) => position === undefined) || ids.some((id) => used.has(id))) {
        reject("unknown, omitted, low-confidence, or reused word ID"); return;
      }
      const start = indexes[0] as number;
      if (indexes.some((position, offset) => position !== start + offset)) {
        reject("words must be consecutive and in transcript order"); return;
      }
      const selected = words.slice(start, start + ids.length);
      if (selected.some((word, i) => i > 0 &&
          (word.startMs - selected[i - 1].endMs > options.maxGapMs || selected[i - 1].pageBreakAfter))) {
        reject("cue crosses a pause or page break"); return;
      }
      const heroes = asIds(entry.heroWordIds ?? []);
      if (entry.mode === "standalone") {
        if (!heroes?.length || ids.length > 3 || heroes.length !== ids.length ||
            heroes.some((id, offset) => id !== ids[offset])) {
          reject("standalone needs 1–3 words, all selected as hero words"); return;
        }
      } else if (entry.mode === "emphasis") {
        const heroStart = heroes?.length ? ids.indexOf(heroes[0]) : -1;
        if (!heroes?.length || heroes.length > 3 || heroStart < 0 ||
            heroes.some((id, offset) => ids[heroStart + offset] !== id)) {
          reject("emphasis needs 1–3 consecutive hero words within the 12-word cue"); return;
        }
      } else if (!heroes || heroes.length) {
        reject("plain/skip cues cannot have hero words"); return;
      } else if (entry.mode === "plain" && (
        selected.length > options.maxPlainWords ||
        selected.reduce((length, word, wordIndex) =>
          length + word.text.trim().length + (wordIndex ? 1 : 0), 0) > options.maxPlainCharacters ||
        Math.max(...selected.map((word) => word.endMs)) - selected[0].startMs > options.maxPlainDurationMs
      )) {
        reject("plain cue exceeds the configured word, character, or duration limit"); return;
      }
      const accents = asIds(entry.accentWordIds ?? []);
      if (!accents || accents.length > 1 || accents.some((id) => !ids.includes(id)) ||
          (entry.mode !== "plain" && accents.length)) {
        reject("accentWordIds needs at most one member of a plain cue"); return;
      }
      ids.forEach((id) => used.add(id));
      if (entry.mode === "skip") {
        skipped.push(selected[0]);
        return;
      }
      const heroWords = selected.filter((word) => heroes?.includes(word.id));
      const cueId = typeof entry.id === "string" && entry.id ? `${entry.id}-${index}` : `cue-${index}`;
      addCue(selected, entry.mode === "standalone" ? "standalone"
        : entry.mode === "emphasis" ? "emphasis" : "plain", cueId,
        heroWords, entry.nesting === "off" ? "off" : "auto",
        entry.helperPlacement === "above" || entry.helperPlacement === "below" ? entry.helperPlacement : "natural",
        accents);
    });
  }

  // Unselected words remain readable, without turning every phrase into an emphasis stack.
  if (options.fallback === "plain") {
    let pending: CaptionWord[] = [];
    const flush = () => {
      if (pending.length) addCue(pending, "plain", `plain-${pending[0].id}`);
      pending = [];
    };
    words.forEach((word) => {
      if (used.has(word.id)) { flush(); return; }
      const previous = pending[pending.length - 1];
      const nextLength = [...pending, word]
        .reduce((length, item, index) => length + item.text.trim().length + (index ? 1 : 0), 0);
      if (previous && (word.startMs - previous.endMs > options.maxGapMs ||
          pending.length >= options.maxPlainWords ||
          nextLength > options.maxPlainCharacters ||
          Math.max(word.endMs, ...pending.map((item) => item.endMs))
            - pending[0].startMs > options.maxPlainDurationMs)) flush();
      pending.push(word);
      if (word.pageBreakAfter || /[.!?…]["'”’)]*$/.test(word.text)) flush();
    });
    flush();
  }

  // A skipped phrase is also a switch: clear any preceding caption's linger.
  // Sort in source time so two starts quantized to one frame keep speech order.
  const timeline = [
    ...cues.map((cue) => ({ cue, startMs: cue.words[0].startMs, startFrame: cue.startFrame })),
    ...skipped.map((word) => ({ cue: null, startMs: word.startMs,
      startFrame: Math.ceil(word.startMs * rate / 1000) })),
  ].sort((a, b) => a.startMs - b.startMs);
  const visible: CaptionCue[] = [];
  timeline.forEach(({ cue }, index) => {
    if (!cue) return;
    const next = timeline[index + 1];
    if (next) cue.endFrame = Math.min(cue.endFrame, next.startFrame);
    if (cue.endFrame <= cue.startFrame) {
      diagnostics.push(`Cue ${cue.id} has no visible frames at ${rate}fps.`);
    } else visible.push(cue);
  });
  const transcriptEnd = normalized.words.reduce((end, word) => Math.max(end, word.endMs), 0);
  return {
    words, cues: visible, diagnostics,
    durationInFrames: visible.reduce((end, cue) => Math.max(end, cue.endFrame),
      Math.max(1, Math.ceil(transcriptEnd * rate / 1000))),
  };
};

/** Binary search, so playback never filters an entire transcript on every frame. */
export const getActiveCueIndex = (cues: CaptionCue[], frame: number): number => {
  let low = 0;
  let high = cues.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (cues[mid].startFrame <= frame) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return found >= 0 && frame < cues[found].endFrame ? found : -1;
};
