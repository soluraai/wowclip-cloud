/**
 * Templates load fonts under made-up family names ("BasicCaption-123-456") so faces never clash. Script fonts
 * pick a Hindi or Tamil face by what a font is for (cursive, serif, condensed…), read from its real name and
 * file, so each made-up name is recorded here with the font it stands for.
 */
const names = new Map<string, string>();

/** Records what a made-up family name stands for; returns the name unchanged. */
export const nameFont = (alias: string, ...hints: (string | undefined)[]) => {
  if (!names.has(alias)) names.set(alias, hints.filter(Boolean).join(" "));
  return alias;
};

/** The real font behind a family name, with its file name, for reading its role. */
export const fontNameOf = (family: string) => {
  const real = names.get(family);
  return real ? `${family} ${real}` : family;
};
