"use client";

import { useEffect, useRef, useState } from "react";
import { getProject, transcribeProject, type ProjectPayload } from "../projects/api";
import { watchMine } from "../projects/live";
import type { CaptionScript, HearingOptions } from "../language/languages";
import type { Project, Transcript } from "../projects/types";
import type { EditorDraft } from "./draft";

/** Every change lands in this browser after a short pause: instant, free, survives a power cut. */
const LOCAL_DELAY_MS = 600;
/** The cloud copy catches up on this beat, but only when something changed (1 write per save). */
const CLOUD_EVERY_MS = 30_000;
const RETRY_MS = 8_000;

export type Opened = { project: Project; draft: EditorDraft | null; transcript?: Transcript; script?: CaptionScript };
/** setup: choices before captions are made. look: how a non-English video's captions should read. */
export type SyncPhase = "loading" | "setup" | "transcribing" | "look" | "translating" | "ready" | "error";
export type SaveState = "saved" | "saving" | "unsaved" | "offline";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves when the project stops "transcribing" (watched live in Firestore), or after `ms` at the latest. */
function statusMoved(id: string, ms: number) {
  return new Promise<void>((resolve) => {
    let stop = () => {};
    let timer = window.setTimeout(done, ms);
    function done() {
      window.clearTimeout(timer);
      stop();
      resolve();
    }
    stop = watchMine(`projects/${id}`,
      (data) => { if (!data || data.status !== "transcribing") done(); },
      // No live updates (offline, or rules not published): look again sooner.
      () => { window.clearTimeout(timer); timer = window.setTimeout(done, RETRY_MS); });
  });
}

/**
 * Opens a cloud project in the editor and keeps it saved:
 *   1. load it (and make captions first if the video is new, which spends a credit)
 *   2. prefer this browser's copy when it is newer than the cloud's (e.g. after a power cut)
 *   3. auto-save locally on every change and to the cloud every 30 s and when the tab hides
 */
export function useProjectSync(
  id: string,
  current: EditorDraft,
  open: (opened: Opened) => Promise<void>,
  onCreditsChanged: () => void,
  /** My styles' studio has no project: nothing is loaded or saved. */
  off = false,
) {
  const [phase, setPhase] = useState<SyncPhase>(off ? "ready" : "loading");
  const [error, setError] = useState("");
  const saveState = "saved" as SaveState;
  const [attempt, setAttempt] = useState(0);
  // The video's length, for the setup's price and the transcription's progress estimate.
  const [duration, setDuration] = useState(0);
  const [transcribeSince, setTranscribeSince] = useState(0);
  // The transcript the look picker shows examples from.
  const [heard] = useState<Transcript | null>(null);
  const answer = useRef<{ setup?: (hearing: HearingOptions) => void; look?: (script: CaptionScript) => void }>({});


  useEffect(() => {
    if (off) return;
    let live = true;
    (async () => {
      setPhase("loading");
      setError("");
      // /editor without an id would ask for the project list instead of a project.
      if (!id) throw new Error("This project doesn't exist.");
      let payload: ProjectPayload = await getProject(id);
      const { status } = payload.project;
      if (live) setDuration(payload.project.duration);
      if (status === "uploading") throw new Error("This upload didn't finish. Please upload the video again from Home.");
      if (status === "failed" && attempt === 0)
        throw new Error(payload.project.error ?? "We couldn't make captions for this video.");
      if (status === "uploaded" || status === "failed") {
        // Nothing is spent until the user has picked the language and pressed Make captions.
        setPhase("setup");
        const hearing = await new Promise<HearingOptions>((resolve) => (answer.current.setup = resolve));
        if (!live) return;
        setTranscribeSince(Date.now());
        setPhase("transcribing");
        try {
          const result = await transcribeProject(id, hearing);
          payload = { project: result.project, transcript: result.transcript };
        } catch (reason) {
          // Another open (a second tab, or React starting this effect twice in dev) may have
          // started it first. Then just wait for that run below instead of failing.
          payload = await getProject(id);
          if (payload.project.status !== "transcribing" && payload.project.status !== "ready") throw reason;
        } finally {
          onCreditsChanged();
        }
      }
      while (payload.project.status === "transcribing") {
        // Opened mid-way (a reload, another tab): the estimate counts from when the server started.
        setTranscribeSince((since) => since || payload.project.updatedAt || Date.now());
        setPhase("transcribing");
        // Watched live: the server marks the project the moment ElevenLabs is done. Every 30 s it is also asked
        // directly, as a safety net; the server itself fails a run that went quiet (server/lifecycle.ts).
        await statusMoved(id, 30_000);
        if (!live) return;
        // A blip in the connection is retried.
        for (let tries = 0; ; tries++) {
          try {
            payload = await getProject(id);
            break;
          } catch (reason) {
            if (tries >= 5 || !live) throw reason;
            await wait(RETRY_MS);
          }
        }
      }
      if (payload.project.status !== "ready")
        throw new Error(payload.project.error ?? "We couldn't make captions for this video.");

      if (!live) return;
      // wowclip: every clip opens fresh from its transcript; nothing is saved between visits.
      await open({ project: payload.project, draft: null, transcript: payload.transcript });
      if (!live) return;
      setPhase("ready");
    })().catch((reason: unknown) => {
      if (!live) return;
      setPhase("error");
      setError(reason instanceof Error ? reason.message : "This project couldn't be opened.");
    });
    return () => {
      live = false;
    };
    // `open` and `onCreditsChanged` are stable callbacks from the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  return {
    phase,
    error,
    saveState,
    heard,
    duration,
    transcribeSince,
    retry: () => setAttempt((n) => n + 1),
    start: (hearing: HearingOptions) => answer.current.setup?.(hearing),
    pickLook: (script: CaptionScript) => answer.current.look?.(script),
  };
}
