"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  quoteRender,
  renderHistory,
  renderStatus,
  startRender,
  type RenderItem,
  type RenderQuote,
  type RenderView,
} from "../projects/api";
import { watchMine } from "../projects/live";
import { creditLabel, formatCredits } from "../projects/credits";
import LogoLoader from "./LogoLoader";
import { BUY_URL } from "../links";
import s from "./ExportDialog.module.css";

const svg = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{path}</svg>
);
const ICONS = {
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  alert: svg(<><path d="M12 8v5" /><path d="M12 16.5v.01" /><circle cx="12" cy="12" r="9" /></>),
  download: svg(<><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 20h14" /></>),
  retry: svg(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v5h5" /></>),
  film: svg(<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></>),
  close: svg(<path d="M6 6l12 12M18 6 6 18" />),
  home: svg(<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4v-9.5Z" />),
  chevron: svg(<path d="M6 9.5l6 6 6-6" />),
  spark: svg(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />),
};

export type ExportState = { phase: "idle" | "rendering" | "ready" | "failed"; percent: number };

type Phase = "loading" | "review" | "rendering" | "ready" | "failed";

const running = (render: RenderView | null) => !!render && (render.status === "queued" || render.status === "rendering" || render.status === "finishing");

/**
 * Where the export should be, 0-1. The Lambdas don't report while they work, so this follows the time spent against
 * the server's estimate for this style and length, slowing as it nears the end; the real finish jumps it to 100%.
 */
function targetOf(render: RenderView | null, now: number) {
  if (!render) return { at: 0, cap: 0.06 };
  if (render.status === "ready") return { at: 1, cap: 1 };
  if (!render.startedAt || !render.eta) return { at: 0.04, cap: 0.12 };
  const t = Math.max(0, (now - render.startedAt) / 1000 / render.eta);
  return { at: 0.95 * (1 - Math.exp(-2.2 * t)), cap: 0.96 };
}

/**
 * A progress number that only moves forward and moves smoothly: it eases toward what the server last said and,
 * between reports, creeps a little ahead (never past the stage's ceiling), so the bar never jumps or stalls.
 */
function useSmoothProgress(render: RenderView | null, active: boolean) {
  const [shown, setShown] = useState(0);
  const latest = useRef(render);
  latest.current = render;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setShown((value) => {
        const { at, cap } = targetOf(latest.current, Date.now());
        if (at >= 1) return Math.min(1, value + Math.max(0.04, (1 - value) * 0.35));
        const toward = at > value ? (at - value) * 0.08 : 0;
        const creep = value < Math.min(cap, at + 0.07) ? 0.0012 : 0;
        return Math.min(Math.max(value, cap), value + Math.max(toward, creep));
      });
    }, 100);
    return () => clearInterval(timer);
  }, [active]);
  return { shown, reset: () => setShown(0) };
}

const STAGES = [
  { label: "Preparing", note: "Getting the render machines ready" },
  { label: "Drawing captions", note: "Every frame, in full quality" },
  { label: "Finishing", note: "Joining the pieces into one MP4" },
];

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const when = (ms: number) => {
  const date = new Date(ms);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
};

/**
 * Export, in a large card:
 *   review     one price (free, or the credits a changed export costs with this style), the balance before and
 *              after, a short "how pricing works", and past exports with their download links
 *   rendering  a smooth bar with the stage, time spent and left; closing never stops it
 *   ready      the download
 * The card stays mounted while closed so the editor's Export button can show progress.
 */
export default function ExportDialog({ projectId, open, onClose, request, title, styleName, credits, onCreditsChanged, onState }: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Builds the render request from the editor's current state. */
  request: () => object;
  title: string;
  styleName: string;
  credits: number | null;
  onCreditsChanged: () => void;
  onState?: (state: ExportState) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [quote, setQuote] = useState<RenderQuote | null>(null);
  const [render, setRender] = useState<RenderView | null>(null);
  const [history, setHistory] = useState<RenderItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const requestRef = useRef(request);
  requestRef.current = request;
  const sent = useRef<object | null>(null);

  const active = running(render);
  const smooth = useSmoothProgress(render, active || render?.status === "ready");
  const percent = Math.floor(smooth.shown * 100);

  // Opening the card looks at what the editor shows now: free, reused, or what it costs.
  const review = useCallback(async () => {
    setError(null);
    setPhase((current) => (current === "rendering" ? current : "loading"));
    try {
      const body = requestRef.current();
      sent.current = body;
      const [nextQuote, past] = await Promise.all([quoteRender(projectId, body), renderHistory(projectId)]);
      setQuote(nextQuote);
      setHistory(past.history);
      const latest = past.render;
      // The same version is already rendering: show its progress instead of asking again.
      if (latest && latest.id === nextQuote.id && running(latest)) {
        setRender(latest);
        setStartedAt((at) => at || Date.now());
        setPhase("rendering");
      } else if (latest && latest.id === nextQuote.id && latest.status === "ready") {
        setRender(latest);
        setPhase("ready");
      } else {
        if (latest && running(latest)) setRender(latest);
        setPhase("review");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn't check this export.");
      setPhase("failed");
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void review();
  }, [open, review]);

  // An export started earlier (before a reload, or in another tab) shows on the Export button right away.
  useEffect(() => {
    let live = true;
    renderStatus(projectId).then((latest) => {
      if (!live || !latest || !running(latest)) return;
      setRender((current) => current ?? latest);
      setStartedAt((at) => at || Date.now());
      setPhase((current) => (current === "loading" ? "rendering" : current));
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const next = await startRender(projectId, sent.current ?? requestRef.current());
      smooth.reset();
      setRender(next);
      setStartedAt(Date.now());
      setPhase(next.status === "ready" ? "ready" : next.status === "failed" ? "failed" : "rendering");
      if (quote?.cost) onCreditsChanged();
      void renderHistory(projectId).then((past) => setHistory(past.history), () => undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn't start this export.");
    } finally {
      setStarting(false);
    }
    // `smooth.reset` is a fresh closure each render; it only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, quote, onCreditsChanged]);

  // While an export runs, open or closed (so the Export button can show its progress): the job is watched live in
  // Firestore, and the server is asked once it changes. As a safety net it is also asked once the estimate has passed,
  // then every 30 s (every 8 s when live updates aren't available); each ask also settles a job whose Lambda went quiet.
  const renderId = render?.id;
  const began = render?.startedAt;
  const eta = render?.eta;
  useEffect(() => {
    if (!active || !renderId) return;
    let stopped = false;
    let asking = false;
    let missed = 0;
    let every = 30_000;
    let timer = 0;
    const check = async () => {
      if (asking || stopped) return;
      asking = true;
      try {
        const next = await renderStatus(projectId);
        missed = 0;
        if (stopped) return;
        if (!next) {
          // The export's record is gone (the project was deleted in another tab).
          setRender(null);
          setPhase("failed");
          setError("This export is no longer available.");
          return;
        }
        setRender(next);
        if (next.status === "ready") {
          setPhase("ready");
          // Not tied to `stopped`: "ready" ends this watch at once, and the list must still show the new download.
          void renderHistory(projectId).then((past) => setHistory(past.history), () => undefined);
        } else if (next.status === "failed") {
          setPhase("failed");
          setError(next.error ?? "This export failed.");
          onCreditsChanged();
        }
      } catch {
        // Several misses in a row: the connection is gone. The export carries on on our side and shows in Exports.
        if (++missed >= 4 && !stopped) {
          setPhase("failed");
          setError("We lost touch with the server. Your export keeps going: check Exports in a few minutes.");
        }
      } finally {
        asking = false;
      }
    };
    const schedule = (ms: number) => {
      timer = window.setTimeout(async () => {
        await check();
        if (!stopped) schedule(every);
      }, ms);
    };
    const stopWatching = watchMine(`projects/${projectId}/renders/${renderId}`,
      (data) => { if (!data || data.status !== "rendering") void check(); },
      () => { every = 8_000; });
    schedule(began && eta ? Math.max(10_000, began + eta * 1000 + 10_000 - Date.now()) : 15_000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stopWatching();
    };
  }, [active, renderId, began, eta, projectId, onCreditsChanged]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    onState?.({
      phase: active ? "rendering" : render?.status === "ready" ? "ready" : render?.status === "failed" ? "failed" : "idle",
      percent,
    });
  }, [active, render?.status, percent, onState]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  if (!open) return null;
  const stage = smooth.shown < 0.12 ? 0 : smooth.shown < 0.85 ? 1 : 2;
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
  const left = smooth.shown > 0.18 && elapsed > 8 ? Math.max(5, Math.round(((elapsed * (1 - smooth.shown)) / smooth.shown) / 5) * 5) : null;
  const short = credits !== null && !!quote && quote.cost > credits + 1e-9;
  const otherRunning = phase === "review" && running(render) && render?.id !== quote?.id;

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div className={s.card} role="dialog" aria-modal="true" aria-label="Export video" onClick={(event) => event.stopPropagation()}>
        <header className={s.top}>
          <div className={s.heading}>
            <h2 className={s.title}>Export video</h2>
            <p className={s.project} title={title}>{title || "Your video"}</p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close">{ICONS.close}</button>
        </header>

        <div className={s.body}>
          {phase === "loading" && (
            <div className={s.center}><LogoLoader size={44} label="Checking your export…" /></div>
          )}

          {phase === "review" && quote && (() => {
            const free = quote.reuse || quote.first;
            const cost = free ? 0 : quote.cost;
            const why = quote.reuse ? "Nothing changed since your last export."
              : quote.first ? "Your first export is included with your captions."
                : `You changed this video since its first export. ${styleName} costs ${quote.rate} credits for every 60 seconds of video to export again.`;
            return (
              <section className={s.review}>
                <p className={s.spec}>{clock(quote.seconds)} video, {quote.width} × {quote.height}, {styleName}</p>

                <div className={s.price} data-free={free || undefined}>
                  <strong>{free ? "Free" : formatCredits(cost)}</strong>
                  {!free && <span>{cost === 1 ? "credit" : "credits"}</span>}
                </div>
                <p className={s.why}>{why}</p>

                {credits !== null && (
                  <div className={s.balance} data-tone={short ? "short" : undefined}>
                    <span>Your credits</span>
                    <b>{formatCredits(credits)}{!free && !short && <> <i aria-hidden>→</i> {formatCredits(credits - cost)}</>}</b>
                  </div>
                )}
                {short && (
                  <p className={s.error}>
                    You need {formatCredits(cost - (credits ?? 0))} more credits for this export.{" "}
                    <a href={BUY_URL}>Buy credits</a>
                  </p>
                )}

                {otherRunning && (
                  <p className={s.notice}>An earlier version is still exporting ({Math.round(((render?.frames ?? 0) / (render?.total || 1)) * 100)}%). Starting this one won&apos;t stop it.</p>
                )}
                {error && <p className={s.error} role="alert">{error}</p>}

                <div className={s.actions}>
                  <button type="button" className={s.secondary} onClick={onClose}>Cancel</button>
                  <button type="button" className={s.primary} onClick={() => void start()} disabled={starting || short}>
                    {ICONS.film}{starting ? "Starting…" : quote.reuse ? "Get video" : free ? "Export video" : `Export for ${creditLabel(cost)}`}
                  </button>
                </div>

                <details className={s.rules}>
                  <summary>How export pricing works</summary>
                  <dl>
                    <div><dt>First export</dt><dd>Included with your captions</dd></div>
                    <div><dt>Same version again</dt><dd>Free</dd></div>
                    <div><dt>After you change something</dt><dd>Depends on the style. {styleName}: {quote.rate} credits for every 60 seconds</dd></div>
                    <div><dt>If an export fails</dt><dd>Your credits come back</dd></div>
                  </dl>
                  <p>1 credit = 1 second of video.</p>
                </details>
              </section>
            );
          })()}

          {phase === "rendering" && (
            <section className={s.progress}>
              <div className={s.ring} style={{ "--p": smooth.shown } as CSSProperties}>
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle cx="60" cy="60" r="52" className={s.track} />
                  <circle cx="60" cy="60" r="52" className={s.fill} pathLength={1} />
                </svg>
                <div className={s.ringLabel}>
                  <strong>{percent}<small>%</small></strong>
                </div>
              </div>
              <div className={s.stageNow}>
                <strong>{STAGES[stage].label}</strong>
                <span>{STAGES[stage].note}</span>
              </div>
              <div className={s.times}>
                <span>Time spent <b>{clock(elapsed)}</b></span>
                <span>{left ? <>About <b>{left < 60 ? `${left} s` : clock(left)}</b> left</> : "Working out time left…"}</span>
              </div>
              <div className={s.actions}>
                <Link href="/" className={s.secondary}>{ICONS.home}Go to Home</Link>
                <button type="button" className={s.primary} onClick={onClose}>Keep editing</button>
              </div>
            </section>
          )}

          {phase === "ready" && render?.status === "ready" && (
            <section className={s.ready}>
              <span className={s.badge}>{ICONS.check}</span>
              <div className={s.readyText}>
                <h3>Your video is ready</h3>
                <p>
                  MP4{render.mb ? ` · ${render.mb.toFixed(1)} MB` : ""}
                  {render.expiresAt ? ` · link works until ${new Date(render.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                </p>
              </div>
              <a className={s.primary} href={render.url} download>{ICONS.download}Download</a>
            </section>
          )}

          {phase === "failed" && (
            <section className={s.done}>
              <span className={s.badge} data-tone="bad">{ICONS.alert}</span>
              <h3>{render?.status === "expired" ? "This export has expired" : "Export didn't finish"}</h3>
              <p>{error ?? "Something went wrong."} Any credits it used were given back.</p>
              <button type="button" className={`${s.primary} ${s.wide}`} onClick={() => void review()}>{ICONS.retry}Try again</button>
            </section>
          )}

          {history.length > 0 && phase !== "loading" && (
            <section className={s.history}>
              <h4>Past exports <span>{history.length}</span></h4>
              <ul>
                {history.map((item) => {
                  const live = item.status === "queued" || item.status === "rendering" || item.status === "finishing";
                  const current = render?.id === item.id;
                  const expanded = openRows[item.id] ?? (live && current);
                  const label = live ? "Rendering" : item.status === "ready" ? "Ready" : item.status === "expired" ? "Expired" : "Failed";
                  const until = new Date(item.expiresAt ?? 0).toLocaleDateString(undefined, { day: "numeric", month: "short" });
                  return (
                    <li key={item.id} data-open={expanded}>
                      <div className={s.row}>
                        <div className={s.when}>
                          <strong>{when(item.createdAt)}</strong>
                          <span>{live && current ? `${percent}% · ${STAGES[stage].label}` : label}{item.paid ? ` · ${creditLabel(item.paid)}` : ""}</span>
                        </div>
                        {item.status === "ready" && item.url && (
                          <a className={s.rowButton} href={item.url} download>{ICONS.download}Download</a>
                        )}
                        <button
                          type="button"
                          className={s.arrow}
                          aria-expanded={expanded}
                          aria-label={expanded ? "Hide details" : "Show details"}
                          onClick={() => setOpenRows((rows) => ({ ...rows, [item.id]: !expanded }))}
                        >{ICONS.chevron}</button>
                      </div>
                      {expanded && (
                        <div className={s.detail}>
                          {live && current && (
                            <div className={s.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                              <i style={{ width: `${percent}%` }} />
                            </div>
                          )}
                          <p>
                            {live ? (current ? STAGES[stage].note : "Rendering in the background.")
                              : item.status === "ready" ? `${item.mb ? `${item.mb.toFixed(1)} MB · ` : ""}link works until ${until}`
                                : item.status === "expired" ? "This link expired after 7 days."
                                  : "It didn't finish, and the credits were returned."}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
