/**
 * Mix captions: the main words of a caption in English letters, the rest in the speaker's own script
 * ("हर CHAMPION को एक DREAM चाहिए"). The editor puts each word's English form on `mix`; a word shows it
 * when the template treats it as a key or main word: one the user or the AI marked (wordStyles emphasized),
 * or the main word a template's own plan picks (see planHeroes). Every other word keeps its own text.
 */
type MixWord = Record<string, unknown> & { id?: unknown; text?: unknown; mix?: unknown };

export const mixText = (word: MixWord) => (typeof word.mix === "string" && word.mix.trim() ? word.mix : String(word.text ?? ""));

/** A word inside a whole line set in English letters: Hinglish spelling ("har champion ko") reads better than word-by-word English. */
export const latinText = (word: MixWord & { latin?: unknown }) =>
  typeof word.latin === "string" && word.latin.trim() ? word.latin : mixText(word);

/**
 * Two-line styles: in Mix the top line is the spoken words in English letters ("ganga maiya ki") and the
 * bottom line stays in the speaker's script ("याद कैसे आई"). No word is translated.
 */
export const TWO_LINE_LATIN = new Set(["red-wipe", "creator", "double-trouble", "mumbai-script", "sunday-script", "crimson-rise"]);

/** A word on the top line of a two-line style: its English-letters spelling in Mix, itself otherwise. */
export const topLineText = (word: MixWord & { latin?: unknown }) => latinText(word);
export const topLineWord = <W extends MixWord & { latin?: unknown }>(word: W): W => {
  const text = latinText(word);
  return text === word.text ? word : { ...word, text };
};

/** The transcript with marked key words swapped to their English form. Same object when nothing changes. */
export function withMixedKeys<T>(sourceConfig: T, wordStyles: Record<string, { emphasized?: boolean } | undefined> | undefined): T {
  const transcript = (sourceConfig as { transcript?: MixWord[] } | undefined)?.transcript;
  if (!Array.isArray(transcript) || !transcript.some((word) => typeof word.mix === "string")) return sourceConfig;
  let changed = false;
  const words = transcript.map((word) => {
    if (!wordStyles?.[String(word.id)]?.emphasized) return word;
    const text = mixText(word);
    if (text === word.text) return word;
    changed = true;
    return { ...word, text };
  });
  return changed ? ({ ...(sourceConfig as object), transcript: words } as T) : sourceConfig;
}
