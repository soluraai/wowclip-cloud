"use client";

import { useEffect, useRef, useState } from "react";

import { getRender } from "../../lib/api";
import type { Clip, Render } from "../../lib/types";
import { Icon } from "../shared/Icon";
import { LiveLog } from "../shared/LiveLog";
import { StepList } from "../shared/StepList";

// How full a worker looks while it renders. AWS only tells us when a piece starts and when it is uploaded,
// so the liquid rises on its own (fast, then slower) and fills to the top the moment the piece is done.
const RISE_SECONDS = 5;
const MAX_WHILE_RENDERING = 0.9;

function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

function mainLambdaText(render: Render, workers: number) {
  const step = (key: string) => render.steps.find((item) => item.key === key)?.state;
  if (render.status === "failed") return "Stopped: the render failed";
  if (render.status === "done") return "Joined every piece, added the audio and uploaded the reel to S3";
  if (step("join") === "running") return `Joining ${workers} pieces and adding the audio`;
  if (step("frames") === "running") return `Watching ${workers} workers draw their frames`;
  if (workers) return `Splitting the frames and starting ${workers} workers`;
  return "Reading job.json from S3";
}

function Wave() {
  return (
    <svg className="liquid-wave" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 6 Q15 0 30 6 T60 6 T90 6 T120 6 V12 H0 Z" />
    </svg>
  );
}

// The render on AWS: the main Lambda on top (always on while the reel is made) hands a range of frames to every worker
// Lambda below it. Each worker is a glass that fills with green liquid as its frames are drawn.
function LambdaGrid({ render }: { render: Render }) {
  const lambdas = render.lambdas;
  const working = render.status === "rendering";
  const now = useNow(working);
  const startedAt = useRef<Map<number, number>>(new Map());

  const pieces = lambdas?.pieces ?? Array.from({ length: 24 }, () => ({ start: 0, count: 0, frames: 0, state: "queued" as const }));
  const running = pieces.filter((piece) => piece.state === "rendering").length;
  const done = pieces.filter((piece) => piece.state === "done").length;
  const percent = lambdas ? Math.round((lambdas.framesDone / Math.max(1, lambdas.framesTotal)) * 100) : 0;

  function fillOf(index: number, state: string) {
    if (state === "done") return 1;
    if (state !== "rendering") return 0;
    if (!startedAt.current.has(index)) startedAt.current.set(index, now);
    const seconds = (now - (startedAt.current.get(index) ?? now)) / 1000;
    return MAX_WHILE_RENDERING * (1 - Math.exp(-seconds / RISE_SECONDS));
  }

  return (
    <div className="lambda-panel">
      <div className="lambda-stats">
        <div><strong>{lambdas ? lambdas.count : "–"}</strong><span>worker Lambdas</span></div>
        <div><strong>{running}</strong><span>rendering now</span></div>
        <div><strong>{done}</strong><span>pieces uploaded</span></div>
        <div><strong>{lambdas ? lambdas.framesDone.toLocaleString() : 0}</strong><span>of {lambdas ? lambdas.framesTotal.toLocaleString() : "…"} frames</span></div>
      </div>

      <div className={`lambda-main ${working ? "active" : render.status}`}>
        <span className="lambda-main-core">λ</span>
        <div>
          <strong>Main Lambda</strong>
          <span>{mainLambdaText(render, lambdas?.count ?? 0)}</span>
        </div>
        <span className="lambda-main-state">{working ? "active" : render.status === "done" ? "finished" : "stopped"}</span>
      </div>
      <div className={`lambda-bus${working ? " active" : ""}`} aria-hidden="true" />

      <div className={`lambda-grid${lambdas ? "" : " ghost"}`}>
        {pieces.map((piece, index) => {
          const fill = fillOf(index, piece.state);
          return (
            <div
              key={index}
              className={`lambda-cell ${piece.state}`}
              title={lambdas ? `Worker #${index + 1} · frames ${piece.start}–${piece.start + piece.count - 1}` : undefined}
            >
              <div className="lambda-liquid" style={{ height: `${fill * 100}%` }}>
                {piece.state === "rendering" && <Wave />}
                {piece.state === "rendering" && <><i className="bubble one" /><i className="bubble two" /></>}
              </div>
              <span className="lambda-num">{String(index + 1).padStart(2, "0")}</span>
              {lambdas && piece.state !== "queued" && (
                <span className="lambda-pct">
                  {piece.state === "done" ? "✓" : `${Math.round(fill * 100)}%`}
                  <small>{piece.state === "done" ? piece.count : Math.round(fill * piece.count)}/{piece.count} frames</small>
                </span>
              )}
              {lambdas && piece.state === "queued" && <span className="lambda-pct"><small>{piece.count} frames</small></span>}
            </div>
          );
        })}
      </div>

      <div className="lambda-progress">
        <div style={{ width: `${percent}%` }} />
      </div>
      <p className="lambda-legend">
        <span className="legend-chip main" /> main Lambda
        <span className="legend-chip queued" /> waiting
        <span className="legend-chip rendering" /> drawing frames
        <span className="legend-chip done" /> piece uploaded
        <b>{percent}%</b>
      </p>
    </div>
  );
}

type Props = {
  renderId: string;
  clip: Clip;
  styleName: string;
  onBack: () => void;
  backLabel: string;
};

// The last step of making a reel: follow the render live, then watch and download the finished reel.
export function RenderView({ renderId, clip, styleName, onBack, backLabel }: Props) {
  const [render, setRender] = useState<Render | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const latest = await getRender(renderId);
        if (stopped) return;
        setRender(latest);
        if (latest.status === "done" || latest.status === "failed") return;
      } catch (checkError) {
        if (!stopped) setError((checkError as Error).message);
        return;
      }
      timer = setTimeout(check, 700);
    }
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [renderId]);

  if (error) return <div className="message-box error">Lost the render: {error}</div>;
  if (!render) return <div className="picker-loading"><span className="spinner" /> Connecting to the render…</div>;

  const working = render.status === "rendering";
  const result = render.result;

  return (
    <div className="render">
      <div className="render-main">
        <div className="render-head">
          <div>
            <p className="eyebrow">{working ? "Rendering on AWS Lambda" : render.status === "done" ? "Reel ready" : "Render failed"}</p>
            <h3>{clip.title}</h3>
            <p className="render-style">{styleName} style</p>
          </div>
          <div className="render-clock">
            <strong>{render.seconds.toFixed(1)}</strong>
            <span>seconds</span>
          </div>
        </div>

        <StepList steps={render.steps} />
        <LambdaGrid render={render} />
        {render.error && <div className="message-box error">{render.error}</div>}
        <LiveLog lines={render.log} working={working} title="What the server and AWS are doing" />
      </div>

      <div className="render-side">
        {result ? (
          <>
            <video className="render-video" src={result.watchUrl} controls autoPlay playsInline />
            <a className="cta" href={result.downloadUrl} download={result.fileName}>
              <Icon name="download" size={15} /> Download reel
            </a>
            <p className="render-file">
              1080×1920 · {Math.round(result.duration)}s · {result.sizeMb} MB
            </p>
            <a className="render-history" href="/history" target="_blank" rel="noreferrer">
              <Icon name="cloud" size={13} /> Saved to your render history in S3
            </a>
          </>
        ) : (
          <div className="render-waiting">
            {working ? <><span className="spinner" /> Rendering…</> : "No reel"}
          </div>
        )}
        <button type="button" className="ghost-button wide" onClick={onBack} disabled={working}>
          <Icon name="edit" size={13} /> {backLabel}
        </button>
      </div>
    </div>
  );
}
