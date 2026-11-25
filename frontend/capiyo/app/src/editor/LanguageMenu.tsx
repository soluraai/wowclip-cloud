"use client";

import { useEffect, useRef, useState } from "react";
import type { Cue } from "../app/CaptionTimeline";
import { TRANSLATE_TARGETS, languageName, languageOf, targetName, type CaptionScript } from "../language/languages";
import { scriptsIn } from "../../../captions/src/Script/scripts";
import { LanguagePicker } from "./LanguagePicker";
import { FREE_TRANSLATIONS, TRANSLATE_RATE, formatCredits } from "../projects/credits";
import s from "./LanguageMenu.module.css";

/** Each look, shown on the same line in Maroon King ("तेरा हर सपना ज़रूर पूरा होगा"). Made by /language-check?words=demo. */
const EXAMPLE: Partial<Record<CaptionScript, string>> = {
  mix: "/language-demo/mix.webp",
  roman: "/language-demo/roman.webp",
};

/**
 * The captions' language, in the editor's top bar:
 *   As spoken       the default: every word as it was said (what auto-detect heard)
 *   Smart Mix       Capiyo's look: main words in English letters, the rest in the speaker's script
 *   English letters every word in English letters (Hinglish)
 *   Translate       the meaning in another language, picked from the list
 * The middle three only make sense for speech that isn't already in English letters.
 */
export function LanguageMenu({ script, language, translatedTo, cues, busy, onPick }: {
  script: CaptionScript;
  language?: string;
  translatedTo?: string;
  cues: Cue[];
  busy: boolean;
  onPick: (script: CaptionScript, to?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(() => (languageOf(language)?.code === "en" ? "hi" : "en"));
  const root = useRef<HTMLDivElement>(null);
  const name = languageName(language);
  // Speech in another script (or a language written in one) can switch script; English-letter speech can only translate.
  const scripted = (!!language && !languageOf(language)?.latin) || cues.some((cue) => cue.forms?.native) ||
    scriptsIn(cues.slice(0, 80).map((cue) => cue.forms?.spoken ?? cue.hero).join(" ")).length > 0;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      // The language list opens on the page itself, outside this menu: clicks in it keep the menu open.
      const inPicker = (event.target as Element | null)?.closest?.("[data-language-picker]");
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node) && !inPicker) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (next: CaptionScript, to?: string) => {
    setOpen(false);
    onPick(next, to);
  };
  const label = script === "english" ? `Translated · ${targetName(translatedTo ?? "en")}` : {
    spoken: "As spoken", mix: "Smart Mix", roman: "English letters", native: `${name} script`, english: "Translated",
  }[script];

  return (
    <div className={s.root} ref={root}>
      <button type="button" className={s.button} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}
        title="Caption language">
        <GlobeIcon />
        <span>{busy ? "Working…" : label}</span>
      </button>
      {open && (
        <div className={s.menu} role="menu">
          <p className={s.head}>Caption language{language ? <span> · We heard {name}</span> : null}</p>

          <Item on={script === "spoken"} title="As spoken" tag="Default" onClick={() => pick("spoken")}
            hint="Every word exactly as it was said, in its own language and letters." />

          {scripted && (
            <>
              <Item on={script === "mix"} title="Smart Mix" tag="Capiyo" image={EXAMPLE.mix} onClick={() => pick("mix")}
                hint="Main word in English letters, every other word exactly as spoken."
                info={`The main word of each line is written in English letters by its sound (सपना → SAPNA), never translated. Every other word stays exactly as it was said, in ${name}. Two-line styles get the top line in English letters and the bottom line in ${name}. Made in a few seconds the first time you pick it.`} />
              <Item on={script === "roman"} title="English letters" image={EXAMPLE.roman} onClick={() => pick("roman")}
                hint={`All of it in English letters, the way people type ${name} on Instagram.`}
                info={`Every word is written by its sound in English letters (सपना → sapna). Nothing is translated, so it still reads in ${name}.`} />
            </>
          )}

          <div className={s.translate} data-on={script === "english"}>
            <div className={s.translateHead}>
              <strong>Translate</strong>
              <Info text="The meaning is translated into the language you pick, line by line, and timed to when each line was said. The AI then marks the main words again. A language you translated before switches back instantly." />
            </div>
            <em>The meaning changes language, not just the letters. Key words are marked again.</em>
            <small className={s.cost}>First {FREE_TRANSLATIONS} translations of each video are free. After that, {formatCredits(TRANSLATE_RATE)} credits for every 60 seconds of video (a 120-second video = {formatCredits(TRANSLATE_RATE * 2)} credits).</small>
            <div className={s.translateRow}>
              <LanguagePicker value={target} onChange={setTarget} languages={TRANSLATE_TARGETS} size="sm" label="Translate to" />
              <button type="button" onClick={() => pick("english", target)} disabled={script === "english" && translatedTo === target}>
                {script === "english" && translatedTo === target ? "Current" : "Translate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ on, title, tag, hint, info, image, onClick }: {
  on: boolean;
  title: string;
  tag?: string;
  hint: string;
  info?: string;
  image?: string;
  onClick: () => void;
}) {
  return (
    <div className={s.item} role="menuitemradio" aria-checked={on} tabIndex={0} onClick={onClick}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onClick())}>
      <span className={s.itemHead}>
        <i className={s.radio} />
        <strong>{title}</strong>
        {tag && <b className={s.tag}>{tag}</b>}
        {info && <Info text={info} />}
      </span>
      <em>{hint}</em>
      {image && <img className={s.example} src={image} alt={`Example of ${title}`} loading="lazy" />}
    </div>
  );
}

/** A small "i": hover or focus it to read how a look works. */
function Info({ text }: { text: string }) {
  return (
    <span className={s.info} tabIndex={0} aria-label={text} onClick={(event) => event.stopPropagation()}>
      i<span className={s.tip} role="tooltip">{text}</span>
    </span>
  );
}

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3Z" />
  </svg>
);
