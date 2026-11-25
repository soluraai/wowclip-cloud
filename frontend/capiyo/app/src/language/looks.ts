import type { Cue } from "../app/CaptionTimeline";
import type { CaptionScript } from "./languages";

/** The text a word shows in a look. Mix shows each word as spoken; its key words switch to English letters when drawn. */
export function formFor(cue: Cue, script: CaptionScript) {
  const forms = cue.forms;
  if (!forms) return cue.hero;
  if (script === "native") return forms.native ?? forms.spoken;
  if (script === "roman") return forms.roman ?? forms.spoken;
  return forms.spoken;
}

/**
 * The form a key word shows in Mix: the same word in English letters (कांटों → kaanton, कर्म → karm), never a
 * translation. Words spoken in English are already their own Latin form (पिक्चर → picture).
 */
export const mixFormOf = (cue: Cue) => cue.forms?.roman;

/**
 * The words in another look. Timing, key words, colors and formats stay; retyped text goes back to the
 * look's own word (a look is a whole new spelling of every word). Words without forms keep their text.
 */
export function applyLook(cues: Cue[], script: CaptionScript): Cue[] {
  return cues.map((cue) => {
    if (!cue.forms) return cue;
    const hero = formFor(cue, script);
    if (hero === cue.hero && !cue.original && !cue.aiOriginal) return cue;
    const next: Cue = { ...cue, hero };
    delete next.original;
    delete next.aiOriginal;
    return next;
  });
}

/** The words that most likely become main words, for showing Mix before the AI has marked any. */
export function likelyKeys(cues: Cue[], every = 4) {
  const keys = new Set<string>();
  for (let start = 0; start < cues.length; start += every) {
    const group = cues.slice(start, start + every).filter((cue) => cue.forms?.roman && [...(cue.forms.native ?? cue.hero)].length > 2);
    const best = group.sort((a, b) => [...(b.forms?.roman ?? "")].length - [...(a.forms?.roman ?? "")].length)[0];
    if (best) keys.add(best.id);
  }
  return keys;
}

/** A short line from the user's own video in each look, for the look picker. */
export function exampleLine(cues: Cue[], script: CaptionScript, english?: Cue[]) {
  const sample = cues.slice(0, 7);
  if (script === "english") return english?.length ? english.slice(0, 7).map((cue) => cue.hero).join(" ") : null;
  if (script !== "mix") return sample.map((cue) => formFor(cue, script)).join(" ");
  const keys = likelyKeys(sample, 4);
  return sample.map((cue) => (keys.has(cue.id) ? (mixFormOf(cue) ?? formFor(cue, "mix")).toUpperCase() : formFor(cue, "mix"))).join(" ");
}
