import { useMemo } from "react";
import { useScriptFonts } from "./ScriptFonts";
import { TWO_LINE_LATIN, withMixedKeys } from "./mix";
import { HERO_SHARES } from "../Premium/heroPlan";

type LanguageProps = { sourceConfig?: unknown; presentationConfig?: { wordStyles?: Record<string, { emphasized?: boolean } | undefined> } };

/** Every word the captions can show, for finding the scripts they need fonts for. */
const textOf = (sourceConfig: unknown) => {
  const transcript = (sourceConfig as { transcript?: { text?: unknown; mix?: unknown }[] } | undefined)?.transcript;
  return Array.isArray(transcript) ? transcript.map((word) => `${word.text ?? ""} ${word.mix ?? ""}`).join(" ") : "";
};

/**
 * The language layer every caption goes through, in the editor and in renders alike: fonts for the scripts in
 * the words (Script/ScriptFonts) and, in Mix captions, key words swapped to English letters (Script/mix).
 * `props` is the same object when the captions need neither, so English captions are untouched. `fontsKey`
 * changes when script fonts arrive; the caller keys the template on it so its words are measured again.
 */
export function useCaptionLanguage<P extends LanguageProps>(props: P, styleId?: string): { props: P; fontsKey: number } {
  const wordStyles = props.presentationConfig?.wordStyles;
  // Styles built around one main word per caption (OG, Anchor Stack, Maroon King…) swap only that word, in
  // their plan (Premium/heroPlan.ts); their helper lines stay in the speaker's script. Two-line styles set
  // their whole top line in English letters and keep the bottom line native (Script/mix TWO_LINE_LATIN).
  const own = !!styleId && (!!HERO_SHARES[styleId] || TWO_LINE_LATIN.has(styleId));
  const sourceConfig = useMemo(() => own ? props.sourceConfig : withMixedKeys(props.sourceConfig, wordStyles),
    [props.sourceConfig, wordStyles, own]);
  const { version } = useScriptFonts(useMemo(() => textOf(props.sourceConfig), [props.sourceConfig]));
  return { props: sourceConfig === props.sourceConfig ? props : { ...props, sourceConfig }, fontsKey: version };
}
