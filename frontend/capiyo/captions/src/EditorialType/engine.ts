import { clamp, finite } from "../CaptionEngine/types";
import { compileSmartTextFlow, resolveFlowStyle } from "../SmartTextFlow/engine";
import defaults from "./editorial-type.config.json";
import type { EditorialCue, EditorialSettings, EditorialSource, EditorialStyle, EditorialToken } from "./types";

export const resolveEditorialStyle = (style: EditorialStyle = {}): EditorialSettings => {
  const range = (key: Exclude<keyof EditorialSettings, "mainPick" | "tracking">, min: number, max: number) => clamp(finite(style[key], defaults[key] as number), min, max);
  return {
    text: /^#[\da-f]{6}$/i.test(style.text ?? "") ? style.text! : defaults.text,
    canvas: /^#[\da-f]{6}$/i.test(style.canvas ?? "") ? style.canvas! : defaults.canvas,
    positionY: range("positionY", 0.2, 0.84), maxWidth: range("maxWidth", 0.48, 0.9),
    fontSize: range("fontSize", 30, 84), helperSize: range("helperSize", 22, 60), heroSize: range("heroSize", 85, 216), numberSize: range("numberSize", 90, 216),
    mainPick: clamp(finite(style.mainPick, 1), .7, 1.4),
    rowGap: range("rowGap", 2, 20), maxWords: Math.round(range("maxWords", 3, 9)),
    maxCharacters: Math.round(range("maxCharacters", 24, 68)), maxDurationMs: range("maxDurationMs", 900, 4000),
    wordMs: range("wordMs", 100, 600), holdMs: range("holdMs", 100, 700),
    entryMs: range("entryMs", 90, 300), exitMs: range("exitMs", 45, 160),
    shadow: range("shadow", 0, 1), backgroundDim: range("backgroundDim", 0, 0.6),
    transparent: style.transparent === true, alignment: style.alignment === "center" ? "center" : "editorial",
    scriptFrequency: range("scriptFrequency", 0, 1),
  };
};
const lyrical = new Set("dream dreams identity meaning powerful beautiful negative positive having believe courage confidence potential story stories feeling everything freedom possibility possibilities purpose focus impact intention".split(" "));
const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
const connectors = new Set("a an and are as at be been but by can do for from had has have he her him his i if in is it its me my of on or our she so than that the their them there these they this those to us was we were what when which who will with you your है हैं का की के को में और तो यह ये एक से पर".split(" "));
/** The two touching content words a plain line leans on, or its best single word when no two touch. */
const STRONG_LETTERS = 15;
const strongRun = <T extends { id: string; text: string }>(tokens: T[], content: T[], ranked: T[]) => {
  const open = new Set(content.map(token => token.id));
  let run: string[] = [], best = 0;
  tokens.slice(1).forEach((token, index) => {
    const before = tokens[index], letters = plain(before.text).length + plain(token.text).length;
    if (open.has(before.id) && open.has(token.id) && letters <= STRONG_LETTERS && letters > best) { run = [before.id, token.id]; best = letters; }
  });
  return run.length || !ranked.length ? run : [ranked[0].id];
};
const seeded = (id: string) => [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7) % 100;
const STRONG_SHARE = 60;
/** Share validated JSON/timestamp ingestion with SmartTextFlow; art direction is separate. */
export const compileEditorialType = (source: EditorialSource, settings = resolveEditorialStyle(), fps = 30) => {
  const input = compileSmartTextFlow(source, resolveFlowStyle({
    maxWords: settings.maxWords, maxCharacters: settings.maxCharacters, maxDurationMs: settings.maxDurationMs,
    maxLines: 3, maxGapMs: 380, wordMs: settings.wordMs, holdMs: settings.holdMs,
  }), fps, false);
  let designQuota = 0.4;
  const directed = !!(source.segments || source.cues);
  // With key words chosen, those words alone get the lockup and every other line stays a normal line.
  const keyed = !directed && input.tokens.some(token => token.marked);
  const cues: EditorialCue[] = input.cues.map((cue) => {
    const numbers = cue.tokens.filter((token) => token.number);
    const explicit = directed ? cue.tokens.filter((token) => token.role === "expressive" || token.role === "script") : [];
    const soft = cue.tokens.find((token) => lyrical.has(plain(token.text)));
    const metric = numbers.find((token) => token.large) ?? numbers[0];
    const content = cue.tokens.filter(token => !token.number && !connectors.has(plain(token.text)) && plain(token.text).length >= 3);
    const ranked = [...content].sort((a, b) =>
      (Number(lyrical.has(plain(b.text))) * 12 + Math.min(10, plain(b.text).length) + Number(b.id === cue.focusId) * 3) -
      (Number(lyrical.has(plain(a.text))) * 12 + Math.min(10, plain(a.text).length) + Number(a.id === cue.focusId) * 3));
    const keyWord = cue.tokens.find((token) => token.marked && token.id === cue.focusId) ?? cue.tokens.find((token) => token.marked);
    const hero = metric ?? explicit[0] ?? keyWord ?? soft ?? ranked[0] ?? cue.tokens.find((token) => token.id === cue.focusId);
    const first = hero ? cue.tokens.indexOf(hero) : -1;
    // Only adjacent expressive words share a hero row. Never scatter fonts by cue index.
    const heroIds = metric ? [metric.id] : explicit.length ? cue.tokens.slice(first).filter((token, index, rest) =>
      index < 2 && explicit.some((item) => item.id === token.id) &&
      rest.slice(0, index).every((item) => explicit.some((word) => word.id === item.id))).map((token) => token.id) : hero ? [hero.id] : [];
    const eligible = !directed && !keyed && !metric && content.length > 0 && cue.tokens.length >= 3;
    if (eligible) designQuota += settings.scriptFrequency;
    const automaticScript = eligible && settings.scriptFrequency > 0 && designQuota >= 1;
    if (automaticScript) designQuota -= 1;
    const kind: EditorialCue["kind"] = numbers.length === 2 && cue.tokens.length <= 7 ? "comparison" : metric ? "metric" :
      (cue.tokens.length >= 3 && (explicit.length > 0 || automaticScript)) || (keyed && keyWord) ? "hero" : "phrase";
    // Plain lines stay plain or lean on a heavy phrase, by line rather than by a pattern the eye can catch.
    const bold = directed ? cue.tokens.filter(token => token.role === "strong").map(token => token.id) : [];
    const strong = kind !== "phrase" || explicit.length ? [] : cue.tokens.length === 1 ? [cue.tokens[0].id] : bold.length ? bold :
      seeded(cue.id) < STRONG_SHARE ? strongRun(cue.tokens, content, ranked) : [];
    const tokens: EditorialToken[] = cue.tokens.map((token) => {
      const typeRole = token.number ? "number" as const :
        (kind === "hero" && heroIds.includes(token.id)) || (kind === "phrase" && explicit.some(word => word.id === token.id)) ? "serif" as const :
          strong.includes(token.id) ? "strong" as const : "body" as const;
      // Mix: the big word reads in English letters, the rest in the speaker's script.
      return { ...token, typeRole, ...(typeRole === "serif" && token.mix ? { text: token.mix } : {}) };
    });
    return { ...cue, tokens, kind, heroIds };
  });
  return { ...input, cues };
};

export const currentEditorialCue = (cues: EditorialCue[], now: number) => {
  let low = 0, high = cues.length - 1, found = -1;
  while (low <= high) { const mid = (low + high) >>> 1;
    if (cues[mid].startMs <= now) { found = mid; low = mid + 1; } else high = mid - 1; }
  return found >= 0 && now < cues[found].endMs ? cues[found] : null;
};
