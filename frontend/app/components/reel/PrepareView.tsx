"use client";

import { useEffect, useState } from "react";

import { getPreparation, type Preparation } from "../../lib/api";
import type { Clip, Step } from "../../lib/types";
import { Icon } from "../shared/Icon";
import { LiveLog } from "../shared/LiveLog";

type Props = { jobId: string; clip: Clip; onReady: () => void };

const WHAT: Record<string, { title: string; note: string; icon: "download" | "spark" | "film" | "cloud" }> = {
  download: { title: "Download the clip", note: "ClipsCutter cuts it out of YouTube in 1080p", icon: "download" },
  transcribe: { title: "Listen to every word", note: "Deepgram times each word for the captions", icon: "spark" },
  speaker: { title: "Follow the speaker", note: "MediaPipe + ffmpeg on a Modal L4 GPU crop it to 9:16", icon: "film" },
  upload: { title: "Save to S3", note: "so the AWS Lambdas can render it", icon: "cloud" },
};

function StepCard({ step }: { step: Step | undefined; }) {
  if (!step) return null;
  const what = WHAT[step.key];
  return (
    <div className={`prep-step ${step.state}`}>
      <span className="prep-icon">
        {step.state === "done" ? <Icon name="check" size={18} /> : step.state === "running" ? <span className="spinner" /> : <Icon name={what.icon} size={18} />}
      </span>
      <span className="prep-text">
        <b>{what.title}</b>
        <small>{what.note}</small>
      </span>
      <span className="prep-time">
        {step.state === "waiting" ? "waiting" : step.state === "failed" ? "failed" : `${(step.seconds ?? 0).toFixed(1)}s`}
      </span>
    </div>
  );
}

// The step between choosing a clip and the caption editor: the server gets the clip ready, one stage after another.
// The words and the speaker crop run at the same time, so they are drawn side by side.
// When everything is done, the caption editor opens by itself.
export function PrepareView({ jobId, clip, onReady }: Props) {
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const latest = await getPreparation(jobId, clip.id);
        if (stopped) return;
        setPreparation(latest);
        if (latest.status === "ready") {
          timer = setTimeout(onReady, 700);
          return;
        }
        if (latest.status === "failed") return;
      } catch (checkError) {
        if (!stopped) setError((checkError as Error).message);
      }
      timer = setTimeout(check, 700);
    }
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, clip.id, onReady]);

  const steps = preparation?.steps ?? [];
  const find = (key: string) => steps.find((step) => step.key === key);
  const ready = preparation?.status === "ready";
  const failed = preparation?.status === "failed";

  return (
    <div className="prep">
      <header className="prep-head">
        <p className="eyebrow">Getting your clip ready</p>
        <h3>{clip.title}</h3>
      </header>

      <div className="prep-flow">
        <StepCard step={find("download")} />
        <div className="prep-fork">
          <span className="prep-fork-label">at the same time</span>
          <StepCard step={find("transcribe")} />
          <StepCard step={find("speaker")} />
        </div>
        <StepCard step={find("upload")} />
        <div className={`prep-step final ${ready ? "done" : "waiting"}`}>
          <span className="prep-icon">{ready ? <Icon name="check" size={18} /> : <Icon name="edit" size={18} />}</span>
          <span className="prep-text">
            <b>Open the caption editor</b>
            <small>{ready ? "Opening…" : "as soon as the clip and its words are ready"}</small>
          </span>
        </div>
      </div>

      {!preparation && !error && <p className="prep-wait"><span className="spinner" /> Starting…</p>}
      {(error || failed) && <div className="message-box error">{error ?? preparation?.error ?? "The clip could not be prepared."}</div>}
      {preparation && preparation.log.length > 0 && <LiveLog lines={preparation.log} working={!ready && !failed} title="What the server is doing" />}
    </div>
  );
}
