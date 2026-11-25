/**
 * Caption languages. ElevenLabs hears the speech (99 languages) and writes each word the way it was said.
 * One AI pass then writes every word three more ways, so captions can switch look without listening again:
 *
 *   spoken   as said: each word in the language and script it was spoken in (code-switched Hinglish stays mixed)
 *   native   every word in the speaker's own script (English words written in it too: "कैंपेन")
 *   roman    every word in English letters, the way people type Hinglish ("sapna", "champion")
 *   mix      Capiyo's look: the main / key words in English, the rest in the speaker's own script
 *   english  translated to English, phrase by phrase (new words, timed across each phrase)
 */
export type CaptionScript = "spoken" | "native" | "roman" | "mix" | "english";

/** A word written each way. `spoken` is what ElevenLabs wrote, kept so every look can be rebuilt. */
export type WordForms = { spoken: string; native?: string; roman?: string; english?: string };

export type Language = {
  /** ISO 639-1 code sent to ElevenLabs. */
  code: string;
  name: string;
  /** Its own name, in its own script. */
  native: string;
  /** Written in English letters already: only Spoken and English looks make sense. */
  latin?: boolean;
  /** Shown in the first group of the menu (India first). */
  india?: boolean;
};

export const LANGUAGES: Language[] = [
  { code: "hi", name: "Hindi", native: "हिन्दी", india: true },
  { code: "en", name: "English", native: "English", latin: true, india: true },
  { code: "bn", name: "Bengali", native: "বাংলা", india: true },
  { code: "mr", name: "Marathi", native: "मराठी", india: true },
  { code: "te", name: "Telugu", native: "తెలుగు", india: true },
  { code: "ta", name: "Tamil", native: "தமிழ்", india: true },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", india: true },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", india: true },
  { code: "ml", name: "Malayalam", native: "മലയാളം", india: true },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", india: true },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", india: true },
  { code: "as", name: "Assamese", native: "অসমীয়া", india: true },
  { code: "ur", name: "Urdu", native: "اردو", india: true },
  { code: "ne", name: "Nepali", native: "नेपाली", india: true },
  { code: "es", name: "Spanish", native: "Español", latin: true },
  { code: "fr", name: "French", native: "Français", latin: true },
  { code: "de", name: "German", native: "Deutsch", latin: true },
  { code: "pt", name: "Portuguese", native: "Português", latin: true },
  { code: "it", name: "Italian", native: "Italiano", latin: true },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", latin: true },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "tr", name: "Turkish", native: "Türkçe", latin: true },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", latin: true },
];

/** Languages captions can be translated into: every spoken language above, plus more that are only written. */
export const TRANSLATE_TARGETS: { code: string; name: string; native: string }[] = [
  ...LANGUAGES,
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "fil", name: "Filipino", native: "Filipino" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "no", name: "Norwegian", native: "Norsk" },
];
export const targetName = (code: string) => TRANSLATE_TARGETS.find((item) => item.code === code)?.name ?? code;

/** ElevenLabs answers with ISO 639-3 ("hin") or 639-1 ("hi"). */
const THREE: Record<string, string> = {
  hin: "hi", eng: "en", ben: "bn", mar: "mr", tel: "te", tam: "ta", guj: "gu", kan: "kn", mal: "ml", pan: "pa",
  ori: "or", ory: "or", asm: "as", urd: "ur", nep: "ne", spa: "es", fra: "fr", deu: "de", ger: "de", por: "pt",
  ita: "it", ind: "id", ara: "ar", rus: "ru", jpn: "ja", kor: "ko", zho: "zh", cmn: "zh", chi: "zh", tha: "th",
  tur: "tr", vie: "vi",
};
export const languageCode = (code: string | undefined) => (code ? THREE[code.toLowerCase()] ?? code.toLowerCase().slice(0, 2) : undefined);
export const languageOf = (code: string | undefined) => LANGUAGES.find((language) => language.code === languageCode(code));
export const languageName = (code: string | undefined) => languageOf(code)?.name ?? (code ? code.toUpperCase() : "Unknown");

/** Choices before captions are made. Sent to ElevenLabs. */
export type HearingOptions = {
  /** ISO 639-1 code, or undefined to detect it. */
  language?: string;
  /** Leave out "um", "uh", false starts. */
  cleanFillers?: boolean;
  /** Write sounds like (laughs) and (music). */
  sounds?: boolean;
};

/** Which looks this transcript can offer. English speech in English letters has nothing to convert. */
export function scriptChoices(language: string | undefined, hasForms: boolean): CaptionScript[] {
  if (!hasForms) return ["spoken"];
  return languageOf(language)?.latin ? ["spoken", "english"] : ["mix", "native", "roman", "spoken", "english"];
}

export const SCRIPT_LABEL: Record<CaptionScript, string> = {
  mix: "Smart Mix",
  native: "Native script",
  roman: "English letters",
  spoken: "As spoken",
  english: "Translated",
};

export function scriptHint(script: CaptionScript, language: string | undefined) {
  const name = languageName(language);
  return {
    mix: `Main words in English letters (no translation), the rest in ${name}. Two-line templates: top line in English letters, bottom line in ${name}.`,
    native: `Every word in ${name} script, English words too.`,
    roman: `${name} written in English letters, like people type on Instagram.`,
    spoken: "Each word exactly as it was said, in its own language.",
    english: `Translated from ${name} to English.`,
  }[script];
}
