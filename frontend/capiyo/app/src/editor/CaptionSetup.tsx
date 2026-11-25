"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transcript } from "../projects/types";
import {
  LANGUAGES,
  SCRIPT_LABEL,
  languageName,
  scriptChoices,
  scriptHint,
  type CaptionScript,
  type HearingOptions,
} from "../language/languages";
import { exampleLine } from "../language/looks";
import { scriptsIn } from "../../../captions/src/Script/scripts";
import { LanguagePicker } from "./LanguagePicker";
import { CAPTION_RATE, creditLabel, creditsFor, formatCredits } from "../projects/credits";
import { BUY_URL } from "../links";
import s from "./ProjectGate.module.css";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/**
 * Before captions are made: the spoken language and two cleanup choices, with what it costs.
 * Nothing is spent until Make captions.
 */
export function CaptionSetup({ onStart, duration, credits }: {
  onStart: (hearing: HearingOptions) => void;
  /** Video length in seconds (0 while unknown). */
  duration: number;
  /** Credits left, or null while loading. */
  credits: number | null;
}) {
  const [language, setLanguage] = useState("");
  const [cleanFillers, setCleanFillers] = useState(false);
  const [sounds, setSounds] = useState(false);
  const [sent, setSent] = useState(false);
  const cost = duration ? creditsFor(duration, CAPTION_RATE) : 0;
  const short = credits !== null && cost > credits + 1e-9;
  return (
    <section className={`${s.box} ${s.wide} ${s.setup}`}>
      <header className={s.setupHead}>
        <h1>Make captions</h1>
        {duration > 0 && (
          <p>{clock(duration)} video · uses <b>{creditLabel(cost)}</b>{credits !== null && <> · you have {formatCredits(credits)}</>}</p>
        )}
      </header>
      <div className={s.field}>
        <span>Spoken language</span>
        <LanguagePicker value={language} onChange={setLanguage} languages={LANGUAGES} label="Spoken language"
          auto={{ title: "Auto detect", hint: "Best for mixed speech, like Hindi with English." }} />
        <small className={s.fieldHint}>Keep Auto detect for mixed speech like Hinglish. One language only? Pick it.</small>
      </div>
      <div className={s.toggles}>
        <Toggle on={cleanFillers} onChange={setCleanFillers} label="Remove filler words" hint="Leaves out um, uh and false starts." />
        <Toggle on={sounds} onChange={setSounds} label="Show sounds" hint="Adds (laughs), (music) as captions." />
      </div>
      {short ? (
        <div className={s.short}>
          <p>You need {formatCredits(cost - (credits ?? 0))} more credits for this video.</p>
          <a href={BUY_URL}>Buy credits</a>
        </div>
      ) : (
        <button type="button" className={s.go} disabled={sent} onClick={() => {
          setSent(true);
          onStart({ ...(language && { language }), ...(cleanFillers && { cleanFillers }), ...(sounds && { sounds }) });
        }}>
          {sent ? "Starting…" : "Make captions"}
        </button>
      )}
    </section>
  );
}

/** Rough seconds to make captions: sending the audio, ElevenLabs hearing it, then the emojis. */
const expectedSeconds = (duration: number) => Math.max(8, 6 + duration * 0.25);

const STEPS = [
  { until: 0.12, label: "Preparing your audio" },
  { until: 0.72, label: "Listening to every word" },
  { until: 0.9, label: "Timing words and adding emojis" },
  { until: 1, label: "Opening the editor" },
];

/**
 * Making captions is one request with no real progress to report, so the bar follows how long it usually
 * takes for this length of video: quick at first, slowing near the end, never past 95% until it's done.
 */
export function TranscribeProgress({ duration, since }: { duration: number; since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const spent = Math.max(0, (now - (since || now)) / 1000);
  const share = 0.95 * (1 - Math.exp((-2.2 * spent) / expectedSeconds(duration)));
  const step = STEPS.find((item) => share < item.until) ?? STEPS[STEPS.length - 1];
  const percent = Math.floor(share * 100);
  return (
    <section className={`${s.box} ${s.wide} ${s.progress}`} aria-live="polite">
      <h1>Making your captions</h1>
      <div className={s.meter}>
        <strong>{percent}<small>%</small></strong>
        <span>{step.label}…</span>
      </div>
      <div className={s.track} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${share * 100}%` }} />
      </div>
      <p className={s.note}>
        {spent > expectedSeconds(duration) * 2
          ? "Taking longer than usual. It's still working; you can leave this page and come back."
          : `Usually about ${Math.round(expectedSeconds(duration))} seconds. You can leave this page; it keeps going.`}
      </p>
    </section>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={s.toggle} onClick={() => onChange(!on)}>
      <span><strong>{label}</strong><em>{hint}</em></span>
      <i data-on={on} />
    </button>
  );
}

/** After a video that isn't English in English letters: how its captions should read, shown on its own words. */
export function LookPicker({ transcript, onPick }: { transcript: Transcript; onPick: (script: CaptionScript) => void }) {
  const choices = scriptChoices(transcript.language, !!transcript.forms);
  const [script, setScript] = useState<CaptionScript>(choices[0]);
  const [sent, setSent] = useState(false);
  const heard = useMemo(() => {
    const other = scriptsIn(transcript.cues.map((cue) => cue.hero).join(" ")).length > 0;
    const english = transcript.cues.some((cue) => /^[A-Za-z]{3,}$/.test(cue.hero));
    const name = languageName(transcript.language);
    return other && english && name !== "English" ? `${name} with some English` : name;
  }, [transcript]);
  return (
    <section className={`${s.box} ${s.wide}`}>
      <h1>How should your captions read?</h1>
      <p>We heard <strong>{heard}</strong>. You can change this any time in the editor.</p>
      <div className={s.looks} role="radiogroup" aria-label="Caption language">
        {choices.map((choice) => {
          // English is translated once picked; until then its example is built from each word's meaning.
          const line = choice === "english"
            ? transcript.cues.slice(0, 7).map((cue) => cue.forms?.english ?? "").filter(Boolean).join(" ")
            : exampleLine(transcript.cues, choice);
          return (
            <button key={choice} type="button" role="radio" aria-checked={script === choice}
              className={s.look} data-on={script === choice} onClick={() => setScript(choice)}>
              <span className={s.lookHead}>
                <strong>{SCRIPT_LABEL[choice]}</strong>
                {choice === choices[0] && choices.length > 2 && <em>Recommended</em>}
              </span>
              <span className={s.lookLine} dir="auto">{line || "…"}</span>
              <span className={s.lookHint}>{scriptHint(choice, transcript.language)}</span>
            </button>
          );
        })}
      </div>
      <div className={s.actions}>
        <button type="button" disabled={sent} onClick={() => { setSent(true); onPick(script); }}>Open editor</button>
      </div>
    </section>
  );
}
