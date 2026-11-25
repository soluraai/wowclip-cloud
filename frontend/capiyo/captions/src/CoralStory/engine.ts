import { normalizeWords } from "../LaunchCaptionPack/timeline";
import { finite } from "../LaunchCaptionPack/presets";
import type { Word } from "../LaunchCaptionPack/types";
import type { CoralConfig, CoralSource, StoryBeat, StoryCue } from "./types";
import { textLength, wordCount } from "../Script/scripts";

const stopWords = new Set("a an the and or but so to of in on at for from with is am are was were be been it its this that these those i i'm you your we our they their he she his her my me can could would should will do does did not why how what when who which than then as by us if just really very now have has had got into out up all some any each every एक यह वह और या तो को का की के में पर से है हैं मैं तुम आप हम भी ही जो कि नहीं".split(" "));
const candidate = (word: Word) => !word.event && !stopWords.has(word.text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}']/gu, "")) &&
  /[\p{L}\p{M}\p{N}]/u.test(word.text) && word.text.length >= 3 && word.text.length <= 24 && word.endMs - word.startMs >= 130;
const score = (word: Word) => (word.emphasis ? 100 : 0) + Math.min(word.text.length, 12) +
  (/\d/u.test(word.text) ? 3 : 0) + Math.min(4, (word.endMs - word.startMs) / 180);

export const chooseAccent = (words: Word[]) => words.find(w => w.emphasis && !w.event)?.id ??
  [...words].filter(candidate).sort((a, b) => score(b) - score(a))[0]?.id;

// Stable per-word variety: scrubbing, previewing and exporting use identical choices.
export const wordSeed = (id: string) => {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
};

/** A bounded visual cadence, never a per-frame random or claimed semantic AI model. */
export const compileCoralStory = (source: CoralSource, config: CoralConfig) => {
  const { words, diagnostics } = normalizeWords(source);
  const index = new Map(words.map((word, i) => [word.id, i]));
  const beats = new Map<string, StoryBeat>();
  const validKinds = new Set(["stamp", "underline", "bracket", "jiggle", "burst"]);
  for (const beat of source.beats ?? []) {
    if (!index.has(beat.wordId) || !validKinds.has(beat.kind)) { diagnostics.push(`Ignored invalid beat ${beat.wordId}.`); continue; }
    if (beats.has(beat.wordId)) { diagnostics.push(`Ignored duplicate beat ${beat.wordId}.`); continue; }
    if (words[index.get(beat.wordId)!].event) { diagnostics.push(`Ignored beat on sound event ${beat.wordId}.`); continue; }
    beats.set(beat.wordId, { ...beat });
  }
  // Every key word is stamped: it gets its own red stamp page, the style's signature moment.
  for (const word of words) if (word.emphasis && !word.event && !beats.has(word.id))
    beats.set(word.id, { wordId: word.id, kind: "stamp", sound: true });
  const explicitTimes = [...beats.keys()].map(id => words[index.get(id)!].startMs);
  if (config.automaticBeats !== "off") {
    let nextTime = (words[0]?.startMs ?? 0) + 2600;
    let previousKind: StoryBeat["kind"] | undefined;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.startMs < nextTime || !candidate(word) || beats.has(word.id) ||
        explicitTimes.some(time => Math.abs(time - word.startMs) < config.beatCooldownMs * .7)) continue;
      const window = words.slice(i, i + 5).filter(w => w.startMs <= word.startMs + 1300 && candidate(w) &&
        !beats.has(w.id) && explicitTimes.every(time => Math.abs(time - w.startMs) >= config.beatCooldownMs * .7));
      const selected = window.sort((a, b) => score(b) - score(a))[0] ?? word;
      const kinds = config.automaticBeats === "subtle" ? ["underline", "bracket"] as const :
        ["stamp", "underline", "jiggle", "bracket", "burst"] as const;
      let choice = wordSeed(selected.id) % kinds.length;
      if (kinds[choice] === previousKind) choice = (choice + 1) % kinds.length;
      const kind = kinds[choice];
      previousKind = kind;
      beats.set(selected.id, { wordId: selected.id, kind, sound: kind === "stamp" });
      nextTime = selected.startMs + config.beatCooldownMs;
    }
  }

  const breaks = new Set(source.breakAfterWordIds ?? []);
  const groups: Word[][] = [];
  let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of words) {
    const previous = group[group.length - 1];
    const stamp = ["stamp", "jiggle"].includes(beats.get(word.id)?.kind ?? "");
    const previousStamp = previous && ["stamp", "jiggle"].includes(beats.get(previous.id)?.kind ?? "");
    if (previous && word.startMs > previous.startMs && (stamp || previousStamp || previous.pageBreakAfter || breaks.has(previous.id) ||
      previous.event !== word.event || previous.speaker !== word.speaker || /[.!?।॥]["'”’)]?$/u.test(previous.text) ||
      word.startMs - previous.endMs > config.pauseMs || wordCount(group) >= config.maxWords ||
      textLength([...group, word].map(w => w.text).join(" ")) > config.maxCharacters ||
      word.endMs - group[0].startMs > config.maxDurationMs)) flush();
    group.push(word);
  }
  flush();
  const cues: StoryCue[] = groups.map((g, i) => {
    const available = g.map(w => beats.get(w.id)).filter((b): b is StoryBeat => Boolean(b));
    const stamp = g.length === 1 && (available.some(b => b.kind === "stamp" || b.kind === "jiggle") ||
      (!available.length && candidate(g[0]) && g[0].endMs - g[0].startMs >= 240));
    const beat = stamp ? available[0] : available.find(b => b.kind !== "stamp");
    if (available.filter(b => b.kind !== "stamp").length > 1)
      diagnostics.push(`Only the first non-stamp beat is used in cue ${g[0].id}; split the phrase to stage multiple hook accents.`);
    // Simultaneous tokens cannot be isolated into separate timed stamp pages.
    if (!stamp && available.some(b => b.kind === "stamp")) diagnostics.push(`Kept simultaneous tokens in strip ${g[0].id}.`);
    return { id: `coral-${g[0].id}`, words: g, variant: stamp ? "stamp" : "strip", beat,
      accentWordId: beat?.wordId ?? chooseAccent(g), startMs: g[0].startMs,
      endMs: Math.min(Math.max(...g.map(w => w.endMs)) + config.lingerMs, groups[i + 1]?.[0].startMs ?? Infinity) };
  });
  for (let i = 1; i < cues.length; i++) if (Math.max(...cues[i - 1].words.map(w => w.endMs)) > cues[i].startMs)
    diagnostics.push(`Overlapping speech at ${cues[i].startMs}ms uses the next cue's display boundary.`);
  return { words, cues, beats: [...beats.values()], diagnostics,
    durationMs: words.reduce((end, word) => Math.max(end, word.endMs + config.lingerMs), Math.max(1000, finite(source.durationMs, 0))) };
};

export const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export const easeOut = (value: number) => { const t = Math.max(0, Math.min(1, value)); return 1 - Math.pow(1 - t, 3); };
export const wordReveal = (word: Word, now: number, reduced = false) => {
  if (reduced) return { opacity: 1, x: 0, y: 0 };
  const t = easeOut((now - word.startMs) / Math.max(1, Math.min(220, (word.endMs - word.startMs) * .8)));
  return { opacity: t, x: (1 - t) * .5, y: 0 };
};
export const wiggleMotion = (elapsed: number, seed = 0, reduced = false) => {
  if (reduced || elapsed < 0 || elapsed >= 650) return { angle: 0, x: 0, y: 0 };
  const t = elapsed / 650;
  const wave = Math.sin(t * Math.PI * 4) * Math.pow(1 - t, 2);
  const direction = seed % 2 ? -1 : 1;
  return { angle: wave * 2.8 * direction, x: wave * .035 * direction,
    y: Math.sin(t * Math.PI * 3) * Math.pow(1 - t, 2) * -.025 };
};
export const stampMotion = (elapsed: number, reduced = false, seed = 0) => {
  if (reduced) return { scale: 1, angle: 0, opacity: 1, x: 0, y: 0 };
  const t = Math.max(0, elapsed);
  const wiggle = wiggleMotion(t, seed);
  return { scale: .96 + .04 * easeOut(t / 240),
    angle: wiggle.angle, x: (1 - easeOut(t / 200)) * .25 + wiggle.x, y: wiggle.y,
    opacity: easeOut(t / 120) };
};
