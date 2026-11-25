/**
 * Premium lockups are the hook step of a caption, and a hook step on every line stops being one.
 * So the video is cut into chunks here, and only some of them become a lockup, each around one word.
 * The rest read as plain centered lines. Styles built on a lockup in every chunk keep their own plan.
 */
type HeroShare = {
  share: number;
  /** Draws its own plain lines instead of the shared one. */
  inside?: boolean;
  /** Only a key word earns a lockup. The share is the fallback for a video with no key words at all. */
  strict?: boolean;
  /** What one chunk may hold at this style's size: longer text splits instead of shrinking. */
  words?: number;
  characters?: number;
};
export const HERO_SHARES: Record<string, HeroShare> = {
  "style-one": { share: 0.45, strict: true, words: 6, characters: 32 },
  "ember-lock": { share: 0.45, strict: true, words: 6, characters: 32 },
  "cursor-story": { share: 0.45, strict: true, words: 6, characters: 32 },
  "maroon-king": { share: 0.45, strict: true, words: 6, characters: 32 },
  "neon-overlap": { share: 0.45, strict: true, words: 6, characters: 32 },
  "dynamic-simple": { share: 0.5, strict: true, words: 5, characters: 28 },
  luxe: { share: 0.6, words: 6, characters: 32 },
  "verse-flow": { share: 0.5, inside: true, words: 6, characters: 34 },
  "split-line": { share: 0.5, strict: true, words: 6, characters: 32 },
  viewfinder: { share: 0.5, strict: true, words: 6, characters: 32 },
  // Standard styles with the same rule: only a real main word gets the big treatment.
  "prism-relay": { share: 0.45, strict: true, words: 5, characters: 28 },
  "pocket-flow": { share: 0.45, strict: true, words: 5, characters: 28 },
  "blend-cursor": { share: 0.5, strict: true, words: 6, characters: 32 },
  og: { share: 0.5, strict: true, words: 6, characters: 32 },
};

/** However many key words a video has, more lockups than this stop feeling special. */
const MOST_SHARE = 0.6;
const LONGEST_HERO_RUN = 2;
const LONGEST_PLAIN_RUN = 3;
const LONGEST_PAUSE_MS = 380;
const CHARACTERS_PER_WORD = 6;
const CLOSING_MS = 220;

const STOP = new Set(("a an the and or but of for from in on at as to with by is am are was were be been this that these those it its i my me we our they their he his she her you your can could would should will do does did have has had so just very not " +
  "na nahi hai hain ho se ki ka ke ko mein me aur toh to par pe ye yeh wo woh ek bhi hi jo bas kya").split(" "));
const bare = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

type PlanWord = Record<string, unknown> & { id: string; text: string; startMs: number; endMs: number; pageBreakAfter?: boolean };
export type PlainPage = { id: string; words: PlanWord[]; startMs: number; endMs: number };
export type HeroPlan = {
  transcript: PlanWord[];
  plain: PlainPage[];
  direction: { wordIds: string[]; heroWordId: string }[];
  /** Short main words and how much bigger than the design's size each is drawn (see SHORT_HEROES). */
  grow: Record<string, number>;
};

/**
 * A short main word (BIG, NOW) is narrow at the size a long one fits at, so the helper lines around it read
 * bigger than the word they belong to. Two rules, for every style that plans its main words here:
 *  - it is drawn bigger, so it still leads its lockup (a word stops at what fits the box);
 *  - it carries fewer words: the rest of its chunk becomes a normal line before or after the lockup.
 * `letters` is the longest word a rule covers; the first match wins.
 */
const SHORT_HEROES = [
  { letters: 3, grow: 1.4, words: 5 },
  { letters: 4, grow: 1.25, words: 6 },
  { letters: 5, grow: 1.12, words: Infinity },
];
/** The text a main word shows: its English-letters form in Mix captions. */
const shownText = (word: PlanWord) => typeof word.mix === "string" && word.mix.trim() ? word.mix : word.text;
const shortHero = (word: PlanWord) => {
  const letters = [...bare(shownText(word))].length;
  return SHORT_HEROES.find(rule => letters <= rule.letters);
};

/** Word styles with each short main word's growth laid over its own size pick. */
export const growWordStyles = <Style extends { sizeScale?: number }>(styles: Record<string, Style> | undefined, grow: Record<string, number> | undefined) => {
  const ids = Object.keys(grow ?? {});
  if (!ids.length) return styles;
  const next: Record<string, Style> = { ...styles };
  for (const id of ids) next[id] = { ...next[id], sizeScale: (next[id]?.sizeScale ?? 1) * grow![id] } as Style;
  return next;
};

const weight = (word: PlanWord) => {
  const text = bare(word.text);
  return STOP.has(text) ? -20 : Math.min(12, [...text].length) + (/\p{N}/u.test(text) ? 6 : 0);
};

const cut = (words: PlanWord[], limit: number, characters = limit * CHARACTERS_PER_WORD) => {
  const chunks: PlanWord[][] = [];
  let chunk: PlanWord[] = [];
  const flush = () => { if (chunk.length) chunks.push(chunk); chunk = []; };
  for (const word of words) {
    const previous = chunk[chunk.length - 1];
    if (previous && (word.startMs - previous.endMs > LONGEST_PAUSE_MS || chunk.length >= limit ||
      [...chunk, word].map(item => item.text).join(" ").length > characters)) flush();
    chunk.push(word);
    if (word.pageBreakAfter || /[.!?।॥]["'”’)]?$/u.test(word.text)) flush();
  }
  flush();
  return chunks;
};

export const planHeroes = (words: PlanWord[], keyIds: Set<string>, neverIds: Set<string>,
  { share, inside, strict, words: most_words, characters }: HeroShare, limit: number): HeroPlan => {
  const chunks = cut(words, Math.min(limit, most_words ?? limit), characters);
  const heroOf = chunks.map(chunk => chunk.filter(word => !neverIds.has(word.id))
    .sort((a, b) => Number(keyIds.has(b.id)) - Number(keyIds.has(a.id)) || weight(b) - weight(a))[0]);
  const hasKey = chunks.map((_, index) => !!heroOf[index] && keyIds.has(heroOf[index].id));
  const worth = (index: number) => !!heroOf[index] && (hasKey[index] || weight(heroOf[index]) > 0);
  const keyed = hasKey.filter(Boolean).length;
  const onlyKeys = strict && keyed > 0;
  const chosen = chunks.map((_, index) => onlyKeys && hasKey[index]);
  if (!onlyKeys) {
    const most = Math.max(Math.ceil(chunks.length * share), Math.min(keyed, Math.ceil(chunks.length * MOST_SHARE)));
    const runThrough = (index: number) => {
      let left = index, right = index;
      while (chosen[left - 1]) left--;
      while (chosen[right + 1]) right++;
      return right - left + 1;
    };
    const order = chunks.map((_, index) => index).filter(worth).sort((a, b) =>
      Number(hasKey[b]) - Number(hasKey[a]) || weight(heroOf[b]) - weight(heroOf[a]) || a - b);
    let count = 0;
    for (const index of order) {
      if (count >= most || runThrough(index) > LONGEST_HERO_RUN) continue;
      chosen[index] = true;
      count++;
    }
    // A long plain stretch reads flat, so the strongest chunk in it gets a lockup too.
    for (let start = 0; start < chunks.length; start++) {
      if (chosen[start]) continue;
      let end = start;
      while (end + 1 < chunks.length && !chosen[end + 1]) end++;
      if (end - start + 1 > LONGEST_PLAIN_RUN) {
        const best = order.find(index => index > start && index < end);
        if (best !== undefined) { chosen[best] = true; start--; continue; }
      }
      start = end;
    }
  }

  const plan: HeroPlan = { transcript: [], plain: [], direction: [], grow: {} };
  // Each chunk as the pieces it is shown in: the lockup around its main word, and what a short main word can't carry.
  const pieces: { words: PlanWord[]; hero?: PlanWord }[] = [];
  chunks.forEach((chunk, index) => {
    const hero = chosen[index] ? heroOf[index] : undefined;
    const rule = hero && shortHero(hero);
    // One word over stays: a single word alone on a line reads worse than a slightly long lockup.
    if (!hero || !rule || chunk.length <= rule.words + 1) { pieces.push({ words: chunk, hero }); return; }
    const at = chunk.indexOf(hero), keep = rule.words;
    // The stretch around the main word that leaves no single word alone on a line, as centered as it can be.
    let start = 0, best = Infinity;
    for (let from = Math.max(0, at - keep + 1); from <= Math.min(at, chunk.length - keep); from++) {
      const after = chunk.length - from - keep;
      const cost = (from === 1 ? 10 : 0) + (after === 1 ? 10 : 0) + Math.abs(from - (at - Math.floor((keep - 1) / 2)));
      if (cost < best) { best = cost; start = from; }
    }
    if (start > 0) pieces.push({ words: chunk.slice(0, start) });
    pieces.push({ words: chunk.slice(start, start + keep), hero });
    if (start + keep < chunk.length) pieces.push({ words: chunk.slice(start + keep) });
  });
  pieces.forEach(({ words: chunk, hero }, index) => {
    const grow = hero && shortHero(hero)?.grow;
    if (hero && grow) plan.grow[hero.id] = grow;
    // Mix captions: the main word a plan picks shows its English form (see Script/mix.ts).
    const placed = chunk.map((word, position) => ({ ...word, hero: undefined,
      ...(word.id === hero?.id && typeof word.mix === "string" && word.mix.trim() ? { text: word.mix } : {}),
      emphasis: word.id === hero?.id, pageBreakAfter: position === chunk.length - 1 }));
    if (hero || inside) {
      plan.transcript.push(...placed);
      if (hero) plan.direction.push({ wordIds: chunk.map(word => word.id), heroWordId: hero.id });
      return;
    }
    plan.plain.push({ id: chunk[0].id, words: placed, startMs: chunk[0].startMs,
      endMs: Math.min(Math.max(...chunk.map(word => word.endMs)) + CLOSING_MS, pieces[index + 1]?.words[0].startMs ?? Infinity) });
  });
  return plan;
};
