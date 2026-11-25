import { finite, isRecord } from "../CaptionEngine/types";

type Rec = Record<string, unknown>;
type Piece = {
  word: Rec;
  entry: number;
  multi: boolean;
  hero: string[];
};

const clean = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
const MINOR_WORD = /^(a|an|the|to|of|in|on|at|for|and|or|but|so|is|are|was|were|be|i|you|we|it|my|your|our|that|this|with|from|by|as|around|about)$/;

/**
 * Sources without an emphasis plan (e.g. the editor's phrase-level transcript)
 * get one derived here, so Style Two always shows a main word instead of
 * falling back to plain text. Phrases are split into words with interpolated
 * timings; the hero is the editor-chosen word when known, otherwise the
 * longest word of each short group.
 */
export const withAutoPlan = (source: Rec): Rec => {
  if (source.plan !== undefined || !Array.isArray(source.transcript))
    return source;
  // Editor sources arrive already split into pages; only page breaks end a group then.
  const paged = source.paged === true;
  const pieces: Piece[] = [];
  source.transcript.forEach((raw, entry) => {
    if (!isRecord(raw) || typeof raw.text !== "string") return;
    const tokens = raw.text.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return;
    const start = finite(raw.startMs, 0),
      end = Math.max(start + 1, finite(raw.endMs, start + 1));
    const hero =
      typeof raw.hero === "string"
        ? raw.hero.trim().split(/\s+/).map(clean).filter(Boolean)
        : [];
    if (tokens.length === 1) {
      pieces.push({
        word: { ...raw },
        entry,
        multi: false,
        hero: raw.emphasis === true ? [clean(raw.text)] : hero,
      });
      return;
    }
    const weights = tokens.map((token) => Math.max(1, token.length));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = start;
    tokens.forEach((token, index) => {
      const next =
        index === tokens.length - 1
          ? end
          : cursor + ((end - start) * weights[index]) / total;
      pieces.push({
        word: {
          id: `${String(raw.id ?? `w${entry}`)}~${index}`,
          text: token,
          startMs: Math.round(cursor),
          endMs: Math.round(next),
          timestampMs: null,
          confidence: null,
          pageBreakAfter:
            index === tokens.length - 1 ? raw.pageBreakAfter === true : false,
        },
        entry,
        multi: true,
        hero,
      });
      cursor = next;
    });
  });

  const groups: Piece[][] = [];
  let group: Piece[] = [];
  pieces.forEach((piece) => {
    const previous = group[group.length - 1];
    if (previous) {
      const text = [...group, piece].map((item) => String(item.word.text)).join(" ");
      const gap = finite(piece.word.startMs, 0) - finite(previous.word.endMs, 0);
      const sentenceEnd =
        previous.word.pageBreakAfter === true ||
        /[.!?…]["'”’)]*$/.test(String(previous.word.text));
      const phraseChange =
        previous.entry !== piece.entry && (previous.multi || piece.multi);
      if (
        sentenceEnd ||
        phraseChange ||
        (!paged && (gap > 450 || group.length >= 4 || text.length > 26))
      ) {
        groups.push(group);
        group = [];
      }
    }
    group.push(piece);
  });
  if (group.length) groups.push(group);

  const cues = groups.map((items, index) => {
    const ids = items.map((item) => String(item.word.id));
    const given = items
      .map((item, i) => (item.hero.includes(clean(String(item.word.text))) ? i : -1))
      .filter((i) => i >= 0);
    let heroIndexes: number[] = [];
    if (given.length && given.length <= 3 && given.every((i, k) => k === 0 || i === given[k - 1] + 1))
      heroIndexes = given;
    else if (given.length) heroIndexes = [given[given.length - 1]];
    else {
      let best = 0;
      items.forEach((item, i) => {
        const word = clean(String(item.word.text));
        // Spoken lines land on their last real word; the longest word is often just an adjective.
        if (paged ? !MINOR_WORD.test(word) : word.length >= clean(String(items[best].word.text)).length) best = i;
      });
      heroIndexes = [best];
    }
    const single = items.length === 1;
    // Once key words are chosen, a line without one stays plain.
    if (source.keyWordsOnly === true && !given.length)
      return { id: `auto-${index}`, mode: "plain", wordIds: ids, heroWordIds: [] };
    return {
      id: `auto-${index}`,
      mode: single ? "standalone" : "emphasis",
      wordIds: ids,
      heroWordIds: single ? ids : heroIndexes.map((i) => ids[i]),
    };
  });
  return {
    ...source,
    transcript: pieces.map((piece) => piece.word),
    plan: { version: 1, cues },
  };
};
