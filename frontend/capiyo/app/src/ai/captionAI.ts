/**
 * Caption AI pass — shared by the API route (prompt + validation) and the editor (apply).
 *
 * The model never sees or returns timings. It gets the transcript as numbered words, one caption
 * line per row, and answers with small, index-addressed decisions, so a bad answer can at worst be
 * ignored — it can never shift timestamps or invent words:
 *   - edits:    per-word text fixes (punctuation, casing, digits, obvious mishearings);
 *               "" merges the word into the previous one ("one hundred" → "100").
 *   - emphasis: the key word of a line, at most one per line, and none where nothing stands out.
 *   - chunks:   a few words that must stay on one caption page ("why not you?").
 *
 * Page splitting itself is not the model's job: see editor/captionPages.ts, which follows
 * the current font size, box width and word limit. The rows only give the model the same idea of
 * "a line" that Premium's chunks use (captions/src/Premium/heroPlan.ts), so one key word per row
 * lands as one main word per lockup.
 */
import type { Cue } from "../app/CaptionTimeline";

export type AIWord = { i: number; text: string; gapMs: number };
export type AIEnhancement = {
  edits: { i: number; text: string }[];
  emphasis: number[];
  chunks: [number, number][];
};
/** What the route returns: the same decisions, addressed by cue id. */
export type CaptionAIResult = {
  model: string;
  edits: Record<string, string>;
  emphasis: string[];
  /** Word ids of each chunk, in order. */
  chunks: string[][];
};

/** Most words in one request. Requests are cut between lines, never inside one. */
export const AI_CHUNK_WORDS = 400;
const MAX_CHUNK_WORDS = 5;

// The same line rules as Premium's chunks, so the model's "line" is the caption a viewer sees.
const LINE_WORDS = 6;
const LINE_CHARACTERS = 32;
const LINE_PAUSE_MS = 380;
/** A pause this long starts a new thought; it is shown as a blank row. */
const BREATH_MS = 900;

export const SYSTEM_PROMPT = `You are a senior caption editor for short-form social video (Reels, Shorts, TikTok).

INPUT: the transcript, one on-screen caption line per row. Each word is "index:word" (the index is the number before the first colon). A blank row is a long pause. Lines can end mid-sentence; read across them for meaning.

OUTPUT: ONLY one JSON object, no prose. Work everything out before you write it; never write a second, corrected object.
{"edits":[["index:word","new text"]],"emphasis":["index:word"],"chunks":[[start,end]]}
Every word you refer to is written exactly as it appears in the input, "index:word" (e.g. "12:focused"), so it can be checked.

EMPHASIS — the key word of each line
On screen the key word becomes the big headline word and the rest of the line shrinks around it, so pick the word a viewer must catch to get the line.
- "emphasis" lists each row's key word in row order, copied exactly as "index:word" from that row. At most one per row, never two.
- A key word must be a BIG word: a word with weight that means something on its own and looks strong shown huge. DREAM, FOCUSED, BLURRY, CRITICAL, CHAMELEON, POWERFUL, HEALTHY, JOURNEY, FAMILY, BRAINS, MILLIONS, GHIDRA, $2000. Strong nouns, vivid adjectives, names, numbers and powerful verbs (QUIT, BUILD, CHANGE) are big. Small everyday words are not, even when they are the only content in a line: saw, came, share, learned, supposed, people, point, ready, know, think, want, make, look, see, go, ask, say.
- Find as many big words as you can. Go row by row and give every row its biggest word: "got more FOCUSED", "it was still BLURRY", "so CRITICAL to be a chameleon", "different ARTISTS". Leave a row out only when it has no big word at all ("and it, it was", "to say that I'm", "it's like I finally saw what"). Skipping a row that has a big word is an error.
- When a line has several candidates, prefer them in this order:
  1. Numbers, money, percentages, counts and time spans: "$2000", "5%", "10x", "3 years".
  2. The payoff the line exists for: "make your DREAMS come true", "as we go on this JOURNEY", "take the world by STORM".
  3. A word the speaker aims at the viewer: "why not YOU?" (here "you" is the point, not "why").
  4. Strong emotion, action or verdict words: QUIT, FAILED, NEVER, FREE, WRONG, WIN.
  5. The second half of a contrast: "it's not hard, it's SIMPLE".
  6. The name, brand, product, place or thing a line is about: "putting MINECRAFT inside Elden Ring", "the modders say CLAUDE wrote the code", "a free tool called GHIDRA".
- Choose the word that carries the new information, usually a noun. The last word of a sentence is not automatically the point: in "Claude wrote most of the code" pick CLAUDE, not WROTE; in "every name and comment gets thrown away" pick the thing, not AWAY.
- Never pick a vague word that means little on its own: works, way, away, thing, stuff, part, right, done, got, put, come, true.
- Parallel lines each get their own payoff, all of them: "You can STUDY the plan. You can CHANGE your life. You can GROW in your skills." Never highlight one and skip its partner.
- Pick the noun, not the adjective in front of it: "financial WALL", "personal DREAMS". Pick an adjective only when it is the point: "you are POWERFUL".
- Never pick filler, function words, auxiliaries, question words or plain pronouns: so, um, like, the, a, is, was, be, been, and, to, my, just, really, very, actually, gonna, I'm, it's, that's, can, will, what, how, why, this.
- Never pick a word that only completes a phrase: a verb particle ("gave UP" → pick the thing given up), a comparative helper ("got MORE focused" → FOCUSED), a form of "to be" ("supposed to BE").
- A word may be the key word again on a later line when it is still the point: "you gave up on your DREAM" / "No, my DREAM just got more focused". Never swap to a weaker word just to avoid repeating one.
- Hindi and Hinglish follow the same rules: pick the content word (a noun, number, name or strong verb), never particles or helpers such as तो, कि, है, हैं, था, ना, भी, ही, को, में, से, का, की, के, toh, ki, hai, na, bhi, ko, mein.
- When a word is merged into the previous one by an edit, point at the word that keeps the text (the first of the merge).

EDITS — fix the transcript conservatively. List only words you change.
- Most transcripts already have punctuation and casing. Never list a word whose text stays exactly the same; an unchanged word in edits is an error.
- Add missing sentence punctuation (. , ? !) to the word it follows. Questions end with "?". Capitalize the first word of a sentence; keep everything else as spoken.
- Spoken numbers become digits. To merge a word into the previous one, give it text "" and put the full merged text on the previous word: 7:two 8:thousand 9:dollars → ["7:two","$2000"],["8:thousand",""],["9:dollars",""]. "five percent" → "5%". Any language, any script: पच्चीस → "25", दो हज़ार → "2000" (हज़ार gets ""), do lakh rupaye → "₹2 lakh", ten k → "10K", 1st/2nd stay as digits. Keep a number word only inside an idiom or a name (एक बार, "one day").
- Fix only obvious speech-to-text mishearings. Never paraphrase, translate, censor, add or drop meaning. Keep the original language and script of every word: Hindi stays Devanagari (पिक्चर stays पिक्चर, never "picture"), Hinglish stays Latin.

CHUNKS — [start,end] index ranges of 2-5 words that must never be split across captions.
- Use them rarely, only for tight units that lose their meaning when split: a short question ("why not you?"), a full name, a number with its unit, an idiom. Most of the transcript stays outside chunks. Chunks never overlap.

Example input:
0:so 1:what 2:is 3:stopping 4:you
5:i 6:made 7:two 8:thousand 9:dollars
10:in 11:a 12:week 13:and 14:honestly
15:i 16:was 17:just
18:sitting 19:at 20:home

21:you 22:can 23:learn 24:the 25:skill
26:you 27:can 28:build 29:the 30:business
Example output:
{"edits":[["0:so","So"],["4:you","you?"],["5:i","I"],["7:two","$2000"],["8:thousand",""],["9:dollars",""],["12:week","week."],["13:and","And"],["15:i","I"],["20:home","home."],["21:you","You"],["25:skill","skill."],["26:you","You"],["30:business","business."]],"emphasis":["4:you","7:two","12:week","20:home","25:skill","30:business"],"chunks":[[7,9]]}`;

/** Cuts the words into on-screen lines the way Premium cuts its chunks. */
export function captionLines(words: AIWord[]) {
  const lines: AIWord[][] = [];
  let line: AIWord[] = [];
  for (const word of words) {
    const previous = line[line.length - 1];
    if (previous && (word.gapMs > LINE_PAUSE_MS || line.length >= LINE_WORDS ||
      [...line, word].map((item) => item.text).join(" ").length > LINE_CHARACTERS)) {
      lines.push(line);
      line = [];
    }
    line.push(word);
    if (/[.!?।॥]["'”’)]?$/u.test(word.text)) {
      lines.push(line);
      line = [];
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Packs whole lines into requests of at most `limit` words, so no line is cut between two. */
export function packLines(words: AIWord[], limit = AI_CHUNK_WORDS) {
  const requests: AIWord[][] = [];
  let request: AIWord[] = [];
  for (const line of captionLines(words)) {
    if (request.length && request.length + line.length > limit) {
      requests.push(request);
      request = [];
    }
    request.push(...line);
  }
  if (request.length) requests.push(request);
  return requests;
}

/** One caption line per row, each word as "index:word"; a long pause becomes a blank row. */
export function formatWords(words: AIWord[]) {
  return captionLines(words)
    .map((line, index) => `${index && line[0].gapMs >= BREATH_MS ? "\n" : ""}${line
      .map((word) => `${word.i}:${word.text.replace(/\s+/g, " ")}`).join(" ")}`)
    .join("\n");
}

/**
 * The model's answer as an object. Models sometimes write a draft and then a corrected object, or
 * wrap the object in prose; the last complete object that parses is the answer.
 */
export function parseModelJson(content: string): unknown {
  let answer: unknown = null, depth = 0, start = -1, quoted = false, escaped = false;
  for (let at = 0; at < content.length; at++) {
    const character = content[at];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = depth > 0;
    else if (character === "{") { if (!depth++) start = at; }
    else if (character === "}" && depth && !--depth) {
      try {
        const parsed: unknown = JSON.parse(content.slice(start, at + 1));
        if (parsed && typeof parsed === "object") answer = parsed;
      } catch { /* a broken draft; a later object may still be whole */ }
    }
  }
  if (!answer) throw new Error("The model's answer was not valid JSON.");
  return answer;
}

/** Words that never carry a line, whatever the model says. "you" is left out on purpose ("why not YOU?"). */
const NEVER_KEY = new Set(("a an the and or but so of to in on at for from with by as is am are was were be been being " +
  "it its it's i i'm me my we our they their he she his her this that that's these those what how why who when where " +
  "can could will would should do does did have has had just really very actually like um uh gonna wanna " +
  "works way away thing things stuff part right done got put come true not here there ask say said came " +
  "saw see supposed people point know think want make look go going get " +
  "up down out off them all own even still most then also other same each every " +
  "gave give more less cause 'cause because since finally back already nothing through aren't isn't don't " +
  "become becomes working which though before after around without another something anything " +
  "जी लिए आज कौन क्या वजह कुछ मैं मैंने उसे अपने अब जब इन्हें इन्होंने तुम हम आप वे " +
  "नहीं जा जाता जाते रहा रहे रही कहा कहते कहता लगा लगता पूछा " +
  "तो कि है हैं था थे थी हूं हो ना भी ही को में से का की के और पर ये यह वो वह toh ki hai hain tha na bhi hi ko mein se ka ke aur").split(" "));
const bareWord = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}'’]/gu, "").replace(/’/g, "'");
const DEVANAGARI = /[ऀ-ॿ]/u, LATIN = /[a-z]/i;

const biggestWord = (line: AIWord[], shown: (i: number) => string, previous: string) => {
  let best: number | undefined, weight = 0;
  for (const word of line) {
    const text = shown(word.i);
    if (!text || NEVER_KEY.has(text) || text === previous || DEVANAGARI.test(text)) continue;
    const size = /\p{N}/u.test(text) ? 12 : [...text].length;
    if (size >= 6 && size > weight) { best = word.i; weight = size; }
  }
  return best;
};

/**
 * Applies the rules a model can slip on, on the server, so every model is held to them:
 * one key word per line, never a filler word, and no edit that swaps a word's script.
 */
export function guardEnhancement(result: AIEnhancement, words: AIWord[]): AIEnhancement {
  const byIndex = new Map(words.map((word) => [word.i, word]));
  const edits = result.edits.filter((edit) => {
    const before = byIndex.get(edit.i)?.text ?? "", after = edit.text;
    if (after === before) return false;
    // An "index:word" fragment is the input format leaking into the answer, never a real fix.
    if (/(^|\s)\d+:\S/u.test(after)) return false;
    // Digits are fine in any script ("दो" → "2"); letters must stay in the word's own script.
    const toLatin = DEVANAGARI.test(before) && !DEVANAGARI.test(after) && LATIN.test(after);
    const toDevanagari = !DEVANAGARI.test(before) && LATIN.test(before) && DEVANAGARI.test(after);
    return !toLatin && !toDevanagari;
  });
  const textOf = new Map(edits.map((edit) => [edit.i, edit.text]));
  const shown = (i: number) => bareWord(textOf.get(i) ?? byIndex.get(i)?.text ?? "");
  const picked = new Set(result.emphasis.filter((i) => !NEVER_KEY.has(shown(i))));
  // A fast model sometimes leaves many lines empty. An English line it skipped still gets its biggest
  // real word (6+ letters, or a number), so the key words stay frequent; Hindi keeps only the model's picks.
  let previous = "";
  const emphasis = captionLines(words).flatMap((line) => {
    const chosen = line.find((word) => picked.has(word.i))?.i ?? biggestWord(line, shown, previous);
    if (chosen === undefined) return [];
    previous = shown(chosen);
    return [chosen];
  });
  return { ...result, edits, emphasis };
}

const isIndex = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** Keeps only well-formed decisions inside [min, max]; everything else is dropped. */
/** How far from its stated index a quoted word may be found, when a model miscounts. */
const NEAR = 6;

export function sanitizeEnhancement(
  raw: unknown,
  min: number,
  max: number,
  /** The words that were sent: lets a quoted "index:word" be checked against the real word. */
  words?: AIWord[],
): AIEnhancement {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const textAt = new Map(words?.map((word) => [word.i, bareWord(word.text)]));
  /**
   * A word reference: a bare index, or "index:word" copied from the input. A quoted word must
   * really be there; when the index is off, the same word nearest to it is used, else it's dropped.
   */
  const locate = (value: unknown): number | undefined => {
    if (typeof value === "number") return isIndex(value, min, max) ? value : undefined;
    if (typeof value !== "string") return undefined;
    const match = /^\s*(\d+)\s*:\s*(.*?)\s*$/u.exec(value);
    if (!match) return undefined;
    const stated = Number(match[1]), wanted = bareWord(match[2]);
    if (!words || !wanted) return isIndex(stated, min, max) ? stated : undefined;
    for (let offset = 0; offset <= NEAR; offset++)
      for (const at of offset ? [stated - offset, stated + offset] : [stated])
        if (isIndex(at, min, max) && textAt.get(at) === wanted) return at;
    return undefined;
  };
  const edits = list(input.edits).flatMap((edit) => {
    if (!edit || typeof edit !== "object") return [];
    // Edits arrive as ["index:word", "text"]; [index, "text"] and {i, text} are still accepted.
    const [where, text] = Array.isArray(edit) ? edit : [(edit as { i?: unknown }).i, (edit as { text?: unknown }).text];
    const i = locate(where);
    if (i === undefined || typeof text !== "string") return [];
    const clean = text.replace(/\s+/g, " ").trim();
    // A merge needs a previous word to absorb it.
    if (clean.length > 40 || (!clean && i === min)) return [];
    return [{ i, text: clean }];
  });
  const unique = (value: unknown) =>
    [...new Set(list(value).map(locate).filter((i): i is number => i !== undefined))].sort(
      (a, b) => a - b,
    );
  const merged = new Set(edits.filter((edit) => !edit.text).map((edit) => edit.i));
  const emphasis = unique(input.emphasis).filter((i) => !merged.has(i));
  const chunks: [number, number][] = [];
  const ranges = list(input.chunks).filter(
    (range): range is [number, number] =>
      Array.isArray(range) &&
      isIndex(range[0], min, max) &&
      isIndex(range[1], min, max) &&
      range[1] > range[0] &&
      range[1] - range[0] < MAX_CHUNK_WORDS,
  );
  for (const range of ranges.sort((a, b) => a[0] - b[0]))
    if (!chunks.length || range[0] > chunks[chunks.length - 1][1])
      chunks.push([range[0], range[1]]);
  return { edits, emphasis, chunks };
}

const cueText = (cue: Cue) =>
  [cue.lead, cue.hero, cue.trail].filter(Boolean).join(" ").trim();

export function cuesToAIWords(cues: Cue[]): AIWord[] {
  return cues.map((cue, i) => ({
    i,
    text: cueText(cue),
    gapMs: i ? Math.max(0, Math.round((cue.start - cues[i - 1].end) * 1000)) : 0,
  }));
}

/**
 * Applies an AI result to the current cues. Previous AI decisions are replaced; anything the
 * user set by hand (an explicit highlight on/off, a word they retyped) wins over the AI.
 */
export function applyCaptionAI(
  cues: Cue[],
  result: CaptionAIResult,
  /** Text each word had when it was sent, so words edited meanwhile are left alone. */
  sentText: Record<string, string>,
) {
  const emphasis = new Set(result.emphasis);
  const chunkOf = new Map(
    result.chunks.flatMap((ids) => ids.map((id) => [id, ids[0]] as const)),
  );
  const next: Cue[] = [];
  let edited = 0;
  for (const original of cues) {
    let cue: Cue = { ...original };
    // Forget the previous AI pass.
    if (cue.aiEmphasis) {
      cue.highlighted = undefined;
      cue.aiEmphasis = undefined;
    }
    cue.pageBreak = undefined;
    cue.chunkId = chunkOf.get(cue.id);

    const unchanged = sentText[cue.id] === cueText(cue);
    const replacement = unchanged ? result.edits[cue.id] : undefined;
    if (replacement === "" && next.length) {
      // Merge into the previous word: it absorbs this word's time span.
      const previous = next[next.length - 1];
      next[next.length - 1] = {
        ...previous,
        end: Math.max(previous.end, cue.end),
        // The merged word's emoji stays with the word that absorbs it.
        emoji: previous.emoji ?? cue.emoji,
      };
      edited++;
      continue;
    }
    if (replacement && replacement !== cueText(cue)) {
      cue = {
        ...cue,
        aiOriginal: cue.aiOriginal ?? cueText(cue),
        lead: undefined,
        hero: replacement,
        trail: undefined,
      };
      edited++;
    }
    if (emphasis.has(cue.id) && cue.highlighted === undefined) {
      cue.highlighted = true;
      cue.aiEmphasis = true;
    }
    next.push(cue);
  }
  return {
    cues: next,
    stats: {
      edited,
      emphasized: next.filter((cue) => cue.highlighted === true).length,
      chunks: new Set(next.flatMap((cue) => cue.chunkId ?? [])).size,
    },
  };
}
