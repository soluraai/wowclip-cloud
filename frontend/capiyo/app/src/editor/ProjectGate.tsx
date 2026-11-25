"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { SaveState, SyncPhase } from "./useProjectSync";
import s from "./ProjectGate.module.css";
import LogoLoader from "../app/LogoLoader";
import { CaptionSetup, LookPicker, TranscribeProgress } from "./CaptionSetup";
import type { Transcript } from "../projects/types";
import type { CaptionScript, HearingOptions } from "../language/languages";

/** What the editor shows until the project is open: loading, making captions, or what went wrong. */
export function ProjectGate({ phase, error, onRetry, heard, onStart, onPickLook, duration = 0, transcribeSince = 0, credits = null }: {
  phase: SyncPhase;
  duration?: number;
  transcribeSince?: number;
  credits?: number | null;
  error: string;
  onRetry: () => void;
  heard?: Transcript | null;
  onStart: (hearing: HearingOptions) => void;
  onPickLook: (script: CaptionScript) => void;
}) {
  if (phase === "setup" || (phase === "look" && heard))
    return (
      <main className={s.gate}>
        <Link href="/" className={s.brand} aria-label="Back to Home">
          capiyo<span>.</span>
        </Link>
        {phase === "setup" ? <CaptionSetup onStart={onStart} duration={duration} credits={credits} /> : <LookPicker transcript={heard!} onPick={onPickLook} />}
      </main>
    );
  if (phase === "transcribing")
    return (
      <main className={s.gate} aria-busy="true">
        <Link href="/" className={s.brand} aria-label="Back to Home">
          capiyo<span>.</span>
        </Link>
        <TranscribeProgress duration={duration} since={transcribeSince} />
      </main>
    );
  return (
    <main className={s.gate} aria-busy={phase !== "error"}>
      <Link href="/" className={s.brand} aria-label="Back to Home">
        capiyo<span>.</span>
      </Link>
      <section className={s.box}>
        {phase === "error" ? (
          <>
            <h1>Something went wrong</h1>
            <p>{error}</p>
            <div className={s.actions}>
              <button type="button" onClick={onRetry}>Try again</button>
              <Link href="/">Back to Home</Link>
            </div>
          </>
        ) : phase === "translating" ? (
          <>
            <h1>Translating to English…</h1>
            <p>Each line is translated and timed to when it was said.</p>
            <LogoLoader size={46} />
          </>
        ) : (
          <>
            <h1>Opening your project…</h1>
            <LogoLoader size={46} />
          </>
        )}
      </section>
    </main>
  );
}

const LABEL: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Saving soon",
  offline: "Offline",
};

/** Small auto-save indicator for the editor header. */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span className={`${s.save} ${s[state]}`} role="status" title="Your work saves automatically">
      {LABEL[state]}
    </span>
  );
}

const PHONE = "(max-width: 760px)";
const watchPhone = (change: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

/** True on a phone-sized screen (also a narrow desktop window). */
export const usePhone = () => useSyncExternalStore(watchPhone, () => window.matchMedia(PHONE).matches, () => false);

/** Shown instead of the editor on a phone: the work is saved, open it on a computer. */
export function PhoneNotice() {
  return (
    <main className={s.gate}>
      <Link href="/" className={s.brand} aria-label="Back to Home">
        capiyo<span>.</span>
      </Link>
      <section className={`${s.box} ${s.phone}`}>
        <h1>Open the editor on a computer</h1>
        <p>Editing captions needs a bigger screen. Your video and captions are saved: open capiyo on a laptop or desktop with the same Google account to edit and export.</p>
        <div className={s.actions}>
          <Link href="/">Back to Home</Link>
        </div>
      </section>
    </main>
  );
}
